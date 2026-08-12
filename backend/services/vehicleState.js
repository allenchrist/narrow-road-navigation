/**
 * Central in-memory vehicle state.
 * This is the single source of truth on the backend.
 * No database — this is real-time telemetry only.
 */

let state = {
  lat: null,
  lon: null,
  heading: null,
  accelX: null,
  accelY: null,
  accelZ: null,
  gyroX: null,
  gyroY: null,
  gyroZ: null,
  androidConnected: false,
  lastReceivedAt: null, // backend receive time — NOT an Android timestamp
};

function getState() {
  return { ...state };
}

function updateTelemetry(data) {
  state = {
    ...state,
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
  };
}

function setAndroidConnected(connected) {
  state = { ...state, androidConnected: connected };
}

module.exports = { getState, updateTelemetry, setAndroidConnected };
