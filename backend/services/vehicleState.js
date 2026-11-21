/**
 * Multi-vehicle in-memory registry.
 * Single source of truth for all connected vehicles.
 * No database — real-time telemetry only.
 */

const config = require("../config/config");
const { getGeofenceState } = require("./geofenceService");
const {
  buildNarrowRoadAlert,
  createRightOfWayTracker,
  updateRoadEntries,
  getRelation,
  NO_ALERT,
} = require("./narrowRoadAlert");
const { updateEntrances } = require("./entranceWatch");
const { createOccupancyTracker } = require("./roadOccupancy");
const { createMountainTracker, updateHillPosition } = require("./mountainMode");
const { getHillRoads, getHillRoadById } = require("./hillRoadService");
const { distanceBetween, getTravelBearing } = require("../utils/geo");
const { getNarrowRoadById } = require("./narrowRoadService");
const { DEFAULT_VEHICLE_TYPE } = require("../utils/vehicleTypes");

// Drivers only receive other vehicles within this distance
const NEARBY_RADIUS_M = 2000;

// Positions less accurate than this do not change geofence state
const MAX_GEOFENCE_ACCURACY_M = 50;

// A car still counts for longer than this, but its position is getting old
const WEAK_SIGNAL_MS = 5000;

// Stay "inside" this long after leaving, so GPS jitter at
// the edge of a road does not make the warning flicker
const INSIDE_HOLD_MS = 3000;

// A vehicle disconnected for this long is forgotten. Its phone gets the same
// vehicle ID back if it returns, as that's saved with the device.
const FORGET_AFTER_MS = 60 * 60 * 1000;

// vehicles map: vehicleId → vehicle state object
const vehicles = new Map();

const rightOfWay = createRightOfWayTracker();

const occupancy = createOccupancyTracker(getRelation);

const mountain = createMountainTracker(getHillRoadById);

function registerVehicle(vehicleId) {
  if (vehicles.has(vehicleId)) {
    // Reconnect: preserve last known position, mark connected
    const existing = vehicles.get(vehicleId);

    vehicles.set(vehicleId, {
      ...existing,
      connected: true,
      lastChangedAt: Date.now(),
    });

    console.log(`[Vehicle Registry] ${vehicleId} reconnected`);
  } else {
    vehicles.set(vehicleId, {
      vehicleId,
      vehicleType: DEFAULT_VEHICLE_TYPE,
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

      // When it last connected, disconnected or sent a position
      lastChangedAt: Date.now(),

      // Geofence state
      insideNarrowRoad: false,
      narrowRoadId: null,
      narrowRoadName: null,
      insideRoadIds: [],

      // roadId → when this vehicle entered it
      roadEnteredAt: {},
      lastRoadCheckAt: null,

      approachingRoads: [],
      lastInsideAt: null,

      // Entrances of narrow roads it's arriving at or waiting at, as
      // roadId → entrance, and what decides that over several readings
      atEntrances: {},
      entranceHistory: {},
      leftRoadAt: {},

      // Where it is on a ghat road, for Mountain Mode, or null
      hill: null,
      mountain: null,

      // What the infotainment screen should show
      narrowRoadAlert: NO_ALERT,

      // Sending telemetry recently
      active: false,

      // Number of OTHER connected vehicles
      // currently inside the same narrow road
      otherVehiclesInSameNarrowRoad: 0,
    });

    console.log(`[Vehicle Registry] ${vehicleId} registered`);
  }
}

function updateVehicleTelemetry(vehicleId, data) {
  if (!vehicles.has(vehicleId)) return;

  const existing = vehicles.get(vehicleId);

  const now = Date.now();

  const geofence = resolveGeofenceState(existing, data, now);

  // A poor position doesn't move it along a ghat road
  const hill =
    typeof data.accuracy === "number" && data.accuracy > MAX_GEOFENCE_ACCURACY_M
      ? existing.hill
      : updateHillPosition(
          existing.hill,
          data.lat,
          data.lon,
          getHillRoads(),
          now,
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
    lastChangedAt: now,

    ...geofence,
    hill,
  });
}

