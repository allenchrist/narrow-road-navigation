const jwt = require("jsonwebtoken");

const config = require("../config/config");
const { findUserByUsername } = require("./authService");

function getBearerToken(request) {
  const header = request.headers.authorization;

  return header && header.startsWith("Bearer ")
    ? header.substring(7).trim()
    : null;
}

/**
 * Decides whether this connection may act as this device. The login token
 * must belong to the account that the device is linked to, so knowing a
 * device ID isn't enough to take over a vehicle.
 *
 * A wrong token is always refused. A missing token is only refused
 * when config.requireVehicleToken is on.
 */
async function isDeviceAuthorized(request, deviceId) {
  const token = getBearerToken(request);

  if (!token) {
    return !config.requireVehicleToken;
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return false;
  }

  if (!decoded.username) {
    return false;
  }

  const user = await findUserByUsername(decoded.username);

  return (
    Boolean(user) &&
    user.device_id === deviceId &&
    user.session_version === (decoded.sv ?? 0)
  );
}

module.exports = { isDeviceAuthorized };
