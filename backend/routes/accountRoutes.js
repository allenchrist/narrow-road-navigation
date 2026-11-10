const bcrypt = require("bcrypt");
const express = require("express");

const {
  deleteUser,
  findUserByEmail,
  findUserByUsername,
  isEmailTaken,
  isUsernameTaken,
  registerUser,
  updatePassword,
} = require("../services/authService");
const {
  CODE_LIFETIME_MINUTES,
  checkCode,
  createCode,
  deleteCode,
} = require("../services/emailCodeService");
const { isEmailConfigured, sendEmail } = require("../services/emailService");
const { authenticateToken } = require("../middleware/authMiddleware");
const { disconnectUser } = require("../socket/socketServer");
const { disconnectDevice } = require("../socket/vehicleWebSocketServer");
const { createRateLimiter, getClientIp } = require("../utils/rateLimit");
const {
  validatePassword,
  validateRegistration,
} = require("../utils/validateAccount");

const router = express.Router();

const HOUR_MS = 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const UNIQUE_VIOLATION = "23505";

const SIGNUP_PURPOSE = "signup";
const PASSWORD_PURPOSE = "password";

const FORGOT_REPLY = "If that email has an account, we've sent it a code.";

const NO_EMAIL_MESSAGE =
  "Email isn't set up on the server yet, so accounts can't be created.";

const signupsByAddress = createRateLimiter({ max: 10, windowMs: HOUR_MS });
const signupsOverall = createRateLimiter({ max: 100, windowMs: HOUR_MS });
const emailsByAddress = createRateLimiter({ max: 10, windowMs: HOUR_MS });
const emailsToAddress = createRateLimiter({ max: 5, windowMs: HOUR_MS });
const failedCodesByAddress = createRateLimiter({
  max: 20,
  windowMs: FIFTEEN_MINUTES_MS,
});
const failedDeletesByUser = createRateLimiter({
  max: 5,
  windowMs: FIFTEEN_MINUTES_MS,
});

const isText = (value) => typeof value === "string" && value.trim().length > 0;

const codeEmail = (code, reason) => ({
  subject: `${code} is your Connected Vehicle code`,
  text:
    `Your code ${reason} is ${code}.\n\n` +
    `It expires in ${CODE_LIFETIME_MINUTES} minutes. ` +
    "If you didn't ask for this, you can ignore this email.",
});

// ---------- Creating an account ----------

// Nothing is saved as an account until the emailed code comes back
router.post("/register/start", async (req, res) => {
  try {
    const address = getClientIp(req);

    if (
      signupsByAddress.isBlocked(address) ||
      signupsOverall.isBlocked("all")
    ) {
      return res.status(429).json({
        message: "Too many new accounts. Try again later.",
      });
    }

    const account = validateRegistration(req.body ?? {});

    if (account.error) {
      return res.status(400).json({ message: account.error });
    }

    const { username, email, password, vehicleType } = account;

    if (await isUsernameTaken(username)) {
      return res.status(409).json({ message: "Username already exists." });
    }

    if (await isEmailTaken(email)) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ message: NO_EMAIL_MESSAGE });
    }

    if (emailsToAddress.isBlocked(email.toLowerCase())) {
      return res.status(429).json({
        message: "Too many codes sent to this email. Try again later.",
      });
    }

    const { code, waitSeconds } = await createCode(email, SIGNUP_PURPOSE, {
      username,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      vehicleType,
    });

    if (waitSeconds) {
      return res.status(429).json({
        message: `We just sent a code. Try again in ${waitSeconds} seconds.`,
      });
    }

    try {
      await sendEmail({
        to: email,
        ...codeEmail(code, "to create your account"),
      });
    } catch (error) {
      console.error("[Account] Couldn't send a signup code:", error.message);

      await deleteCode(email, SIGNUP_PURPOSE);

      return res.status(503).json({
        message: "We couldn't send the email. Check the address and try again.",
      });
    }

    signupsByAddress.record(address);
    signupsOverall.record("all");
    emailsToAddress.record(email.toLowerCase());

    res.status(202).json({ message: "We've emailed you a code." });
  } catch (error) {
    console.error("[Account] Signup failed:", error.message);

    res.status(500).json({ message: "Failed to start your signup." });
  }
});

