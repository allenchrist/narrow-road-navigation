const {
  angleDifference,
  bearingBetween,
  distanceBetween,
  getTravelBearing,
} = require("../utils/geo");
const {
  roadAxis,
  directionFromBearing,
  directionFromPosition,
} = require("../utils/roadAxis");

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

/**
 * How two vehicles in the same road are moving, from their directions along
 * it where both are known. fromLane says the answer came from those, rather
 * than from GPS directions alone.
 */
function laneRelation(vehicle, other, roadIds) {
  for (const id of roadIds) {
    const mine = vehicle.roadDirections?.[id];
    const theirs = other.roadDirections?.[id];

    if (mine && theirs) {
      return {
        relation: mine === theirs ? "SAME_DIRECTION" : "ONCOMING",
        fromLane: true,
      };
    }
  }

  return { relation: getRelation(vehicle, other), fromLane: false };
}

/**
 * Which way along each road the vehicle is going, as roadId → 1 or -1,
 * or 0 while not known.
 *
 * A narrow road is too narrow to turn round in, so once known, a direction
 * stays for as long as the vehicle is in the road. That way a driver who
 * reverses to give way keeps their instruction. Until then it comes from
 * the GPS direction when moving, or else from the end the vehicle came in.
 */
function updateRoadDirections(previous, roads, position, lastCheckedAt, now) {
  const remembered =
    lastCheckedAt !== null && now - lastCheckedAt <= ENTRY_MEMORY_MS
      ? previous ?? {}
      : {};

  const travelBearing = getTravelBearing(position.speed, position.bearing);

  const directions = {};

  for (const road of roads) {
    const known = remembered[road.id];

    if (known) {
      directions[road.id] = known;
      continue;
    }

    const axis = roadAxis(road.polygon);

    // 0 means inside, but the direction isn't known yet. The end it came in
    // from only counts on first entering, not later in the middle.
    directions[road.id] =
      directionFromBearing(travelBearing, axis) ??
      (known === undefined
        ? directionFromPosition(position.lat, position.lon, axis)
        : null) ??
      0;
  }

  return directions;
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
 * Remembers who gives way, for each pair of vehicles sharing a road. The
 * vehicle that entered last gives way, whether it's moving or stopped, as a
 * phone's direction is unreliable at low speed. The only exceptions are
 * vehicles clearly travelling the same way, or already driving apart.
 *
 * The decision has to last: a driver who stops or reverses to give way must
 * not lose the instruction. It ends when they no longer share a road, or once
 * the vehicle with right of way has passed.
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
    const { relation, fromLane } = laneRelation(a, b, roadIds);

    if (!pair) {
      // Checked again on each update, in case either of them turns
      const noConflict =
        relation === "SAME_DIRECTION" ||
        (relation === "ONCOMING" && isBehind(a, b) && isBehind(b, a));

      if (!noConflict) {
        pairs.set(key, {
          winnerId: chooseRightOfWay(a, b, roadIds),
          passed: false,
        });
      }
    } else if (fromLane && relation === "SAME_DIRECTION") {
      // Decided while their directions weren't known, and it turns out
      // they're going the same way, so neither needs to give way
      pairs.delete(key);
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
 * start once the vehicle is inside a narrow road. A driver who gave way is
 * told the road is clear once the other vehicle has passed.
 */
function buildNarrowRoadAlert(vehicle, others, rightOfWay) {
  if (vehicle.insideRoadIds.length === 0) {
    return NO_ALERT;
  }

  const roadIds = new Set(vehicle.insideRoadIds);

  const mustGiveWayTo = [];
  const givingWay = [];
  const passedBy = [];
  let sameDirectionCount = 0;
  let vehicleEntering = false;

  // An approaching vehicle heading the same way as this one is following it
  // in, so it isn't a threat. Without a known direction, it counts as one.
  const isOncomingApproach = (road) => {
    const mine = vehicle.roadDirections?.[road.id];

    return !(mine && road.direction && mine === road.direction);
  };

  for (const other of others) {
    const pair = rightOfWay.get(vehicle, other);
    const sharedRoads = sharedRoadIds(vehicle, other);

    if (
      !pair &&
      sharedRoads.length > 0 &&
      laneRelation(vehicle, other, sharedRoads).relation === "SAME_DIRECTION"
    ) {
      sameDirectionCount++;
      continue;
    }

    if (pair) {
      const won = pair.winnerId === vehicle.vehicleId;

      if (!pair.passed) {
        (won ? givingWay : mustGiveWayTo).push(other);
      } else if (!won) {
        passedBy.push(other);
      }
    } else if (
      getRelation(vehicle, other) !== "SAME_DIRECTION" &&
      other.approachingRoads.some(
        (road) => roadIds.has(road.id) && isOncomingApproach(road)
      )
    ) {
      vehicleEntering = true;
    }
  }

  const alert = (kind, level, conflicts = []) => ({
    kind,
    level,
    roadId: vehicle.narrowRoadId,
    roadName: vehicle.narrowRoadName,

    // Only when there's one other vehicle, so the screen can name it
    otherVehicleType:
      conflicts.length === 1 ? conflicts[0].vehicleType ?? null : null,
    otherCount: conflicts.length,

    // Others in this road going the same way, which are no threat
    sameDirectionCount,
  });

  if (mustGiveWayTo.length > 0) return alert("GIVE_WAY", "danger", mustGiveWayTo);
  if (givingWay.length > 0) return alert("RIGHT_OF_WAY", "warning", givingWay);
  if (vehicleEntering) return alert("VEHICLE_ENTERING", "warning");

  // The driver who gave way is told when they can go. Like the instruction
  // before it, this lasts until the two no longer share the road.
  if (passedBy.length > 0) return alert("ROAD_CLEAR", "clear", passedBy);
  return alert("IN_NARROW_ROAD", "caution");
}

module.exports = {
  buildNarrowRoadAlert,
  createRightOfWayTracker,
  updateRoadEntries,
  updateRoadDirections,
  NO_ALERT,
};
