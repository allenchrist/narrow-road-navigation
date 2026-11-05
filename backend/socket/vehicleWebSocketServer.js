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
  setVehicleType,
  setVehicleConnected,
} = require("../services/vehicleState");
const { broadcastFleetUpdate, notifyDeviceChanged } = require("./socketServer");
const { allocateVehicleId } = require("../services/vehicleIdAllocator");
const {
  validateDeviceId,
  areDevicesLoaded,
  registerDevice,
  hasDevice,
  getVehicleForDevice,
  setDeviceConnected,
  updateLastSeen,
  getConnection,
  removeConnection,
  getDeviceCount,
} = require("../services/deviceRegistry");

const { findUserByDeviceId } = require("../services/authService");
const { isDeviceAuthorized } = require("../services/vehicleAuth");
const { createRateLimiter, getClientIp } = require("../utils/rateLimit");

// How long (ms) to wait for a register message before closing the connection
const REGISTRATION_TIMEOUT_MS = 10000;

// Largest message accepted from a phone. Telemetry packets are well under this.
const MAX_MESSAGE_BYTES = 64 * 1024;

// Phones send about one packet a second. Anything much faster is dropped.
const MIN_TELEMETRY_INTERVAL_MS = 200;

// Each new phone is saved permanently and added to every fleet message
const MAX_DEVICES = 1000;

const NEW_DEVICE_WINDOW_MS = 60 * 60 * 1000;

const newDevicesByAddress = createRateLimiter({
  max: 20,
  windowMs: NEW_DEVICE_WINDOW_MS,
});

const newDevicesOverall = createRateLimiter({
  max: 200,
  windowMs: NEW_DEVICE_WINDOW_MS,
});

function canRegisterNewDevice(address) {
  return (
    getDeviceCount() < MAX_DEVICES &&
    !newDevicesByAddress.isBlocked(address) &&
    !newDevicesOverall.isBlocked("all")
  );
}

// "Going away" in the WebSocket standard. Phones reconnect after this.
const CLOSE_SERVER_RESTARTING = 1001;

// A temporary server fault. Phones reconnect after this too.
const CLOSE_SERVER_ERROR = 1011;

// The server is still starting. Phones reconnect after this too.
const CLOSE_TRY_AGAIN_LATER = 1013;

// The phone must log in again. It doesn't reconnect after this.
const CLOSE_NOT_AUTHORIZED = 4004;

let wss = null;