function resolveGeofenceState(existing, data, now) {
  const previous = {
    insideNarrowRoad: existing.insideNarrowRoad,
    narrowRoadId: existing.narrowRoadId,
    narrowRoadName: existing.narrowRoadName,
    insideRoadIds: existing.insideRoadIds,
    roadEnteredAt: existing.roadEnteredAt,
    lastRoadCheckAt: existing.lastRoadCheckAt,
    lastInsideAt: existing.lastInsideAt,
  };

  if (
    typeof data.accuracy === "number" &&
    data.accuracy > MAX_GEOFENCE_ACCURACY_M
  ) {
    return {
      ...previous,
      approachingRoads: existing.approachingRoads,
      atEntrances: existing.atEntrances,
      entranceHistory: existing.entranceHistory,
      leftRoadAt: existing.leftRoadAt,
    };
  }

  const geofence = getGeofenceState(
    data.lat,
    data.lon,
    getTravelBearing(data.speed, data.bearing),
    data.accuracy,
  );

  const justLeft =
    !geofence.insideNarrowRoad &&
    existing.insideNarrowRoad &&
    now - existing.lastInsideAt < INSIDE_HOLD_MS;

  if (justLeft) {
    return {
      ...geofence,
      ...previous,
      lastRoadCheckAt: now,
      approachingRoads: [],

      // Still counts as inside, so not at that road's entrance
      ...updateEntrances(
        existing,
        geofence.entranceCandidates,
        previous.insideRoadIds,
        now,
      ),
    };
  }

  return {
    ...geofence,
    ...updateEntrances(
      existing,
      geofence.entranceCandidates,
      geofence.insideRoadIds,
      now,
    ),
    roadEnteredAt: updateRoadEntries(
      existing.roadEnteredAt,
      geofence.insideRoadIds,
      existing.lastRoadCheckAt,
      now,
    ),
    lastRoadCheckAt: now,
    lastInsideAt: geofence.insideNarrowRoad ? now : existing.lastInsideAt,
  };
}

// Only the compass changed, so the position and its age stay as they were
function updateVehicleHeading(vehicleId, heading) {
  const vehicle = vehicles.get(vehicleId);

  if (vehicle && vehicle.lat !== null) {
    vehicle.heading = heading;
  }
}

function setVehicleType(vehicleId, vehicleType) {
  const vehicle = vehicles.get(vehicleId);

  if (vehicle) {
    vehicle.vehicleType = vehicleType;
  }
}

function setVehicleConnected(vehicleId, connected) {
  if (!vehicles.has(vehicleId)) return;

  const existing = vehicles.get(vehicleId);

  vehicles.set(vehicleId, {
    ...existing,
    connected,
    lastChangedAt: Date.now(),
  });
}

/**
 * Drops vehicles that have been disconnected for over an hour, so the
 * server doesn't keep every vehicle that ever connected. Returns how many.
 */
function forgetIdleVehicles(now = Date.now()) {
  let forgotten = 0;

  for (const [vehicleId, vehicle] of vehicles) {
    if (!vehicle.connected && now - vehicle.lastChangedAt > FORGET_AFTER_MS) {
      vehicles.delete(vehicleId);
      forgotten++;
    }
  }

  return forgotten;
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

  rightOfWay.update(activeVehicles);
  occupancy.update(activeVehicles, now);
  mountain.update(activeVehicles, now);

  for (const vehicle of allVehicles) {
    if (!vehicle.active) {
      vehicle.narrowRoadAlert = NO_ALERT;
      vehicle.mountain = null;
      vehicle.otherVehiclesInSameNarrowRoad = 0;
      continue;
    }

    const others = activeVehicles.filter(
      (other) => other.vehicleId !== vehicle.vehicleId,
    );

    const narrowRoadAlert = buildNarrowRoadAlert(
      vehicle,
      others,
      rightOfWay,
      occupancy,
    );

    // On a ghat road, the bend alert shows unless a narrow road needs one
    vehicle.narrowRoadAlert =
      narrowRoadAlert.kind === "NONE"
        ? (mountain.alertFor(vehicle.vehicleId) ?? NO_ALERT)
        : narrowRoadAlert;

    vehicle.mountain = mountain.infoFor(vehicle.vehicleId);

    vehicle.otherVehiclesInSameNarrowRoad = others.filter((other) =>
      other.insideRoadIds.some((id) => vehicle.insideRoadIds.includes(id)),
    ).length;
  }
}

