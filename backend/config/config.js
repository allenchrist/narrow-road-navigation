require("dotenv").config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  androidWsUrl: process.env.ANDROID_WS_URL || "ws://192.168.1.3:8080/ws",
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:5173", "http://127.0.0.1:5173"],
  reconnectBaseDelay: 2000,
  reconnectMaxDelay: 30000,
  staleThresholdMs: 5000,
};
