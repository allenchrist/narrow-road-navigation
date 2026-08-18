require("dotenv").config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,

  // Path where Android phones connect as WebSocket clients
  vehicleWsPath: process.env.VEHICLE_WS_PATH || "/vehicle",

  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:5173", "http://127.0.0.1:5173"],

  staleThresholdMs: parseInt(process.env.STALE_THRESHOLD_MS, 10) || 5000,
};
