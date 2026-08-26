/**
 * Multi-vehicle in-memory registry.
 * Single source of truth for all connected vehicles.
 * No database — real-time telemetry only.
 */

const {
  getGeofenceState,
} = require("./geofenceService");

// vehicles map: vehicleId → vehicle state object
const vehicles = new Map();

function registerVehicle(vehicleId) {
  if (vehicles.has(vehicleId)) {
    // Reconnect: preserve last known position, mark connected
    const existing = vehicles.get(vehicleId);
    vehicles.set(vehicleId, { ...existing, connected: true });
    console.log(`[Vehicle Registry] ${vehicleId} reconnected`);
  } else {
    vehicles.set(vehicleId, {
      vehicleId,
      lat: null,
      lon: null,
      heading: null,
      accelX: null,
      accelY: null,
      accelZ: null,
      gyroX: null,
      gyroY: null,
      gyroZ: null,
      connected: true,
      lastReceivedAt: null, // backend receive time — NOT from Android
      insideNarrowRoad: false,
      narrowRoadId: null,
      narrowRoadName: null,
    });
    console.log(`[Vehicle Registry] ${vehicleId} registered`);
  }
}

function updateVehicleTelemetry(vehicleId, data) {
  if (!vehicles.has(vehicleId)) return;
  const existing = vehicles.get(vehicleId);

  const geofence = getGeofenceState(
    data.lat,
    data.lon
  );

  console.log(
    `[Geofence] ${vehicleId} | ` +
    `GPS ${data.lat}, ${data.lon} | ` +
    `${geofence.insideNarrowRoad ? "INSIDE" : "OUTSIDE"} | ` +
    `${geofence.narrowRoadName || "No narrow road"}`
  );

  vehicles.set(vehicleId, {
    ...existing,
    lat: data.lat,
    lon: data.lon,
    heading: data.heading,
    accelX: data.accelX,
    accelY: data.accelY,
    accelZ: data.accelZ,
    gyroX: data.gyroX,
    gyroY: data.gyroY,
    gyroZ: data.gyroZ,
    lastReceivedAt: Date.now(),
    insideNarrowRoad:
      geofence.insideNarrowRoad,
    narrowRoadId:
      geofence.narrowRoadId,
    narrowRoadName:
      geofence.narrowRoadName,
  });
}

function setVehicleConnected(vehicleId, connected) {
  if (!vehicles.has(vehicleId)) return;
  const existing = vehicles.get(vehicleId);
  vehicles.set(vehicleId, { ...existing, connected });
}

function removeVehicle(vehicleId) {
  vehicles.delete(vehicleId);
  console.log(`[Vehicle Registry] ${vehicleId} removed`);
}

function getVehicle(vehicleId) {
  const v = vehicles.get(vehicleId);
  return v ? { ...v } : null;
}

function getAllVehicles() {
  return Array.from(vehicles.values()).map((v) => ({ ...v }));
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
  getVehicleCount,
  hasVehicle,
};
