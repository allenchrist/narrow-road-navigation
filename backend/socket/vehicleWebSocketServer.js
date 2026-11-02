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

const { createPairing } = require("../services/pairingService");

// How long (ms) to wait for a register message before closing the connection
const REGISTRATION_TIMEOUT_MS = 10000;

// Largest message accepted from a phone. Telemetry packets are well under this.
const MAX_MESSAGE_BYTES = 64 * 1024;

function initVehicleWebSocketServer(httpServer, path) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
  });

  console.log(`[Vehicle WS] Server listening on path: ${path}`);

  /*
   * Route only /vehicle upgrades here.
   * Socket.IO handles /socket.io/ upgrades independently.
   */
  httpServer.on("upgrade", (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== path) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws, req) => {
    const connectionId =
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    console.log(
      `[Vehicle WS] CONNECTION CREATED: ${connectionId}`
    );

    const remoteAddr = req.socket.remoteAddress;

    // State for this connection — populated after successful registration
    let deviceId = null;
    let vehicleId = null;
    let registered = false;

    console.log(
      `[Vehicle WS] New connection ${connectionId} from ${remoteAddr} — awaiting registration`
    );

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

      // JSON.parse also accepts null, numbers, strings and arrays
      if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
        ws.send(JSON.stringify({ type: "error", message: "Message must be a JSON object" }));
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

        console.log(
          `[Vehicle WS] READY FOR TELEMETRY: ${vehicleId}`
        );

        // --------------------------------------------------
        // Generate temporary pairing code
        // --------------------------------------------------

        const pairingCode = createPairing(
          deviceId,
          vehicleId
        );

        console.log(
          `[Vehicle WS] Pairing code for ${vehicleId}: ${pairingCode}`
        );

        // Respond with deviceId, vehicleId and pairing code
        ws.send(
          JSON.stringify({
            type: "registered",
            deviceId,
            vehicleId,
            pairingCode,
          })
        );

        broadcastFleetUpdate();

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
        console.warn(
          `[Vehicle WS] Invalid telemetry from ${deviceId} (${vehicleId}): ${result.reason}`
        );
        return;
      }

      updateVehicleTelemetry(
        vehicleId,
        result.data
      );
      updateLastSeen(deviceId);
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    ws.on("close", (code, reason) => {
      clearTimeout(registrationTimeout);

      console.log(
        `[Vehicle WS] CLOSE ${connectionId} — ` +
        `device=${deviceId ?? remoteAddr}, ` +
        `code=${code}, reason="${reason.toString()}"`
      );

      if (!registered || !deviceId) {
        console.log(
          `[Vehicle WS] Unregistered connection from ${remoteAddr} closed`
        );
        return;
      }

      const currentWs = getConnection(deviceId);

      if (currentWs === ws || currentWs === null) {
        removeConnection(deviceId);
        setVehicleConnected(vehicleId, false);

        broadcastFleetUpdate();

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

module.exports = { initVehicleWebSocketServer };
