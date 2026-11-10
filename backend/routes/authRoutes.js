const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
  registerUser,
  findUserByUsername,
  isUsernameTaken,
  isEmailTaken,
  findUserForLogin,
  updateVehicleType,
  linkDeviceToUser,
  unlinkDeviceFromUser,
} = require("../services/authService");

const { authenticateToken } = require("../middleware/authMiddleware");

const {
  getVehicleForDevice,
  validateDeviceId,
} = require("../services/deviceRegistry");
const {
  getVehiclesForDashboard,
  setVehicleType,
} = require("../services/vehicleState");
const { notifyDeviceChanged } = require("../socket/socketServer");
const { disconnectDevice } = require("../socket/vehicleWebSocketServer");
const { validateRegistration } = require("../utils/validateAccount");
const {
  VEHICLE_TYPE_ERROR,
  isValidVehicleType,
} = require("../utils/vehicleTypes");
const { createRateLimiter, getClientIp } = require("../utils/rateLimit");

const router = express.Router();

const HOUR_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Postgres error for a value that must be unique
const UNIQUE_VIOLATION = "23505";

const accountsByAddress = createRateLimiter({ max: 10, windowMs: HOUR_MS });
const accountsOverall = createRateLimiter({ max: 100, windowMs: HOUR_MS });

// Only failed logins count, so normal use is never limited
const failedLoginsByAddress = createRateLimiter({
  max: 20,
  windowMs: LOGIN_WINDOW_MS,
});
const failedLoginsByUsername = createRateLimiter({
  max: 10,
  windowMs: LOGIN_WINDOW_MS,
});

// Only for simulators and tests. Real accounts go through /register/start.
router.post("/register", async (req, res) => {
  try {
    if (process.env.ALLOW_TEST_SIGNUP !== "true") {
      return res.status(410).json({
        message: "Please update the app to create an account.",
      });
    }

    const address = getClientIp(req);

    if (
      accountsByAddress.isBlocked(address) ||
      accountsOverall.isBlocked("all")
    ) {
      return res.status(429).json({
        message: "Too many new accounts. Try again later.",
      });
    }

    const account = validateRegistration(req.body ?? {});

    if (account.error) {
      return res.status(400).json({
        message: account.error,
      });
    }

    const { username, email, password, vehicleType } = account;

    if (await isUsernameTaken(username)) {
      return res.status(409).json({
        message: "Username already exists.",
      });
    }

    if (await isEmailTaken(email)) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await registerUser(username, email, passwordHash, vehicleType);

    accountsByAddress.record(address);
    accountsOverall.record("all");

    return res.status(201).json({
      message: "Account created successfully.",
      user: {
        username: user.username,
        email: user.email,
        vehicleType: user.vehicle_type,
      },
    });
  } catch (error) {
    // Two signups for the same name or email at the same moment
    if (error.code === UNIQUE_VIOLATION) {
      return res.status(409).json({
        message: "That username or email already exists.",
      });
    }

    console.error("[Auth] Registration failed:", error.message);

    return res.status(500).json({
      message: "Failed to create account.",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username ||
      !password
    ) {
      return res.status(400).json({
        message: "Username and password are required.",
      });
    }

    const address = getClientIp(req);
    const usernameKey = username.trim().toLowerCase();

    if (
      failedLoginsByAddress.isBlocked(address) ||
      failedLoginsByUsername.isBlocked(usernameKey)
    ) {
      return res.status(429).json({
        message: "Too many failed attempts. Try again in 15 minutes.",
      });
    }

    const user = await findUserForLogin(username.trim());

    const passwordMatches =
      user && (await bcrypt.compare(password, user.password_hash));

    if (!passwordMatches) {
      failedLoginsByAddress.record(address);
      failedLoginsByUsername.record(usernameKey);

      return res.status(401).json({
        message: "Invalid username or password.",
      });
    }

    const token = jwt.sign(
      {
        username: user.username,
        sv: user.session_version,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      },
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        username: user.username,
        email: user.email,
        vehicleType: user.vehicle_type,
      },
    });
  } catch (error) {
    console.error("[Auth] Login failed:", error.message);

    return res.status(500).json({
      message: "Login failed.",
    });
  }
});

