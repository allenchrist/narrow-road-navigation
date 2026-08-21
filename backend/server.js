require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const config = require("./config/config");
const { initSocketServer } = require("./socket/socketServer");
const { initVehicleWebSocketServer } = require("./socket/vehicleWebSocketServer");
const { getAllVehicles, getVehicleCount } = require("./services/vehicleState");
const { getDeviceCount } = require("./services/deviceRegistry");

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: false }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    deviceCount: getDeviceCount(),
    vehicleCount: getVehicleCount(),
    vehicles: getAllVehicles(),
  });
});

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
