const EARTH_RADIUS_M = 6371000;

// Below this speed a phone's GPS bearing is mostly noise
const MOVING_SPEED_MPS = 1;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Distance in metres between two points. Flat-earth, like the
 * polygon check below, which is accurate over these short distances.
 */
function distanceBetween(latA, lonA, latB, lonB) {
  const metresPerDegree = toRadians(1) * EARTH_RADIUS_M;

  return Math.hypot(
    (latB - latA) * metresPerDegree,
    (lonB - lonA) * metresPerDegree * Math.cos(toRadians(latA)),
  );
}

/**
 * Compass bearing from one point to another, from 0 to 360.
 */
function bearingBetween(latA, lonA, latB, lonB) {
  const north = latB - latA;
  const east = (lonB - lonA) * Math.cos(toRadians(latA));

  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/**
 * Smallest angle between two compass bearings, from 0 to 180.
 */
function angleDifference(a, b) {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/**
 * Direction of travel in degrees, or null if the vehicle is stopped
 * or the phone did not report motion. The compass heading is not used:
 * it shows which way the phone points, not which way the car moves.
 */
function getTravelBearing(speed, bearing) {
  return typeof speed === "number" &&
    speed >= MOVING_SPEED_MPS &&
    typeof bearing === "number"
    ? bearing
    : null;
}

/**
 * Distance and bearing from a point to the nearest edge of a polygon.
 * Polygon points are [latitude, longitude]. Uses a flat-earth projection,
 * which is accurate enough over the few hundred metres checked here.
 */
function nearestPointOnPolygon(lat, lon, polygon) {
  const metresPerDegree = toRadians(1) * EARTH_RADIUS_M;
  const lonScale = Math.cos(toRadians(lat));

  const project = ([pointLat, pointLon]) => ({
    x: (pointLon - lon) * lonScale * metresPerDegree,
    y: (pointLat - lat) * metresPerDegree,
  });

  let nearest = null;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = project(polygon[j]);
    const b = project(polygon[i]);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    const t =
      lengthSquared === 0
        ? 0
        : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lengthSquared));

    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const distanceM = Math.hypot(x, y);

    if (!nearest || distanceM < nearest.distanceM) {
      nearest = {
        distanceM,
        bearing: ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360,
      };
    }
  }

  return nearest;
}

module.exports = {
  distanceBetween,
  bearingBetween,
  angleDifference,
  getTravelBearing,
  nearestPointOnPolygon,
};