router.post("/device", authenticateToken, async (req, res) => {
  try {
    // The same rule the phone's connection must pass later
    const validation = validateDeviceId(req.body?.deviceId);

    if (!validation.valid) {
      return res.status(400).json({
        message: "Device ID is required.",
      });
    }

    const normalizedDeviceId = validation.normalized;

    const username = req.user.username;

    if (!username) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    const user = await findUserByUsername(username);

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const previousDeviceId = user.device_id;

    const { user: updatedUser, previousOwner } = await linkDeviceToUser(
      user.id,
      normalizedDeviceId,
    );

    // Logging in on a new phone moves the account to it
    if (previousDeviceId && previousDeviceId !== normalizedDeviceId) {
      disconnectDevice(previousDeviceId);
    }

    // This phone may still be connected under its previous account
    if (previousOwner) {
      disconnectDevice(normalizedDeviceId);
      notifyDeviceChanged(previousOwner);
    }

    if (previousDeviceId !== normalizedDeviceId) {
      notifyDeviceChanged(updatedUser.username);
    }

    console.log(
      `[Auth] Device associated: ${updatedUser.username} → ${updatedUser.device_id}`,
    );

    return res.status(200).json({
      message: "Device associated successfully.",
      user: {
        username: updatedUser.username,
        email: updatedUser.email,
      },
      deviceId: updatedUser.device_id,
    });
  } catch (error) {
    console.error("[Auth] Device association failed:", error.message);

    return res.status(500).json({
      message: "Failed to associate device.",
    });
  }
});

// Logging out on a phone frees it for the next login
router.post("/device/unlink", authenticateToken, async (req, res) => {
  try {
    const validation = validateDeviceId(req.body?.deviceId);

    if (!validation.valid) {
      return res.status(400).json({
        message: "Device ID is required.",
      });
    }

    const user = req.user.username
      ? await findUserByUsername(req.user.username)
      : null;

    if (!user) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    const unlinked = await unlinkDeviceFromUser(user.id, validation.normalized);

    if (unlinked) {
      disconnectDevice(validation.normalized);
      notifyDeviceChanged(user.username);
    }

    res.json({
      message: "Device unlinked.",
    });
  } catch (error) {
    console.error("[Auth] Device unlink failed:", error.message);

    res.status(500).json({
      message: "Failed to unlink device.",
    });
  }
});

// The driver's saved details, as a phone that's already logged in may not have them
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = req.user.username
      ? await findUserByUsername(req.user.username)
      : null;

    if (!user) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    res.json({
      user: {
        username: user.username,
        email: user.email,
        vehicleType: user.vehicle_type,
      },
    });
  } catch (error) {
    console.error("[Auth] Profile lookup failed:", error.message);

    res.status(500).json({
      message: "Failed to load your details.",
    });
  }
});

router.put("/vehicle-type", authenticateToken, async (req, res) => {
  try {
    const vehicleType = req.body?.vehicleType;

    if (!isValidVehicleType(vehicleType)) {
      return res.status(400).json({
        message: VEHICLE_TYPE_ERROR,
      });
    }

    const user = req.user.username
      ? await findUserByUsername(req.user.username)
      : null;

    if (!user) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    await updateVehicleType(user.id, vehicleType);

    // Shows on the map straight away if this driver's phone is connected
    const vehicleId = user.device_id
      ? getVehicleForDevice(user.device_id)
      : null;

    if (vehicleId) {
      setVehicleType(vehicleId, vehicleType);
    }

    res.json({ vehicleType });
  } catch (error) {
    console.error("[Auth] Vehicle type update failed:", error.message);

    res.status(500).json({
      message: "Failed to save your vehicle type.",
    });
  }
});

// The logged-in driver's own vehicle
router.get("/vehicle", authenticateToken, async (req, res) => {
  try {
    const user = req.user.username
      ? await findUserByUsername(req.user.username)
      : null;

    const vehicleId = user?.device_id
      ? getVehicleForDevice(user.device_id)
      : null;

    const vehicle = getVehiclesForDashboard().find(
      (candidate) => candidate.vehicleId === vehicleId,
    );

    if (!vehicle) {
      return res.status(404).json({
        message: "No vehicle is connected to this account.",
      });
    }

    res.json({ vehicle });
  } catch (error) {
    console.error("[Auth] Vehicle lookup failed:", error.message);

    res.status(500).json({
      message: "Failed to load your vehicle.",
    });
  }
});

module.exports = router;
