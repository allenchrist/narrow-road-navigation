/**
 * Device Registry
 *
 * Maintains the persistent mapping between device identity and vehicle identity.
 * This is the authoritative source for answering:
 *   "Which vehicle belongs to this device?"
 *
 * Separation of concerns:
 *   deviceRegistry  — device identity, device→vehicle mapping, connection tracking
 *   vehicleState    — vehicle telemetry (lat, lon, heading, IMU, connected flag)
 *   vehicleIdAllocator — allocates new vehicle IDs for first-seen devices
 *
 * The device→vehicle mapping is saved in PostgreSQL, so a phone keeps its
 * vehicle ID across server restarts. Connection state is in memory only.
 *
 * Data model per device:
 * {
 *   deviceId:   string   — client-supplied persistent UUID
 *   vehicleId:  string   — server-assigned, permanent for this device
 *   connected:  boolean
 *   lastSeen:   number   — Date.now() of last activity
 *   ws:         WebSocket | null — current active connection (not serialised)
 * }
 */

const { pool } = require("../config/database");
const { reserveVehicleId } = require("./vehicleIdAllocator");

// devices map: deviceId → device record
const devices = new Map();

let devicesLoaded = false;

// ── Validation ────────────────────────────────────────────────────────────────

const DEVICE_ID_MAX_LEN = 128;
const DEVICE_ID_PATTERN = /^[a-zA-Z0-9_\-:.]+$/;

/**
 * Validate a client-supplied deviceId.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateDeviceId(deviceId) {
  if (typeof deviceId !== "string") {
    return { valid: false, reason: "deviceId must be a string" };
  }
  const trimmed = deviceId.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "deviceId must not be empty" };
  }
  if (trimmed.length > DEVICE_ID_MAX_LEN) {
    return { valid: false, reason: `deviceId exceeds max length of ${DEVICE_ID_MAX_LEN}` };
  }
  if (!DEVICE_ID_PATTERN.test(trimmed)) {
    return { valid: false, reason: "deviceId contains invalid characters" };
  }
  return { valid: true, normalized: trimmed };
}

// ── Registry operations ───────────────────────────────────────────────────────

/**
 * Load saved device→vehicle mappings. A device already in memory is kept
 * as it is, because it may have connected while the database was waking.
 * Returns the number of saved devices.
 */
async function loadDevices() {
  const result = await pool.query(
    "SELECT device_id, vehicle_id FROM devices;"
  );

  for (const row of result.rows) {
    reserveVehicleId(row.vehicle_id);

    if (!devices.has(row.device_id)) {
      devices.set(row.device_id, {
        deviceId: row.device_id,
        vehicleId: row.vehicle_id,
        connected: false,
        lastSeen: null,
        ws: null,
      });
    }
  }

  devicesLoaded = true;

  return result.rows.length;
}

/**
 * Until saved devices are loaded, a returning phone would look new, and
 * could be given a vehicle ID that already belongs to another phone.
 */
function areDevicesLoaded() {
  return devicesLoaded;
}

/**
 * Register a device for the first time.
 * Associates deviceId with a newly allocated vehicleId.
 * Must only be called when hasDevice(deviceId) === false.
 */
function registerDevice(deviceId, vehicleId, ws) {
  devices.set(deviceId, {
    deviceId,
    vehicleId,
    connected: true,
    lastSeen: Date.now(),
    ws,
  });
  console.log(`[Device Registry] Registered new device ${deviceId} → ${vehicleId}`);

  pool
    .query(
      `
      INSERT INTO devices (device_id, vehicle_id)
      VALUES ($1, $2)
      ON CONFLICT (device_id) DO NOTHING;
      `,
      [deviceId, vehicleId]
    )
    .catch((error) => {
      console.error(
        `[Device Registry] Failed to save ${deviceId}:`,
        error.message
      );
    });
}

/**
 * Returns true if this deviceId has been seen before (has a vehicle assignment).
 */
function hasDevice(deviceId) {
  return devices.has(deviceId);
}

/**
 * Returns the vehicleId assigned to this device, or null.
 */
function getVehicleForDevice(deviceId) {
  const d = devices.get(deviceId);
  return d ? d.vehicleId : null;
}

/**
 * Mark a device as connected/disconnected and update lastSeen.
 * Optionally attach or clear the active WebSocket connection.
 */
function setDeviceConnected(deviceId, connected, ws = undefined) {
  const d = devices.get(deviceId);
  if (!d) return;
  const update = { ...d, connected, lastSeen: Date.now() };
  if (ws !== undefined) update.ws = ws;
  devices.set(deviceId, update);
}

/**
 * Update lastSeen timestamp for a device (called on each telemetry packet).
 */
function updateLastSeen(deviceId) {
  const d = devices.get(deviceId);
  if (!d) return;
  devices.set(deviceId, { ...d, lastSeen: Date.now() });
}

/**
 * Returns the active WebSocket for a device, or null.
 * Used to detect and replace duplicate connections.
 */
function getConnection(deviceId) {
  const d = devices.get(deviceId);
  return d ? d.ws : null;
}

/**
 * Clear the WebSocket reference for a device (on disconnect).
 */
function removeConnection(deviceId) {
  const d = devices.get(deviceId);
  if (!d) return;
  devices.set(deviceId, { ...d, ws: null, connected: false, lastSeen: Date.now() });
}

/**
 * Returns the number of registered devices.
 */
function getDeviceCount() {
  return devices.size;
}

module.exports = {
  validateDeviceId,
  loadDevices,
  areDevicesLoaded,
  registerDevice,
  hasDevice,
  getVehicleForDevice,
  setDeviceConnected,
  updateLastSeen,
  getConnection,
  removeConnection,
  getDeviceCount,
};
