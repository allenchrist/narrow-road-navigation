const { angleDifference, bearingBetween } = require("./geo");

/**
 * A narrow road only goes two ways. Its axis runs between the two points of
 * its outline farthest apart, which are its ends. A vehicle's direction
 * along it is 1, from the first end towards the second, or -1, the other way.
 */

// GPS directions this close to the road's line count as along it
const ALIGNED_ANGLE = 45;

// A vehicle in this share of the road nearest an end came in from that end
const END_SHARE = 0.3;

const METRES_PER_DEGREE = 111320;

// Outlines change only when the admin edits a road, which makes a new array
const axes = new WeakMap();

function roadAxis(polygon) {
  if (axes.has(polygon)) {
    return axes.get(polygon);
  }

  let start = polygon[0];
  let end = polygon[1];
  let longest = -1;

  for (let i = 0; i < polygon.length; i++) {
    for (let j = i + 1; j < polygon.length; j++) {
      const length = Math.hypot(
        polygon[i][0] - polygon[j][0],
        (polygon[i][1] - polygon[j][1]) * Math.cos((polygon[i][0] * Math.PI) / 180)
      );

      if (length > longest) {
        longest = length;
        start = polygon[i];
        end = polygon[j];
      }
    }
  }

  const axis = {
    start,
    end,
    bearing: bearingBetween(start[0], start[1], end[0], end[1]),
  };

  axes.set(polygon, axis);

  return axis;
}

// From a GPS direction, or null if it points across the road
function directionFromBearing(travelBearing, axis) {
  if (travelBearing === null || travelBearing === undefined) {
    return null;
  }

  const difference = angleDifference(travelBearing, axis.bearing);

  if (difference <= ALIGNED_ANGLE) return 1;
  if (difference >= 180 - ALIGNED_ANGLE) return -1;
  return null;
}

/**
 * From where a vehicle is when it first counts as inside: near an end, it
 * came in from that end and is heading for the other. Null in the middle,
 * where it may have come in from a side street.
 */
function directionFromPosition(lat, lon, axis) {
  const scale = Math.cos((axis.start[0] * Math.PI) / 180) * METRES_PER_DEGREE;
  const toPoint = [(lat - axis.start[0]) * METRES_PER_DEGREE, (lon - axis.start[1]) * scale];
  const toEnd = [(axis.end[0] - axis.start[0]) * METRES_PER_DEGREE, (axis.end[1] - axis.start[1]) * scale];
  const lengthSquared = toEnd[0] ** 2 + toEnd[1] ** 2;

  if (lengthSquared === 0) {
    return null;
  }

  const share = (toPoint[0] * toEnd[0] + toPoint[1] * toEnd[1]) / lengthSquared;

  if (share <= END_SHARE) return 1;
  if (share >= 1 - END_SHARE) return -1;
  return null;
}

module.exports = {
  roadAxis,
  directionFromBearing,
  directionFromPosition,
};
