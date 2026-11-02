const {
  angleDifference,
  distanceBetween,
  getTravelBearing,
} = require("../utils/geo");

const NO_ALERT = { kind: "NONE", level: "none" };

/**
 * How another vehicle is moving relative to this one:
 * ONCOMING, SAME_DIRECTION, or UNKNOWN when either is stopped
 * or has not reported motion.
 */
function getRelation(vehicle, other) {
  const bearing = getTravelBearing(vehicle.speed, vehicle.bearing);
  const otherBearing = getTravelBearing(other.speed, other.bearing);

  if (bearing === null || otherBearing === null) {
    return "UNKNOWN";
  }

  const difference = angleDifference(bearing, otherBearing);

  if (difference > 120) return "ONCOMING";
  if (difference < 60) return "SAME_DIRECTION";
  return "UNKNOWN";
}

/**
 * Decides what the infotainment screen should tell this driver. Alerts
 * start once the vehicle is inside a narrow road. A vehicle travelling
 * the same way is never a conflict, because the two can follow each other.
 */
function buildNarrowRoadAlert(vehicle, others) {
  if (vehicle.insideRoadIds.length === 0) {
    return NO_ALERT;
  }

  const roadIds = new Set(vehicle.insideRoadIds);

  const oncomingInside = [];
  const otherInside = [];
  const approaching = [];

  for (const other of others) {
    const relation = getRelation(vehicle, other);

    if (relation === "SAME_DIRECTION") {
      continue;
    }

    if (other.insideRoadIds.some((id) => roadIds.has(id))) {
      (relation === "ONCOMING" ? oncomingInside : otherInside).push(other);
    } else if (other.approachingRoads.some((road) => roadIds.has(road.id))) {
      approaching.push(other);
    }
  }

  const alert = (kind, level, conflicts = []) => ({
    kind,
    level,
    roadId: vehicle.narrowRoadId,
    roadName: vehicle.narrowRoadName,
    vehicleCount: conflicts.length,
    vehicleDistanceM:
      conflicts.length === 0
        ? null
        : Math.round(
            Math.min(
              ...conflicts.map((other) =>
                distanceBetween(vehicle.lat, vehicle.lon, other.lat, other.lon)
              )
            )
          ),
  });

  const inRoad = [...oncomingInside, ...otherInside];

  if (oncomingInside.length > 0) return alert("ONCOMING_VEHICLE", "danger", inRoad);
  if (otherInside.length > 0) return alert("VEHICLE_IN_ROAD", "danger", inRoad);
  if (approaching.length > 0) return alert("VEHICLE_ENTERING", "warning", approaching);
  return alert("IN_NARROW_ROAD", "caution");
}

module.exports = { buildNarrowRoadAlert, NO_ALERT };
