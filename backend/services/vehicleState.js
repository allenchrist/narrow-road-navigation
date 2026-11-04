/**
 * Multi-vehicle in-memory registry.
 * Single source of truth for all connected vehicles.
 * No database — real-time telemetry only.
 */

const config = require("../config/config");
const {
  getGeofenceState,
} = require("./geofenceService");
const {
  buildNarrowRoadAlert,
  NO_ALERT,
} = require("./narrowRoadAlert");
const { distanceBetween, getTravelBearing } = require("../utils/geo");

// Drivers only receive other vehicles within this distance
const NEARBY_RADIUS_M = 1000;

// Positions less accurate than this do not change geofence state
const MAX_GEOFENCE_ACCURACY_M = 50;

// Stay "inside" this long after leaving, so GPS jitter at
// the edge of a road does not make the warning flicker
const INSIDE_HOLD_MS = 3000;

// vehicles map: vehicleId → vehicle state object
const vehicles = new Map();

function registerVehicle(vehicleId) {
  if (vehicles.has(vehicleId)) {
    // Reconnect: preserve last known position, mark connected
    const existing = vehicles.get(vehicleId);

    vehicles.set(vehicleId, {
      ...existing,
      connected: true,
    });

    console.log(
      `[Vehicle Registry] ${vehicleId} reconnected`
    );
  } else {
    vehicles.set(vehicleId, {
      vehicleId,
      lat: null,
      lon: null,
      heading: null,

      speed: null,
      bearing: null,
      accuracy: null,

      accelX: null,
      accelY: null,
      accelZ: null,

      gyroX: null,
      gyroY: null,
      gyroZ: null,

      connected: true,

      // Backend receive time — NOT from Android
      lastReceivedAt: null,

      // Geofence state
      insideNarrowRoad: false,
      narrowRoadId: null,
      narrowRoadName: null,
      insideRoadIds: [],
      approachingRoads: [],
      lastInsideAt: null,

      // What the infotainment screen should show
      narrowRoadAlert: NO_ALERT,

      // Sending telemetry recently
      active: false,

      // Number of OTHER connected vehicles
      // currently inside the same narrow road
      otherVehiclesInSameNarrowRoad: 0,
    });

    console.log(
      `[Vehicle Registry] ${vehicleId} registered`
    );
  }
}

function updateVehicleTelemetry(vehicleId, data) {
  if (!vehicles.has(vehicleId)) return;

  const existing = vehicles.get(vehicleId);

  const now = Date.now();

  const geofence = resolveGeofenceState(
    existing,
    data,
    now
  );

  vehicles.set(vehicleId, {
    ...existing,

    lat: data.lat,
    lon: data.lon,
    heading: data.heading,

    speed: data.speed,
    bearing: data.bearing,
    accuracy: data.accuracy,

    accelX: data.accelX,
    accelY: data.accelY,
    accelZ: data.accelZ,

    gyroX: data.gyroX,
    gyroY: data.gyroY,
    gyroZ: data.gyroZ,

    lastReceivedAt: now,

    ...geofence,
  });
}

function resolveGeofenceState(existing, data, now) {
  const previous = {
    insideNarrowRoad: existing.insideNarrowRoad,
    narrowRoadId: existing.narrowRoadId,
    narrowRoadName: existing.narrowRoadName,
    insideRoadIds: existing.insideRoadIds,
    lastInsideAt: existing.lastInsideAt,
  };

  if (
    typeof data.accuracy === "number" &&
    data.accuracy > MAX_GEOFENCE_ACCURACY_M
  ) {
    return {
      ...previous,
      approachingRoads: existing.approachingRoads,
    };
  }

  const geofence = getGeofenceState(
    data.lat,
    data.lon,
    getTravelBearing(data.speed, data.bearing),
    data.accuracy
  );

  const justLeft =
    !geofence.insideNarrowRoad &&
    existing.insideNarrowRoad &&
    now - existing.lastInsideAt < INSIDE_HOLD_MS;

  if (justLeft) {
    return { ...geofence, ...previous, approachingRoads: [] };
  }

  return {
    ...geofence,
    lastInsideAt: geofence.insideNarrowRoad
      ? now
      : existing.lastInsideAt,
  };
}

