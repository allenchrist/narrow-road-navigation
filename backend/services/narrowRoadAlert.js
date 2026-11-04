const {
  angleDifference,
  bearingBetween,
  distanceBetween,
  getTravelBearing,
} = require("../utils/geo");

const NO_ALERT = { kind: "NONE", level: "none" };

// A vehicle counts as behind once it is this far off the direction of travel
const BEHIND_ANGLE = 100;

// Closer than this, GPS error can't show which vehicle is ahead
const BEHIND_MIN_DISTANCE_M = 15;

// After a longer gap in updates, the car may have left and come back, so it
// counts as entering again. A short gap, like a weak signal, keeps its place.
const ENTRY_MEMORY_MS = 60000;

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

function isBehind(vehicle, other) {
  const bearing = getTravelBearing(vehicle.speed, vehicle.bearing);

  return (
    bearing !== null &&
    distanceBetween(vehicle.lat, vehicle.lon, other.lat, other.lon) >=
      BEHIND_MIN_DISTANCE_M &&
    angleDifference(
      bearing,
      bearingBetween(vehicle.lat, vehicle.lon, other.lat, other.lon)
    ) > BEHIND_ANGLE
  );
}

function sharedRoadIds(vehicle, other) {
  return vehicle.insideRoadIds.filter((id) => other.insideRoadIds.includes(id));
}

/**
 * When the vehicle entered each road it's now inside, as roadId → time.
 */
function updateRoadEntries(previousEntries, insideRoadIds, lastCheckedAt, now) {
  const remembered =
    lastCheckedAt !== null && now - lastCheckedAt <= ENTRY_MEMORY_MS
      ? previousEntries
      : {};

  return Object.fromEntries(
    insideRoadIds.map((id) => [id, remembered[id] ?? now])
  );
}

/**
 * The vehicle that entered first keeps going. Comparing exact times, with the
 * ID only for an exact tie, gives every vehicle a fixed place in the order, so
 * three or more vehicles can never all be told to give way to each other.
 */
function chooseRightOfWay(a, b, roadIds) {
  const entered = (vehicle) =>
    Math.min(...roadIds.map((id) => vehicle.roadEnteredAt[id]));

  const difference = entered(a) - entered(b);

  if (difference !== 0) {
    return difference < 0 ? a.vehicleId : b.vehicleId;
  }

  return a.vehicleId < b.vehicleId ? a.vehicleId : b.vehicleId;
}

/**
 * Remembers who gives way, for each pair of vehicles that met head on. The
 * decision has to outlast the meeting: a driver who stops or reverses to give
 * way is no longer "oncoming", but must not lose the instruction. It ends when
 * they no longer share a road, or once the vehicle with right of way has passed.
 */
function createRightOfWayTracker() {
  const pairs = new Map();

  const keyOf = (a, b) =>
    a.vehicleId < b.vehicleId
      ? `${a.vehicleId}|${b.vehicleId}`
      : `${b.vehicleId}|${a.vehicleId}`;

  function updatePair(a, b, roadIds) {
    const key = keyOf(a, b);
    const pair = pairs.get(key);

    if (!pair) {
      if (getRelation(a, b) === "ONCOMING") {
        // Already driving away from each other, so they will never meet
        pairs.set(
          key,
          isBehind(a, b) || isBehind(b, a)
            ? { passed: true }
            : { winnerId: chooseRightOfWay(a, b, roadIds), passed: false }
        );
      }
    } else if (!pair.passed) {
      const [winner, other] = pair.winnerId === a.vehicleId ? [a, b] : [b, a];

      pair.passed = isBehind(winner, other);
    }

    return key;
  }

  return {
    update(vehicles) {
      const current = new Set();

      vehicles.forEach((a, index) => {
        for (const b of vehicles.slice(index + 1)) {
          const roadIds = sharedRoadIds(a, b);

          if (roadIds.length > 0) {
            current.add(updatePair(a, b, roadIds));
          }
        }
      });

      for (const key of pairs.keys()) {
        if (!current.has(key)) {
          pairs.delete(key);
        }
      }
    },

    get(a, b) {
      return pairs.get(keyOf(a, b)) ?? null;
    },
  };
}

/**
 * Decides what the infotainment screen should tell this driver. Alerts
 * start once the vehicle is inside a narrow road. A vehicle travelling
 * the same way is never a conflict, because the two can follow each other.
 */
function buildNarrowRoadAlert(vehicle, others, rightOfWay) {
  if (vehicle.insideRoadIds.length === 0) {
    return NO_ALERT;
  }

  const roadIds = new Set(vehicle.insideRoadIds);

  const mustGiveWayTo = [];
  const givingWay = [];
  const otherInside = [];
  const approaching = [];

  for (const other of others) {
    const pair = rightOfWay.get(vehicle, other);

    if (pair) {
      if (!pair.passed) {
        (pair.winnerId === vehicle.vehicleId ? givingWay : mustGiveWayTo).push(other);
      }
      continue;
    }

    if (getRelation(vehicle, other) === "SAME_DIRECTION") {
      continue;
    }

    if (other.insideRoadIds.some((id) => roadIds.has(id))) {
      otherInside.push(other);
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

  const inRoad = [...mustGiveWayTo, ...otherInside, ...givingWay];

  if (mustGiveWayTo.length > 0) return alert("GIVE_WAY", "danger", inRoad);
  if (otherInside.length > 0) return alert("VEHICLE_IN_ROAD", "danger", inRoad);
  if (givingWay.length > 0) return alert("RIGHT_OF_WAY", "warning", inRoad);
  if (approaching.length > 0) return alert("VEHICLE_ENTERING", "warning", approaching);
  return alert("IN_NARROW_ROAD", "caution");
}

module.exports = {
  buildNarrowRoadAlert,
  createRightOfWayTracker,
  updateRoadEntries,
  NO_ALERT,
};