function initVehicleWebSocketServer(httpServer, path) {
  wss = new WebSocketServer({
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
    const remoteAddr = req.socket.remoteAddress;

    // State for this connection — populated after successful registration
    let deviceId = null;
    let vehicleId = null;
    let registered = false;
    let checkingLogin = false;
    let lastTelemetryAt = 0;
    let warnedAboutTelemetry = false;

    // Close unregistered connections that never send a register message
    const registrationTimeout = setTimeout(() => {
      if (!registered) {
        console.warn(`[Vehicle WS] Connection from ${remoteAddr} timed out waiting for register message`);
        ws.close(4000, "Registration timeout");
      }
    }, REGISTRATION_TIMEOUT_MS);

    // ── MESSAGE HANDLER ──────────────────────────────────────────────────────
    ws.on("message", async (raw) => {
      // Anything that arrives during the login check is ignored
      if (checkingLogin) {
        return;
      }

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

        if (!areDevicesLoaded()) {
          ws.close(CLOSE_TRY_AGAIN_LATER, "Server is starting");
          return;
        }

        const clientAddress = getClientIp(req);

        if (
          !hasDevice(validation.normalized) &&
          !canRegisterNewDevice(clientAddress)
        ) {
          console.warn(`[Vehicle WS] New device refused from ${clientAddress}`);
          ws.send(JSON.stringify({ type: "error", message: "Too many new devices. Try again later." }));
          ws.close(4003, "Too many new devices");
          return;
        }

        clearTimeout(registrationTimeout);

        checkingLogin = true;

        let authorized;

        try {
          authorized = await isDeviceAuthorized(req, validation.normalized);
        } catch (error) {
          console.error(`[Vehicle WS] Login check failed: ${error.message}`);
          ws.close(CLOSE_SERVER_ERROR, "Try again");
          return;
        } finally {
          checkingLogin = false;
        }

        if (!authorized) {
          console.warn(`[Vehicle WS] Refused ${validation.normalized} from ${clientAddress}`);
          ws.send(JSON.stringify({ type: "error", message: "Not authorized for this device" }));
          ws.close(CLOSE_NOT_AUTHORIZED, "Not authorized");
          return;
        }

        // The phone may have disconnected during the check
        if (ws.readyState !== ws.OPEN) {
          return;
        }

        deviceId = validation.normalized;

        // ── DUPLICATE CONNECTION HANDLING ────────────────────────────────────
        // If this device already has an active connection, close the old one.
        const existingWs = getConnection(deviceId);
        if (existingWs && existingWs !== ws && existingWs.readyState <= 1 /* OPEN or CONNECTING */) {
          console.log(`[Device Registry] Replacing existing connection for ${deviceId}`);
          existingWs.close(4002, "Replaced by new connection");
        }

        const isNewDevice = !hasDevice(deviceId);

        // ── KNOWN DEVICE: restore existing vehicleId ─────────────────────────
        if (!isNewDevice) {
          vehicleId = getVehicleForDevice(deviceId);
          setDeviceConnected(deviceId, true, ws);
          registerVehicle(vehicleId); // marks connected:true in vehicleState
          console.log(`[Vehicle WS] Known device ${deviceId} → ${vehicleId} (restored)`);
        } else {
          // ── NEW DEVICE: allocate a permanent vehicleId ────────────────────
          vehicleId = allocateVehicleId();
          registerDevice(deviceId, vehicleId, ws);
          newDevicesByAddress.record(clientAddress);
          newDevicesOverall.record("all");
          registerVehicle(vehicleId);
          console.log(`[Vehicle WS] New device ${deviceId} → ${vehicleId} (allocated)`);
        }

        const connectedVehicleId = vehicleId;

        findUserByDeviceId(deviceId)
          .then((user) => {
            if (!user) {
              return;
            }

            setVehicleType(connectedVehicleId, user.vehicle_type);

            // Its car screen may be open and waiting for this vehicle
            if (isNewDevice) {
              notifyDeviceChanged(user.username);
            }
          })
          .catch((error) => {
            console.error(`[Vehicle WS] Couldn't load the account's details: ${error.message}`);
          });

        registered = true;

        ws.send(
          JSON.stringify({
            type: "registered",
            deviceId,
            vehicleId,
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

      const now = Date.now();

      if (now - lastTelemetryAt < MIN_TELEMETRY_INTERVAL_MS) {
        return;
      }

      lastTelemetryAt = now;

      const result = validateVehicleData(msg);

      if (!result.valid) {
        // Once per connection, as a faulty phone repeats this every second
        if (!warnedAboutTelemetry) {
          warnedAboutTelemetry = true;

          console.warn(
            `[Vehicle WS] Invalid telemetry from ${deviceId} (${vehicleId}): ${result.reason}`
          );
        }

        return;
      }

      updateVehicleTelemetry(
        vehicleId,
        result.data
      );
      updateLastSeen(deviceId);
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    ws.on("close", (code) => {
      clearTimeout(registrationTimeout);

      if (!registered || !deviceId) {
        return;
      }

      const currentWs = getConnection(deviceId);

      if (currentWs === ws || currentWs === null) {
        removeConnection(deviceId);
        setVehicleConnected(vehicleId, false);

        broadcastFleetUpdate();

        console.log(
          `[Vehicle WS] ${deviceId} (${vehicleId}) disconnected, code ${code}`
        );
      }
    });

    ws.on("error", (err) => {
      console.error(`[Vehicle WS] Error (${deviceId ?? remoteAddr}): ${err.message}`);
    });
  });

  return wss;
}

// The phone is no longer linked to its account, so it must log in again
function disconnectDevice(deviceId) {
  getConnection(deviceId)?.close(CLOSE_NOT_AUTHORIZED, "Device unlinked");
}

function closeVehicleConnections() {
  wss?.clients.forEach((ws) => {
    ws.close(CLOSE_SERVER_RESTARTING, "Server restarting");
  });
}

module.exports = {
  initVehicleWebSocketServer,
  disconnectDevice,
  closeVehicleConnections,
};