function setVehicleConnected(
  vehicleId,
  connected
) {
  if (!vehicles.has(vehicleId)) return;

  const existing = vehicles.get(vehicleId);

  vehicles.set(vehicleId, {
    ...existing,
    connected,
  });
}

function removeVehicle(vehicleId) {
  vehicles.delete(vehicleId);

  console.log(
    `[Vehicle Registry] ${vehicleId} removed`
  );
}

/**
 * A vehicle that stopped sending telemetry must not trigger warnings,
 * even if its connection is still open. A phone can stay connected
 * while Android has paused its GPS.
 */
function isActive(vehicle, now) {
  return (
    vehicle.connected &&
    vehicle.lastReceivedAt !== null &&
    now - vehicle.lastReceivedAt <= config.staleThresholdMs
  );
}

/**
 * Refresh each vehicle's alert and its count of OTHER active
 * vehicles inside the same narrow road. Vehicle IDs are not
 * exposed here, only the alert and the count.
 */
function updateNarrowRoadAlerts() {
  const now = Date.now();

  const allVehicles = Array.from(vehicles.values());

  for (const vehicle of allVehicles) {
    vehicle.active = isActive(vehicle, now);
  }

  const activeVehicles = allVehicles.filter((v) => v.active);

  for (const vehicle of allVehicles) {
    if (!vehicle.active) {
      vehicle.narrowRoadAlert = NO_ALERT;
      vehicle.otherVehiclesInSameNarrowRoad = 0;
      continue;
    }

    const others = activeVehicles.filter(
      (other) => other.vehicleId !== vehicle.vehicleId
    );

    vehicle.narrowRoadAlert = buildNarrowRoadAlert(vehicle, others);

    vehicle.otherVehiclesInSameNarrowRoad = others.filter((other) =>
      other.insideRoadIds.some((id) => vehicle.insideRoadIds.includes(id))
    ).length;
  }
}

function getVehicle(vehicleId) {
  const v = vehicles.get(vehicleId);

  return v
    ? { ...v }
    : null;
}

function getAllVehicles() {
  updateNarrowRoadAlerts();

  return Array.from(
    vehicles.values()
  ).map((v) => ({
    ...v,
  }));
}

/**
 * Only what a dashboard displays. Motion sensor readings and
 * internal road calculations stay on the server.
 */
function getVehiclesForDashboard() {
  return getAllVehicles().map((vehicle) => ({
    vehicleId: vehicle.vehicleId,
    lat: vehicle.lat,
    lon: vehicle.lon,
    heading: vehicle.heading,
    speed: vehicle.speed,
    bearing: vehicle.bearing,
    connected: vehicle.connected,
    active: vehicle.active,
    narrowRoadAlert: vehicle.narrowRoadAlert,
  }));
}

/**
 * What one driver may see: their own vehicle, plus other active vehicles
 * nearby. A driver has to be sharing their own position to see anyone, so
 * an account alone can't be used to look around. Another vehicle's alert
 * is left out, because it's only meant for that driver.
 */
function getVisibleVehicles(vehicles, ownVehicleId) {
  const own = vehicles.find(
    (vehicle) => vehicle.vehicleId === ownVehicleId
  );

  if (!own) {
    return [];
  }

  if (!own.active || own.lat === null) {
    return [own];
  }

  const others = vehicles
    .filter(
      (vehicle) =>
        vehicle.vehicleId !== ownVehicleId &&
        vehicle.active &&
        vehicle.lat !== null &&
        distanceBetween(own.lat, own.lon, vehicle.lat, vehicle.lon) <=
          NEARBY_RADIUS_M
    )
    .map(({ narrowRoadAlert: _alert, ...vehicle }) => vehicle);

  return [own, ...others];
}

function getVehicleCount() {
  return vehicles.size;
}

function hasVehicle(vehicleId) {
  return vehicles.has(vehicleId);
}

module.exports = {
  registerVehicle,
  updateVehicleTelemetry,
  setVehicleConnected,
  removeVehicle,
  getVehicle,
  getAllVehicles,
  getVehiclesForDashboard,
  getVisibleVehicles,
  getVehicleCount,
  hasVehicle,
};