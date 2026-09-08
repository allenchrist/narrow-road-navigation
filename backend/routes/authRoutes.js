const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
  registerUser,
  findUserByUsername,
} = require("../services/authService");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Username, email, and password are required.",
      });
    }

    // Check username already exists
    const existingUser = await findUserByUsername(username);

    if (existingUser) {
      return res.status(409).json({
        message: "Username already exists.",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await registerUser(
      username,
      email,
      passwordHash
    );

    return res.status(201).json({
      message: "Account created successfully.",
      user: {
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("[Auth] Registration failed:", error.message);

    return res.status(500).json({
      message: "Failed to create account.",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required.",
      });
    }

    const user = await findUserByUsername(username);

    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid username or password.",
      });
    }

    console.log("[Auth] JWT_SECRET available during login:", !!process.env.JWT_SECRET);

    const token = jwt.sign(
      {
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("[Auth] Login failed:", error.message);

    return res.status(500).json({
      message: "Login failed.",
    });
  }
});

module.exports = router;