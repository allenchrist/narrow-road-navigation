const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication token required.",
      });
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
      return res.status(401).json({
        message: "Authentication token required.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();
  } catch (error) {
    console.error("[Auth] Token verification failed:", error.message);

    return res.status(401).json({
      message: "Invalid or expired authentication token.",
    });
  }
}

/**
 * Only allows a token from the admin login. A driver's login token is
 * valid, but it doesn't carry the admin role.
 */
function requireAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Administrator access required.",
      });
    }

    next();
  });
}

module.exports = {
  authenticateToken,
  requireAdmin,
};