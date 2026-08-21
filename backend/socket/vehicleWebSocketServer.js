/**
 * Vehicle WebSocket Server
 *
 * Handles Android device connections on the /vehicle path.
 *
 * Registration protocol:
 *
 *   CLIENT → SERVER:  { type: "register", deviceId: "<persistent-uuid>" }
 *   SERVER → CLIENT:  { type: "registered", deviceId: "...", vehicleId: "VEHICLE_001" }
 *
 * After registration, all subsequent messages are treated as telemetry.
 * The connection itself identifies the device — no vehicleId needed in packets.
 *
 * Duplicate connection policy:
 *   If a device connects while its previous connection is still open,
 *   the old connection is terminated and replaced. Same vehicleId is kept.
 *
 * Identity separation:
 *   deviceRegistry  — owns device→vehicle mapping and connection tracking
 *   vehicleState    — owns telemetry state per vehicleId
 *   vehicleIdAllocator — allocates new vehicleIds for first-seen devices only
 */

const { WebSocketServer } = require("ws");
const { validateVehicleData } = require("../utils/validateVehicleData");
const {
  registerVehicle,
  updateVehicleTelemetry,
  setVehicleConnected,
  getAllVehicles,
} = require("../services/vehicleState");
const { broadcastFleetUpdate } = require("./socketServer");
const { allocateVehicleId } = require("../services/vehicleIdAllocator");
const {
  validateDeviceId,
  registerDevice,
  hasDevice,
  getVehicleForDevice,
  setDeviceConnected,
  updateLastSeen,
  getConnection,
  removeConnection,
} = require("../services/deviceRegistry");

// All currently connected Android vehicle WebSockets
const connectedVehicles = new Map();

// How long (ms) to wait for a register message before closing the connection
const REGISTRATION_TIMEOUT_MS = 10000;

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

    // State for this connection — populated after successful registration
    let deviceId = null;
    let vehicleId = null;
    let registered = false;

    console.log(`[Vehicle WS] New connection from ${remoteAddr} — awaiting registration`);

    // Close unregistered connections that never send a register message
    const registrationTimeout = setTimeout(() => {
      if (!registered) {
        console.warn(`[Vehicle WS] Connection from ${remoteAddr} timed out waiting for register message`);
        ws.close(4000, "Registration timeout");
      }
    }, REGISTRATION_TIMEOUT_MS);

    // ── MESSAGE HANDLER ──────────────────────────────────────────────────────
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Malformed JSON" }));
        return;
      }

      // ── REGISTRATION ──────────────────────────────────────────────────────
      if (!registered) {
        if (msg.type !== "register") {
          ws.send(JSON.stringify({ type: "error", message: "Expected register message first" }));
          return;
        }

        // Validate deviceId — server never trusts a client-supplied vehicleId
        const validation = validateDeviceId(msg.deviceId);
        if (!validation.valid) {
          console.warn(`[Vehicle WS] Invalid deviceId from ${remoteAddr}: ${validation.reason}`);
          ws.send(JSON.stringify({ type: "error", message: `Invalid deviceId: ${validation.reason}` }));
          ws.close(4001, "Invalid deviceId");
          return;
        }

        deviceId = validation.normalized;
        clearTimeout(registrationTimeout);

        // ── DUPLICATE CONNECTION HANDLING ────────────────────────────────────
        // If this device already has an active connection, close the old one.
        const existingWs = getConnection(deviceId);
        if (existingWs && existingWs !== ws && existingWs.readyState <= 1 /* OPEN or CONNECTING */) {
          console.log(`[Device Registry] Replacing existing connection for ${deviceId}`);
          existingWs.close(4002, "Replaced by new connection");
        }

        // ── KNOWN DEVICE: restore existing vehicleId ─────────────────────────
        if (hasDevice(deviceId)) {
          vehicleId = getVehicleForDevice(deviceId);
          setDeviceConnected(deviceId, true, ws);
          registerVehicle(vehicleId); // marks connected:true in vehicleState
          console.log(`[Vehicle WS] Known device ${deviceId} → ${vehicleId} (restored)`);
        } else {
          // ── NEW DEVICE: allocate a permanent vehicleId ────────────────────
          vehicleId = allocateVehicleId();
          registerDevice(deviceId, vehicleId, ws);
          registerVehicle(vehicleId);
          console.log(`[Vehicle WS] New device ${deviceId} → ${vehicleId} (allocated)`);
        }

        registered = true;

        // Track this Android connection
        connectedVehicles.set(deviceId, ws);

        // Respond with both deviceId and vehicleId
        ws.send(JSON.stringify({ type: "registered", deviceId, vehicleId }));

        broadcastFleetUpdate();
        broadcastFleetToVehicles();

        return;
      }

      // ── TELEMETRY (post-registration) ────────────────────────────────────
      // Ignore any stale re-registration attempts
      if (msg.type === "register") {
        console.warn(`[Vehicle WS] ${deviceId} sent duplicate register — ignoring`);
        return;
      }

      const result = validateVehicleData(msg);
      if (!result.valid) {
        console.warn(`[Vehicle WS] Invalid telemetry from ${deviceId} (${vehicleId}): ${result.reason}`);
        return;
      }

      updateVehicleTelemetry(vehicleId, result.data);
      updateLastSeen(deviceId);

      broadcastFleetUpdate();
      broadcastFleetToVehicles();
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    ws.on("close", (code, reason) => {
      clearTimeout(registrationTimeout);

      console.log(
        `[Vehicle WS] CLOSE event — device=${deviceId ?? remoteAddr}, ` +
        `code=${code}, reason="${reason.toString()}"`
      );

      if (!registered || !deviceId) {
        console.log(
          `[Vehicle WS] Unregistered connection from ${remoteAddr} closed`
        );
        return;
      }

      if (getConnection(deviceId) === ws) {
        connectedVehicles.delete(deviceId);
      }

      const currentWs = getConnection(deviceId);

      if (currentWs === ws || currentWs === null) {
        removeConnection(deviceId);
        setVehicleConnected(vehicleId, false);

        broadcastFleetUpdate();
        broadcastFleetToVehicles();

        console.log(
          `[Vehicle WS] ${deviceId} (${vehicleId}) disconnected`
        );
      } else {
        console.log(
          `[Vehicle WS] Replaced connection for ${deviceId} closed (no state change)`
        );
      }
    });

    ws.on("error", (err) => {
      console.error(`[Vehicle WS] Error (${deviceId ?? remoteAddr}): ${err.message}`);
    });
  });

  return wss;
}

function broadcastFleetToVehicles() {
  const fleet = getAllVehicles();

  const message = JSON.stringify({
    type: "fleet_update",
    vehicles: fleet,
  });

  for (const [deviceId, ws] of connectedVehicles.entries()) {
    if (ws.readyState === 1) {
      ws.send(message);
    } else {
      connectedVehicles.delete(deviceId);
    }
  }
}

module.exports = { initVehicleWebSocketServer };
