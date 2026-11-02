require("dotenv").config();

console.log("JWT_SECRET loaded:", !!process.env.JWT_SECRET);

const http = require("http");
const express = require("express");
const cors = require("cors");
const config = require("./config/config");
const { ensureSchema } = require("./database/schema");
const authRoutes = require("./routes/authRoutes");
const { initSocketServer, broadcastFleetUpdate } = require("./socket/socketServer");
const { initVehicleWebSocketServer } = require("./socket/vehicleWebSocketServer");
const { getAllVehicles, getVehicleCount } = require("./services/vehicleState");
const { getDeviceCount, loadDevices } = require("./services/deviceRegistry");
const { isValidPolygon, POLYGON_ERROR } = require("./utils/validatePolygon");
const {
  loadNarrowRoads,
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
  rejectSuggestion,
  approveSuggestion,
} = require("./services/narrowRoadSuggestionService");

// Dashboards get the fleet on a timer rather than on every GPS packet.
// This also tells them when a vehicle goes stale, which no packet would.
const FLEET_BROADCAST_MS = 1000;

const DATABASE_RETRY_MS = 10000;

const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);

app.use(express.json());

app.use("/api/auth", authRoutes);

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

app.post("/api/narrow-roads", async (req, res) => {
  try {
    const { name, polygon } = req.body;
    if (typeof name !== "string" || !name.trim())
      return res.status(400).json({ success: false, message: "Road name is required" });
    if (!isValidPolygon(polygon))
      return res.status(400).json({ success: false, message: POLYGON_ERROR });
    const road = await createNarrowRoad({ name, polygon });
    res.status(201).json({ success: true, road });
  } catch (error) {
    console.error("[Narrow Road API] Failed to create road:", error);
    res.status(500).json({ success: false, message: "Failed to create narrow road" });
  }
});

app.put("/api/narrow-roads/:id", async (req, res) => {
  try {
    const { name, polygon } = req.body;
    if (name === undefined && polygon === undefined)
      return res.status(400).json({ success: false, message: "Nothing to update" });
    if (name !== undefined && (typeof name !== "string" || !name.trim()))
      return res.status(400).json({ success: false, message: "Road name is required" });
    if (polygon !== undefined && !isValidPolygon(polygon))
      return res.status(400).json({ success: false, message: POLYGON_ERROR });
    const road = await updateNarrowRoad(req.params.id, { name, polygon });
    if (!road) return res.status(404).json({ success: false, message: "Narrow road not found" });
    res.json({ success: true, road });
  } catch (error) {
    console.error("[Narrow Road API] Failed to update road:", error);
    res.status(500).json({ success: false, message: "Failed to update narrow road" });
  }
});

app.delete("/api/narrow-roads/:id", async (req, res) => {
  try {
    const deleted = await deleteNarrowRoad(req.params.id);
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

app.post(
  "/api/narrow-road-suggestions",
  async (req, res) => {
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

const httpServer = http.createServer(app);

// 1. Socket.IO for React dashboards
initSocketServer(httpServer);

// 2. WebSocket server for Android vehicle clients
initVehicleWebSocketServer(httpServer, config.vehicleWsPath);

setInterval(broadcastFleetUpdate, FLEET_BROADCAST_MS);

const PORT = process.env.PORT || config.port;

/**
 * Loads saved roads and devices. Keeps retrying if the database is
 * unavailable, because the server can still track vehicles meanwhile
 * and Neon may need time to wake up.
 */
async function loadSavedData() {
  try {
    await ensureSchema();

    const roads = await loadNarrowRoads();
    const deviceCount = await loadDevices();

    console.log(
      `[Database] Loaded ${roads.length} narrow roads and ${deviceCount} devices`
    );
  } catch (error) {
    console.error(
      `[Database] Could not load saved data, retrying in ${DATABASE_RETRY_MS / 1000}s:`,
      error.message
    );

    setTimeout(loadSavedData, DATABASE_RETRY_MS);
  }
}

async function startServer() {
  // Devices load before phones can connect, so a returning
  // phone gets its saved vehicle ID rather than a new one.
  await loadSavedData();

  httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(
    `[Server] Vehicle WS endpoint: ws://0.0.0.0:${PORT}${config.vehicleWsPath}`
  );
  console.log(`[Server] CORS origins: ${config.corsOrigin}`);
  });
}

startServer();

process.on("SIGINT", () => {
  httpServer.close(() => {
    console.log("[Server] Shut down cleanly");
    process.exit(0);
  });
});
