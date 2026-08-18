const { WebSocketServer } = require("ws");
const { validateVehicleData } = require("../utils/validateVehicleData");
const {
  registerVehicle,
  updateVehicleTelemetry,
  setVehicleConnected,
} = require("../services/vehicleState");
const { broadcastFleetUpdate } = require("./socketServer");
const {
  allocateVehicleId,
  releaseVehicleId,
} = require("../services/vehicleIdAllocator");

function initVehicleWebSocketServer(httpServer, path) {
  const wss = new WebSocketServer({ noServer: true });

  console.log(`[Vehicle WS] Server listening on path: ${path}`);

  /*
   * Route only /vehicle upgrades here.
   * Socket.IO handles /socket.io/ upgrades independently.
   */
  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname !== path) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws, req) => {
    const remoteAddr = req.socket.remoteAddress;

    /*
     * AUTO-ASSIGN vehicle ID immediately on connection.
     * The client does NOT send a registration message.
     */
    let vehicleId;
    try {
      vehicleId = allocateVehicleId();
    } catch (err) {
      console.error(`[Vehicle WS] ${err.message} — rejecting connection`);
      ws.close(1013, "No vehicle slots available");
      return;
    }

    registerVehicle(vehicleId);
    broadcastFleetUpdate();

    // Inform the client of its assigned session vehicle ID
    ws.send(JSON.stringify({ type: "registered", vehicleId }));

    console.log(
      `[Vehicle WS] ${vehicleId} assigned to connection from ${remoteAddr}`
    );

    /*
     * ── MESSAGE HANDLER ──────────────────────────────────
     * All messages after connection are treated as telemetry.
     * The vehicle ID is already known from the session.
     */
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.warn(`[Vehicle WS] Malformed JSON from ${vehicleId}`);
        ws.send(JSON.stringify({ type: "error", message: "Malformed JSON" }));
        return;
      }

      // Ignore any stale registration-style messages from old clients
      if (msg.type === "register") {
        console.warn(
          `[Vehicle WS] ${vehicleId} sent legacy register message — ignoring (ID already assigned)`
        );
        return;
      }

      const result = validateVehicleData(msg);
      if (!result.valid) {
        console.warn(
          `[Vehicle WS] Invalid telemetry from ${vehicleId}: ${result.reason}`
        );
        return;
      }

      updateVehicleTelemetry(vehicleId, result.data);
      broadcastFleetUpdate();
    });

    /*
     * ── DISCONNECT ───────────────────────────────────────
     */
    ws.on("close", () => {
      setVehicleConnected(vehicleId, false);
      releaseVehicleId(vehicleId);
      broadcastFleetUpdate();
      console.log(`[Vehicle WS] ${vehicleId} disconnected — ID released`);
    });

    ws.on("error", (err) => {
      console.error(`[Vehicle WS] Error (${vehicleId}): ${err.message}`);
    });
  });

  return wss;
}

module.exports = { initVehicleWebSocketServer };
