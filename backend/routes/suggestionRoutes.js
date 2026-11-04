const express = require("express");

const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");
const {
  getAllSuggestions,
  getSuggestionById,
  createSuggestion,
  rejectSuggestion,
  approveSuggestion,
} = require("../services/narrowRoadSuggestionService");
const { createRateLimiter, getClientIp } = require("../utils/rateLimit");
const { isValidPolygon, POLYGON_ERROR } = require("../utils/validatePolygon");
const {
  ROAD_NAME_ERROR,
  REASON_ERROR,
  isValidRoadName,
  isValidReason,
} = require("../utils/validateRoadText");

const router = express.Router();

const SUGGESTION_WINDOW_MS = 60 * 60 * 1000;

const suggestionsByAccount = createRateLimiter({
  max: 10,
  windowMs: SUGGESTION_WINDOW_MS,
});

// Higher than the account limit, as a college or home network is shared
const suggestionsByAddress = createRateLimiter({
  max: 30,
  windowMs: SUGGESTION_WINDOW_MS,
});

const suggestionsOverall = createRateLimiter({
  max: 100,
  windowMs: SUGGESTION_WINDOW_MS,
});

router.get(
  "/",
  requireAdmin,
  async (_req, res) => {
    try {
      res.json({
        success: true,
        suggestions:
          await getAllSuggestions(),
      });
    } catch (error) {
      console.error(
        "[Suggestion API] Failed to get suggestions:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load suggestions",
      });
    }
  }
);


// --------------------------------------------------
// User submits a suggestion
// --------------------------------------------------

router.post(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      const address = getClientIp(req);
      const account = req.user.username ?? "admin";

      if (
        suggestionsByAccount.isBlocked(account) ||
        suggestionsByAddress.isBlocked(address) ||
        suggestionsOverall.isBlocked("all")
      ) {
        return res.status(429).json({
          success: false,
          message:
            "Too many suggestions. Try again later.",
        });
      }

      const {
        name,
        polygon,
        reason,
      } = req.body;

      if (!isValidRoadName(name)) {
        return res.status(400).json({
          success: false,
          message: ROAD_NAME_ERROR,
        });
      }

      if (!isValidReason(reason)) {
        return res.status(400).json({
          success: false,
          message: REASON_ERROR,
        });
      }

      if (!isValidPolygon(polygon)) {
        return res.status(400).json({
          success: false,
          message: POLYGON_ERROR,
        });
      }

      const suggestion =
        await createSuggestion({
          name,
          polygon,
          reason,
          submittedBy: req.user.username ?? null,
        });

      suggestionsByAccount.record(account);
      suggestionsByAddress.record(address);
      suggestionsOverall.record("all");

      res.status(201).json({
        success: true,
        suggestion,
      });

    } catch (error) {
      console.error(
        "[Suggestion API] Failed to create suggestion:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to submit suggestion",
      });
    }
  }
);


// --------------------------------------------------
// Admin accepts/rejects suggestion
// --------------------------------------------------

router.put(
  "/:id/status",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        status,
      } = req.body;

      if (
        status !== "APPROVED" &&
        status !== "REJECTED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Status must be APPROVED or REJECTED",
        });
      }

      const suggestion =
        await getSuggestionById(
          req.params.id
        );

      if (!suggestion) {
        return res.status(404).json({
          success: false,
          message:
            "Suggestion not found",
        });
      }

      const result =
        status === "REJECTED"
          ? {
              suggestion:
                await rejectSuggestion(
                  req.params.id
                ),
            }
          : await approveSuggestion(
              req.params.id
            );

      if (!result?.suggestion) {
        return res.status(400).json({
          success: false,
          message:
            "Suggestion has already been reviewed",
        });
      }

      res.json({
        success: true,
        ...result,
      });

    } catch (error) {
      console.error(
        "[Suggestion API] Failed to review suggestion:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to review suggestion",
      });
    }
  }
);

module.exports = router;
