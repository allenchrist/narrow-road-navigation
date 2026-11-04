require("dotenv").config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,

  // Path where Android phones connect as WebSocket clients
  vehicleWsPath: process.env.VEHICLE_WS_PATH || "/vehicle",

  corsOrigin: process.env.CORS_ORIGIN === "*"
    ? "*"
    : process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : ["http://localhost:5173", "http://127.0.0.1:5173"],

  // Without a clear view of the sky, a phone can go about 7 seconds between
  // positions. A shorter limit would make a working car keep dropping out.
  staleThresholdMs: parseInt(process.env.STALE_THRESHOLD_MS, 10) || 15000,

  // Turn on once every phone runs an app version that sends a login token
  requireVehicleToken: process.env.REQUIRE_VEHICLE_TOKEN === "true",
};