function getAllVehicles() {
  updateNarrowRoadAlerts();

  return Array.from(vehicles.values()).map((v) => ({
    ...v,
  }));
}

/**
 * Only what a dashboard displays. Motion sensor readings and
 * internal road calculations stay on the server.
 */
function getVehiclesForDashboard() {
  const now = Date.now();

  return getAllVehicles().map((vehicle) => ({
    vehicleId: vehicle.vehicleId,
    vehicleType: vehicle.vehicleType,
    lat: vehicle.lat,
    lon: vehicle.lon,
    heading: vehicle.heading,
    speed: vehicle.speed,
    bearing: vehicle.bearing,
    accuracy: vehicle.accuracy,
    connected: vehicle.connected,
    active: vehicle.active,
    weakSignal: vehicle.active && now - vehicle.lastReceivedAt > WEAK_SIGNAL_MS,
    narrowRoadAlert: vehicle.narrowRoadAlert,
    mountain: vehicle.mountain,
  }));
}

/**
 * What one driver may see: their own vehicle, plus other active vehicles
 * nearby. A driver has to be sharing their own position to see anyone, so
 * an account alone can't be used to look around. Another vehicle's alert
 * is left out, because it's only meant for that driver. Each other vehicle
 * says whether it shares a narrow road with this driver, but not which road.
 *
 * The driver's own vehicle includes the shapes of the roads it's in, so the
 * screen can outline them. Other roads stay hidden.
 */
function getVisibleVehicles(dashboardVehicles, ownVehicleId) {
  const own = dashboardVehicles.find(
    (vehicle) => vehicle.vehicleId === ownVehicleId,
  );

  if (!own) {
    return [];
  }

  if (!own.active || own.lat === null) {
    return [{ ...own, currentRoads: [], entranceRoad: null }];
  }

  const ownRoadIds = vehicles.get(ownVehicleId)?.insideRoadIds ?? [];

  const currentRoads = ownRoadIds
    .map(getNarrowRoadById)
    .filter(Boolean)
    .map(({ id, polygon }) => ({ id, polygon }));

  // At an entrance, the road ahead, coloured by whether it's free, and the
  // entrance itself
  const alertRoad =
    own.narrowRoadAlert?.kind?.startsWith("ENTRY_") &&
    getNarrowRoadById(own.narrowRoadAlert.roadId);

  const entrance =
    alertRoad && vehicles.get(ownVehicleId)?.atEntrances?.[alertRoad.id];

  const entranceRoad = entrance
    ? {
        id: alertRoad.id,
        polygon: alertRoad.polygon,
        status: occupancy.statusOf(alertRoad.id),
        entrance: entrance.point,
      }
    : null;

  const others = dashboardVehicles
    .filter(
      (vehicle) =>
        vehicle.vehicleId !== ownVehicleId &&
        vehicle.active &&
        vehicle.lat !== null &&
        distanceBetween(own.lat, own.lon, vehicle.lat, vehicle.lon) <=
          NEARBY_RADIUS_M,
    )
    .map(({ narrowRoadAlert: _alert, mountain: _mountain, ...vehicle }) => ({
      ...vehicle,
      inSameRoad: (vehicles.get(vehicle.vehicleId)?.insideRoadIds ?? []).some(
        (id) => ownRoadIds.includes(id),
      ),
    }));

  return [{ ...own, currentRoads, entranceRoad }, ...others];
}

/**
 * Narrow roads that aren't available, as roadId → RESERVED or OCCUPIED, for
 * the admin's live map. Brought up to date first.
 */
function getBusyRoads() {
  updateNarrowRoadAlerts();

  return occupancy.busyRoads();
}

/** The ghat road this vehicle is on, for Mountain Mode, or null. */
function getHillRoadName(vehicleId) {
  return vehicles.get(vehicleId)?.hill?.roadName ?? null;
}

function getVehicleCount() {
  return vehicles.size;
}

module.exports = {
  registerVehicle,
  updateVehicleTelemetry,
  updateVehicleHeading,
  setVehicleType,
  setVehicleConnected,
  forgetIdleVehicles,
  getAllVehicles,
  getVehiclesForDashboard,
  getVisibleVehicles,
  getVehicleCount,
  getBusyRoads,
  getHillRoadName,
};
