const { angleDifference, getTravelBearing } = require("../utils/geo");

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
 * Decides what the infotainment screen should tell this driver.
 * A vehicle travelling the same way is never a conflict, because
 * the two can follow each other through the road.
 */
function buildNarrowRoadAlert(vehicle, others) {
  const isInside = vehicle.insideRoadIds.length > 0;
  const roadAhead = vehicle.approachingRoads[0];

  if (!isInside && !roadAhead) {
    return NO_ALERT;
  }

  const roadIds = new Set(
    isInside
      ? vehicle.insideRoadIds
      : vehicle.approachingRoads.map((road) => road.id)
  );

  let oncomingInside = 0;
  let unknownInside = 0;
  let approaching = 0;

  for (const other of others) {
    const relation = getRelation(vehicle, other);

    if (relation === "SAME_DIRECTION") {
      continue;
    }

    if (other.insideRoadIds.some((id) => roadIds.has(id))) {
      if (relation === "ONCOMING") {
        oncomingInside++;
      } else {
        unknownInside++;
      }
    } else if (other.approachingRoads.some((road) => roadIds.has(road.id))) {
      approaching++;
    }
  }

  const road = {
    roadId: isInside ? vehicle.narrowRoadId : roadAhead.id,
    roadName: isInside ? vehicle.narrowRoadName : roadAhead.name,
    distanceM: isInside ? null : Math.round(roadAhead.distanceM),
  };

  const alert = (kind, level, vehicleCount = 0) => ({
    kind,
    level,
    ...road,
    vehicleCount,
  });

  const inRoad = oncomingInside + unknownInside;

  if (isInside) {
    if (oncomingInside > 0) return alert("ONCOMING_VEHICLE", "danger", inRoad);
    if (unknownInside > 0) return alert("VEHICLE_IN_ROAD", "danger", inRoad);
    if (approaching > 0) return alert("VEHICLE_ENTERING", "warning", approaching);
    return alert("IN_NARROW_ROAD", "caution");
  }

  if (inRoad > 0) return alert("WAIT_VEHICLE_IN_ROAD", "danger", inRoad);
  if (approaching > 0) return alert("VEHICLE_ALSO_APPROACHING", "warning", approaching);
  return alert("NARROW_ROAD_AHEAD", "caution");
}

module.exports = { buildNarrowRoadAlert, NO_ALERT };
