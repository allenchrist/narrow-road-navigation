require("dotenv").config();

// Without these the server would start, then fail in confusing ways later
const REQUIRED_SETTINGS = ["DATABASE_URL", "JWT_SECRET"];

const missingSettings = REQUIRED_SETTINGS.filter((name) => !process.env[name]);

if (missingSettings.length > 0) {
  console.error(
    `[Server] Missing required settings: ${missingSettings.join(", ")}`,
  );

  process.exit(1);
}

if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    "[Server] ADMIN_PASSWORD is not set, so nobody can sign in to the admin page",
  );
}

if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM_ADDRESS) {
  console.warn(
    "[Server] BREVO_API_KEY or MAIL_FROM_ADDRESS is not set, so nobody can sign up or reset a password",
  );
}

const http = require("http");
const express = require("express");
const cors = require("cors");
const config = require("./config/config");
const { pool } = require("./config/database");
const { ensureSchema } = require("./database/schema");
const authRoutes = require("./routes/authRoutes");
const accountRoutes = require("./routes/accountRoutes");
const adminRoutes = require("./routes/adminRoutes");
const roadRoutes = require("./routes/roadRoutes");
const suggestionRoutes = require("./routes/suggestionRoutes");
const {
  initSocketServer,
  broadcastFleetUpdate,
  notifyAllDashboards,
  closeSocketServer,
} = require("./socket/socketServer");
const {
  initVehicleWebSocketServer,
  closeVehicleConnections,
} = require("./socket/vehicleWebSocketServer");
const {
  forgetIdleVehicles,
  getVehicleCount,
} = require("./services/vehicleState");
const { getDeviceCount, loadDevices } = require("./services/deviceRegistry");
const { loadNarrowRoads } = require("./services/narrowRoadService");

// Dashboards get the fleet on a timer rather than on every GPS packet.
// This also tells them when a vehicle goes stale, which no packet would.
const FLEET_BROADCAST_MS = 1000;

const DATABASE_RETRY_MS = 10000;

const FORGET_CHECK_MS = 10 * 60 * 1000;

// Render stops the server soon after asking it to shut down
const SHUTDOWN_TIMEOUT_MS = 5000;

const app = express();

app.disable("x-powered-by");

app.use(
  cors({
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  }),
);

app.use(express.json());

app.use("/api/auth", accountRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/narrow-roads", roadRoutes);
app.use("/api/narrow-road-suggestions", suggestionRoutes);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    deviceCount: getDeviceCount(),
    vehicleCount: getVehicleCount(),
  });
});

// ==================================================
// Replies for anything the routes above didn't handle
// ==================================================

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Not found",
  });
});

// Express only treats this as an error handler if it takes all four arguments
app.use((error, _req, res, _next) => {
  const status = error.status || 500;

  if (status >= 500) {
    console.error("[Server] Request failed:", error);
  }

  res.status(status).json({
    success: false,
    message:
      status === 413
        ? "Request is too large"
        : status < 500
          ? "Invalid request"
          : "Something went wrong",
  });
});

const httpServer = http.createServer(app);

// 1. Socket.IO for React dashboards
initSocketServer(httpServer);

// 2. WebSocket server for Android vehicle clients
initVehicleWebSocketServer(httpServer, config.vehicleWsPath);

setInterval(broadcastFleetUpdate, FLEET_BROADCAST_MS);

setInterval(() => {
  const forgotten = forgetIdleVehicles();

  if (forgotten > 0) {
    console.log(
      `[Vehicle Registry] Forgot ${forgotten} vehicles gone for over an hour`,
    );
  }
}, FORGET_CHECK_MS);

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
      `[Database] Loaded ${roads.length} narrow roads and ${deviceCount} devices`,
    );

    notifyAllDashboards();
  } catch (error) {
    console.error(
      `[Database] Could not load saved data, retrying in ${DATABASE_RETRY_MS / 1000}s:`,
      error.message,
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
      `[Server] Vehicle WS endpoint: ws://0.0.0.0:${PORT}${config.vehicleWsPath}`,
    );
    console.log(`[Server] CORS origins: ${config.corsOrigin}`);
  });
}

startServer();

let shuttingDown = false;

/**
 * Render sends SIGTERM on every deploy. Phones are told the server is going
 * away, so they reconnect to the new one by themselves.
 */
function shutDown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`[Server] ${signal} received, shutting down`);

  setTimeout(() => {
    console.error("[Server] Shutdown took too long, stopping now");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  closeVehicleConnections();

  closeSocketServer(async () => {
    try {
      await pool.end();
    } catch (error) {
      console.error("[Server] Failed to close the database:", error.message);
    }

    console.log("[Server] Shut down cleanly");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutDown("SIGINT"));
process.on("SIGTERM", () => shutDown("SIGTERM"));
