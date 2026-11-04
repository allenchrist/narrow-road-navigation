const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");

const { requireAdmin } = require("../middleware/authMiddleware");
const { getAllVehicles } = require("../services/vehicleState");
const {
  createRateLimiter,
  getClientIp,
} = require("../utils/rateLimit");

const router = express.Router();

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const failedByAddress = createRateLimiter({
  max: 10,
  windowMs: ATTEMPT_WINDOW_MS,
});

const failedOverall = createRateLimiter({
  max: 50,
  windowMs: ATTEMPT_WINDOW_MS,
});

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest();
}

// Takes the same time however much of the password is right
function passwordMatches(attempt, expected) {
  return crypto.timingSafeEqual(sha256(attempt), sha256(expected));
}

router.post("/login", (req, res) => {
  try {
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected) {
      console.error("[Admin] ADMIN_PASSWORD is not set");

      return res.status(503).json({
        message: "The admin password hasn't been set on the server.",
      });
    }

    const address = getClientIp(req);

    if (
      failedByAddress.isBlocked(address) ||
      failedOverall.isBlocked("all")
    ) {
      return res.status(429).json({
        message: "Too many attempts. Try again in 15 minutes.",
      });
    }

    const { password } = req.body ?? {};

    if (
      typeof password !== "string" ||
      !passwordMatches(password, expected)
    ) {
      failedByAddress.record(address);
      failedOverall.record("all");

      return res.status(401).json({
        message: "Incorrect password.",
      });
    }

    const token = jwt.sign(
      { role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ token });
  } catch (error) {
    console.error("[Admin] Login failed:", error.message);

    res.status(500).json({
      message: "Login failed.",
    });
  }
});

// The full fleet, including sensor readings, for checking the system
router.get("/vehicles", requireAdmin, (_req, res) => {
  res.json({ vehicles: getAllVehicles() });
});

module.exports = router;
