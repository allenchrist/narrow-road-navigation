require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const config = require("./config/config");
const { initSocketServer } = require("./socket/socketServer");
const { initVehicleWebSocketServer } = require("./socket/vehicleWebSocketServer");
const { getAllVehicles, getVehicleCount } = require("./services/vehicleState");
const { getDeviceCount } = require("./services/deviceRegistry");
const {
  getAllNarrowRoads,
  getNarrowRoadById,
  createNarrowRoad,
  updateNarrowRoad,
  deleteNarrowRoad,
} = require("./services/narrowRoadService");
const {
  getAllSuggestions,
  getSuggestionById,
  createSuggestion,
  updateSuggestionStatus,
} = require("./services/narrowRoadSuggestionService");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    deviceCount: getDeviceCount(),
    vehicleCount: getVehicleCount(),
    vehicles: getAllVehicles(),
  });
});

// ==================================================
// NARROW ROAD GEOFENCE API
// ==================================================

app.get("/api/narrow-roads", (_req, res) => {
  try {
    res.json({ success: true, roads: getAllNarrowRoads() });
  } catch (error) {
    console.error("[Narrow Road API] Failed to get roads:", error);
    res.status(500).json({ success: false, message: "Failed to load narrow roads" });
  }
});

app.get("/api/narrow-roads/:id", (req, res) => {
  try {
    const road = getNarrowRoadById(req.params.id);
    if (!road) return res.status(404).json({ success: false, message: "Narrow road not found" });
    res.json({ success: true, road });
  } catch (error) {
    console.error("[Narrow Road API] Failed to get road:", error);
    res.status(500).json({ success: false, message: "Failed to load narrow road" });
  }
});

app.post("/api/narrow-roads", (req, res) => {
  try {
    const { name, polygon } = req.body;
    if (typeof name !== "string" || !name.trim())
      return res.status(400).json({ success: false, message: "Road name is required" });
    if (!Array.isArray(polygon) || polygon.length < 3)
      return res.status(400).json({ success: false, message: "Polygon must contain at least 3 points" });
    const road = createNarrowRoad({ name, polygon });
    res.status(201).json({ success: true, road });
  } catch (error) {
    console.error("[Narrow Road API] Failed to create road:", error);
    res.status(500).json({ success: false, message: "Failed to create narrow road" });
  }
});

app.put("/api/narrow-roads/:id", (req, res) => {
  try {
    const { name, polygon } = req.body;
    if (name === undefined && polygon === undefined)
      return res.status(400).json({ success: false, message: "Nothing to update" });
    if (polygon !== undefined && (!Array.isArray(polygon) || polygon.length < 3))
      return res.status(400).json({ success: false, message: "Polygon must contain at least 3 points" });
    const road = updateNarrowRoad(req.params.id, { name, polygon });
    if (!road) return res.status(404).json({ success: false, message: "Narrow road not found" });
    res.json({ success: true, road });
  } catch (error) {
    console.error("[Narrow Road API] Failed to update road:", error);
    res.status(500).json({ success: false, message: "Failed to update narrow road" });
  }
});

app.delete("/api/narrow-roads/:id", (req, res) => {
  try {
    const deleted = deleteNarrowRoad(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Narrow road not found" });
    res.json({ success: true, message: "Narrow road deleted" });
  } catch (error) {
    console.error("[Narrow Road API] Failed to delete road:", error);
    res.status(500).json({ success: false, message: "Failed to delete narrow road" });
  }
});

// ==================================================
// USER NARROW ROAD SUGGESTIONS
// ==================================================

app.get(
  "/api/narrow-road-suggestions",
  (_req, res) => {
    try {
      res.json({
        success: true,
        suggestions:
          getAllSuggestions(),
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

app.post(
  "/api/narrow-road-suggestions",
  (req, res) => {
    try {
      const {
        name,
        polygon,
        reason,
      } = req.body;

      if (
        typeof name !== "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Road name is required",
        });
      }

      if (
        !Array.isArray(polygon) ||
        polygon.length < 3
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Polygon must contain at least 3 points",
        });
      }

      const suggestion =
        createSuggestion({
          name,
          polygon,
          reason,
        });

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

app.put(
  "/api/narrow-road-suggestions/:id/status",
  (req, res) => {
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
        getSuggestionById(
          req.params.id
        );

      if (!suggestion) {
        return res.status(404).json({
          success: false,
          message:
            "Suggestion not found",
        });
      }

      if (
        suggestion.status !==
        "PENDING"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Suggestion has already been reviewed",
        });
      }

      // --------------------------------------------
      // REJECT
      // --------------------------------------------

      if (
        status === "REJECTED"
      ) {
        const updated =
          updateSuggestionStatus(
            req.params.id,
            "REJECTED"
          );

        return res.json({
          success: true,
          suggestion: updated,
        });
      }

      // --------------------------------------------
      // APPROVE
      // --------------------------------------------

      const road =
        createNarrowRoad({
          name:
            suggestion.name,

          polygon:
            suggestion.polygon,
        });

      const updated =
        updateSuggestionStatus(
          req.params.id,
          "APPROVED"
        );

      res.json({
        success: true,

        suggestion: updated,

        road,
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

const httpServer = http.createServer(app);

// 1. Socket.IO for React dashboards
initSocketServer(httpServer);

// 2. WebSocket server for Android vehicle clients
initVehicleWebSocketServer(httpServer, config.vehicleWsPath);

const PORT = process.env.PORT || config.port;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(
    `[Server] Vehicle WS endpoint: ws://0.0.0.0:${PORT}${config.vehicleWsPath}`
  );
  console.log(`[Server] CORS origins: ${config.corsOrigin}`);
});

process.on("SIGINT", () => {
  httpServer.close(() => {
    console.log("[Server] Shut down cleanly");
    process.exit(0);
  });
});
