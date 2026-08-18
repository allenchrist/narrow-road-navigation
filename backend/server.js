require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const config = require("./config/config");
const { initSocketServer } = require("./socket/socketServer");
const { initVehicleWebSocketServer } = require("./socket/vehicleWebSocketServer");
const { getAllVehicles, getVehicleCount } = require("./services/vehicleState");

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: false }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    vehicleCount: getVehicleCount(),
    vehicles: getAllVehicles(),
  });
});

const httpServer = http.createServer(app);

// 1. Socket.IO for React dashboards
initSocketServer(httpServer);

// 2. WebSocket server for Android vehicle clients
initVehicleWebSocketServer(httpServer, config.vehicleWsPath);

httpServer.listen(config.port, () => {
  console.log(`[Server] Listening on port ${config.port}`);
  console.log(`[Server] Vehicle WS endpoint: ws://localhost:${config.port}${config.vehicleWsPath}`);
  console.log(`[Server] CORS origins: ${config.corsOrigin}`);
});

process.on("SIGINT", () => {
  httpServer.close(() => {
    console.log("[Server] Shut down cleanly");
    process.exit(0);
  });
});
