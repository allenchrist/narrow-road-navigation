const {
  angleDifference,
  bearingBetween,
  distanceBetween,
  getTravelBearing,
} = require("../utils/geo");
const { isPriorityVehicle } = require("../utils/vehicleTypes");

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
      bearingBetween(vehicle.lat, vehicle.lon, other.lat, other.lon),
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
    insideRoadIds.map((id) => [id, remembered[id] ?? now]),
  );
}

/**
 * A priority vehicle, such as an ambulance, keeps going whoever came first.
 * Otherwise, or between two priority vehicles, the vehicle that entered first
 * keeps going. Comparing exact times, with the ID only for an exact tie, gives
 * every vehicle a fixed place in the order, so three or more vehicles can
 * never all be told to give way to each other.
 *
 * Returns the winner's ID, and whether priority decided it.
 */
function chooseRightOfWay(a, b, roadIds) {
  const aPriority = isPriorityVehicle(a.vehicleType);
  const bPriority = isPriorityVehicle(b.vehicleType);

  if (aPriority !== bPriority) {
    return {
      winnerId: aPriority ? a.vehicleId : b.vehicleId,
      byPriority: true,
    };
  }

  const entered = (vehicle) =>
    Math.min(...roadIds.map((id) => vehicle.roadEnteredAt[id]));

  const difference = entered(a) - entered(b);

  const winnerId =
    difference !== 0
      ? difference < 0
        ? a.vehicleId
        : b.vehicleId
      : a.vehicleId < b.vehicleId
        ? a.vehicleId
        : b.vehicleId;

  return { winnerId, byPriority: false };
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

    if (!pair) {
      const relation = getRelation(a, b);

      // Checked again on each update, in case either of them turns
      const noConflict =
        relation === "SAME_DIRECTION" ||
        (relation === "ONCOMING" && isBehind(a, b) && isBehind(b, a));

      if (!noConflict) {
        pairs.set(key, {
          ...chooseRightOfWay(a, b, roadIds),
          passed: false,
        });
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
  const entering = [];
  let byPriority = false;

  for (const other of others) {
    const pair = rightOfWay.get(vehicle, other);

    if (pair) {
      const won = pair.winnerId === vehicle.vehicleId;

      if (!pair.passed) {
        (won ? givingWay : mustGiveWayTo).push(other);
        byPriority ||= pair.byPriority;
      } else if (!won) {
        passedBy.push(other);
      }
    } else if (
      getRelation(vehicle, other) !== "SAME_DIRECTION" &&
      other.approachingRoads.some((road) => roadIds.has(road.id))
    ) {
      entering.push(other);
    }
  }

  const alert = (kind, level, conflicts = []) => ({
    kind,
    level,
    roadId: vehicle.narrowRoadId,
    roadName: vehicle.narrowRoadName,

    // Only when there's one other vehicle, so the screen can name it
    otherVehicleType:
      conflicts.length === 1 ? (conflicts[0].vehicleType ?? null) : null,
    otherCount: conflicts.length,

    // An ambulance decided it, rather than who came first
    byPriority,
  });

  if (mustGiveWayTo.length > 0)
    return alert("GIVE_WAY", "danger", mustGiveWayTo);
  if (givingWay.length > 0) return alert("RIGHT_OF_WAY", "warning", givingWay);

  // Says what is coming, so an approaching ambulance is named
  if (entering.length > 0)
    return alert("VEHICLE_ENTERING", "warning", entering);

  // The driver who gave way is told when they can go. Like the instruction
  // before it, this lasts until the two no longer share the road.
  if (passedBy.length > 0) return alert("ROAD_CLEAR", "clear", passedBy);
  return alert("IN_NARROW_ROAD", "caution");
}

module.exports = {
  buildNarrowRoadAlert,
  createRightOfWayTracker,
  updateRoadEntries,
  NO_ALERT,
};
