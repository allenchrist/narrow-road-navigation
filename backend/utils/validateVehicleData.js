/**
 * Validates the raw JSON object received from the Android WebSocket.
 * Returns { valid: true, data } or { valid: false, reason }.
 */
function validateVehicleData(raw) {
  if (!raw || typeof raw !== "object") {
    return { valid: false, reason: "Payload is not an object" };
  }

  const { lat, lon, heading, accelX, accelY, accelZ, gyroX, gyroY, gyroZ } =
    raw;

  if (typeof lat !== "number" || lat < -90 || lat > 90) {
    return { valid: false, reason: `Invalid lat: ${lat}` };
  }

  if (typeof lon !== "number" || lon < -180 || lon > 180) {
    return { valid: false, reason: `Invalid lon: ${lon}` };
  }

  if (typeof heading !== "number" || !isFinite(heading)) {
    return { valid: false, reason: `Invalid heading: ${heading}` };
  }

  const sensorFields = { accelX, accelY, accelZ, gyroX, gyroY, gyroZ };
  for (const [key, val] of Object.entries(sensorFields)) {
    if (typeof val !== "number" || !isFinite(val)) {
      return { valid: false, reason: `Invalid sensor field ${key}: ${val}` };
    }
  }

  return {
    valid: true,
    data: { lat, lon, heading, accelX, accelY, accelZ, gyroX, gyroY, gyroZ },
  };
}

module.exports = { validateVehicleData };
