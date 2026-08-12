require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const config = require("./config/config");
const { initSocketServer } = require("./socket/socketServer");
const { startAndroidWebSocket } = require("./services/androidWebSocket");
const { getState } = require("./services/vehicleState");

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: false }));
app.use(express.json());

// Health check — useful for verifying the backend is reachable.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", vehicleState: getState() });
});

const httpServer = http.createServer(app);

initSocketServer(httpServer);
startAndroidWebSocket();

httpServer.listen(config.port, () => {
  console.log(`[Server] Listening on http://localhost:${config.port}`);
  console.log(`[Server] Android WS target: ${config.androidWsUrl}`);
  console.log(`[Server] CORS origin: ${config.corsOrigin}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  const { stopAndroidWebSocket } = require("./services/androidWebSocket");
  stopAndroidWebSocket();
  httpServer.close(() => process.exit(0));
});