router.post("/register/verify", async (req, res) => {
  try {
    const address = getClientIp(req);
    const { email, code } = req.body ?? {};

    if (failedCodesByAddress.isBlocked(address)) {
      return res.status(429).json({
        message: "Too many wrong codes. Try again later.",
      });
    }

    if (!isText(email) || !isText(code)) {
      return res.status(400).json({ message: "Email and code are required." });
    }

    const result = await checkCode(email, SIGNUP_PURPOSE, code.trim());

    if (result.error) {
      failedCodesByAddress.record(address);

      return res.status(400).json({ message: result.error });
    }

    const details = result.payload;

    // Someone else may have taken these since the code was sent
    if (
      (await isUsernameTaken(details.username)) ||
      (await isEmailTaken(details.email))
    ) {
      await deleteCode(email, SIGNUP_PURPOSE);

      return res.status(409).json({
        message: "That username or email already exists.",
      });
    }

    const user = await registerUser(
      details.username,
      details.email,
      details.passwordHash,
      details.vehicleType,
    );

    await deleteCode(email, SIGNUP_PURPOSE);

    res.status(201).json({
      message: "Account created successfully.",
      user: {
        username: user.username,
        email: user.email,
        vehicleType: user.vehicle_type,
      },
    });
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return res.status(409).json({
        message: "That username or email already exists.",
      });
    }

    console.error("[Account] Signup check failed:", error.message);

    res.status(500).json({ message: "Failed to create your account." });
  }
});

// ---------- Forgotten password ----------

// The reply is the same either way, so this can't reveal who has an account
router.post("/password/forgot", async (req, res) => {
  try {
    const address = getClientIp(req);
    const email = req.body?.email;

    if (!isText(email)) {
      return res.status(400).json({ message: "Enter your email address." });
    }

    if (emailsByAddress.isBlocked(address)) {
      return res.status(429).json({
        message: "Too many requests. Try again later.",
      });
    }

    emailsByAddress.record(address);

    res.json({ message: FORGOT_REPLY });

    const key = email.trim().toLowerCase();

    if (!isEmailConfigured() || emailsToAddress.isBlocked(key)) {
      return;
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return;
    }

    const { code } = await createCode(email, PASSWORD_PURPOSE);

    if (code) {
      emailsToAddress.record(key);

      await sendEmail({
        to: user.email,
        ...codeEmail(code, "to change your password"),
      });
    }
  } catch (error) {
    console.error("[Account] Password code failed:", error.message);

    if (!res.headersSent) {
      res.status(500).json({ message: "Something went wrong. Try again." });
    }
  }
});

router.post("/password/reset", async (req, res) => {
  try {
    const address = getClientIp(req);
    const { email, code, newPassword } = req.body ?? {};

    if (failedCodesByAddress.isBlocked(address)) {
      return res.status(429).json({
        message: "Too many wrong codes. Try again later.",
      });
    }

    if (!isText(email) || !isText(code)) {
      return res.status(400).json({ message: "Email and code are required." });
    }

    // Checked first, so a weak password doesn't use up an attempt
    const passwordError = validatePassword(newPassword);

    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const result = await checkCode(email, PASSWORD_PURPOSE, code.trim());

    if (result.error) {
      failedCodesByAddress.record(address);

      return res.status(400).json({ message: result.error });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      await deleteCode(email, PASSWORD_PURPOSE);

      return res.status(400).json({
        message: "That code has expired. Ask for a new one.",
      });
    }

    await updatePassword(user.id, await bcrypt.hash(newPassword, 12));

    await deleteCode(email, PASSWORD_PURPOSE);

    // Anyone using the old password is logged out everywhere
    if (user.device_id) {
      disconnectDevice(user.device_id);
    }

    disconnectUser(user.username);

    res.json({ message: "Password changed." });
  } catch (error) {
    console.error("[Account] Password change failed:", error.message);

    res.status(500).json({ message: "Failed to change your password." });
  }
});

// ---------- Deleting an account ----------

router.delete("/account", authenticateToken, async (req, res) => {
  try {
    const { password } = req.body ?? {};

    const user = req.user.username
      ? await findUserByUsername(req.user.username)
      : null;

    if (!user) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    if (failedDeletesByUser.isBlocked(user.username)) {
      return res.status(429).json({
        message: "Too many wrong passwords. Try again in 15 minutes.",
      });
    }

    if (
      typeof password !== "string" ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      failedDeletesByUser.record(user.username);

      return res.status(401).json({ message: "That password isn't right." });
    }

    await deleteUser(user);

    if (user.device_id) {
      disconnectDevice(user.device_id);
    }

    disconnectUser(user.username);

    res.json({ message: "Account deleted." });
  } catch (error) {
    console.error("[Account] Account deletion failed:", error.message);

    res.status(500).json({ message: "Failed to delete your account." });
  }
});

module.exports = router;
