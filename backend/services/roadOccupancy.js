/**
 * Whether each narrow road is available, reserved or occupied, and what a
 * vehicle at one of its entrances should do: go, follow, or wait.
 *
 * OCCUPIED: one or more vehicles are inside.
 * RESERVED: nobody is inside, and one vehicle at an entrance has been given
 *           the road.
 * AVAILABLE: nobody is inside or waiting.
 *
 * Only one vehicle holds a reservation, chosen in a fixed order, so two
 * vehicles at opposite ends are never both told to go. When anything is
 * unclear, such as which way a stopped vehicle is going, the answer is wait.
 */

const { getTravelBearing } = require("../utils/geo");
const { isPriorityVehicle } = require("../utils/vehicleTypes");

// A vehicle given the road that hasn't entered after this long loses it, and
// goes to the back of the line
const HOLD_MAX_MS = 60000;

// One that stays stopped this long after being told to go, such as a car
// parked near the entrance, loses it sooner
const HOLD_STOPPED_MS = 15000;

const isStopped = (vehicle) =>
  getTravelBearing(vehicle.speed, vehicle.bearing) === null;

const entranceRoadIds = (vehicle) =>
  Object.keys(vehicle.atEntrances ?? {}).filter(
    (roadId) => !vehicle.insideRoadIds.includes(roadId),
  );

/**
 * relation(a, b) says how two vehicles are moving relative to each other,
 * as in narrowRoadAlert: SAME_DIRECTION, ONCOMING or UNKNOWN.
 */
function createOccupancyTracker(relation) {
  // roadId → { queue: Map(vehicleId → when it arrived), holder, status }
  const roads = new Map();

  // A priority vehicle first, then whoever arrived first, then the ID, so
  // the order is always the same
  function first(vehicles, queue) {
    return [...vehicles].sort(
      (a, b) =>
        Number(isPriorityVehicle(b.vehicleType)) -
          Number(isPriorityVehicle(a.vehicleType)) ||
        queue.get(a.vehicleId) - queue.get(b.vehicleId) ||
        (a.vehicleId < b.vehicleId ? -1 : 1),
    )[0];
  }

  function updateRoad(roadId, inside, waiting, now) {
    const road = roads.get(roadId) ?? {
      queue: new Map(),
      holder: null,
      status: "AVAILABLE",
    };

    const waitingIds = new Set(waiting.map((vehicle) => vehicle.vehicleId));

    for (const vehicleId of road.queue.keys()) {
      if (!waitingIds.has(vehicleId)) road.queue.delete(vehicleId);
    }

    for (const vehicle of waiting) {
      if (!road.queue.has(vehicle.vehicleId)) {
        road.queue.set(vehicle.vehicleId, now);
      }
    }

    let holder = road.holder;
    const holding =
      holder &&
      waiting.find((vehicle) => vehicle.vehicleId === holder.vehicleId);

    // Gone from the entrance: entered, turned away or stopped sending.
    // Someone inside: nobody holds the road while it's occupied.
    if (!holding || inside.length > 0) {
      holder = null;
    } else {
      holder.stoppedSince = isStopped(holding)
        ? (holder.stoppedSince ?? now)
        : null;

      const tooLong = now - holder.since >= HOLD_MAX_MS;
      const parked =
        holder.stoppedSince !== null &&
        now - holder.stoppedSince >= HOLD_STOPPED_MS;

      if (tooLong || parked) {
        road.queue.set(holder.vehicleId, now);
        holder = null;
      } else if (
        !isPriorityVehicle(holding.vehicleType) &&
        waiting.some((vehicle) => isPriorityVehicle(vehicle.vehicleType))
      ) {
        // A priority vehicle takes the road from one that hasn't gone in yet
        holder = null;
      }
    }

    if (!holder && inside.length === 0 && waiting.length > 0) {
      holder = {
        vehicleId: first(waiting, road.queue).vehicleId,
        since: now,
        stoppedSince: null,
      };
    }

    road.holder = holder;
    road.status =
      inside.length > 0 ? "OCCUPIED" : holder ? "RESERVED" : "AVAILABLE";

    if (road.status === "AVAILABLE" && road.queue.size === 0) {
      roads.delete(roadId);
    } else {
      roads.set(roadId, road);
    }
  }

  return {
    /** Brings every road up to date with the active vehicles. */
    update(vehicles, now = Date.now()) {
      const inside = new Map();
      const waiting = new Map();

      const add = (map, roadId, vehicle) => {
        if (!map.has(roadId)) map.set(roadId, []);
        map.get(roadId).push(vehicle);
      };

      for (const vehicle of vehicles) {
        for (const roadId of vehicle.insideRoadIds)
          add(inside, roadId, vehicle);
        for (const roadId of entranceRoadIds(vehicle)) {
          add(waiting, roadId, vehicle);
        }
      }

      const roadIds = new Set([
        ...inside.keys(),
        ...waiting.keys(),
        ...roads.keys(),
      ]);

      for (const roadId of roadIds) {
        updateRoad(
          roadId,
          inside.get(roadId) ?? [],
          waiting.get(roadId) ?? [],
          now,
        );
      }
    },

    /** AVAILABLE, RESERVED or OCCUPIED. */
    statusOf(roadId) {
      return roads.get(roadId)?.status ?? "AVAILABLE";
    },

    /** Roads that aren't available, as roadId → status. */
    busyRoads() {
      return Object.fromEntries(
        [...roads]
          .filter(([, road]) => road.status !== "AVAILABLE")
          .map(([roadId, road]) => [roadId, road.status]),
      );
    },

    /**
     * What a vehicle at an entrance should do, or null if it isn't at one.
     * Inside a road, the right-of-way alerts apply instead.
     */
    entryFor(vehicle, others) {
      if (vehicle.insideRoadIds.length > 0) return null;

      const [roadId] = entranceRoadIds(vehicle).sort(
        (a, b) =>
          vehicle.atEntrances[a].distanceM - vehicle.atEntrances[b].distanceM,
      );

      const road = roadId && roads.get(roadId);

      if (!road) return null;

      const entry = (action, conflicts = [], extra = {}) => ({
        action,
        roadId,
        roadName: vehicle.atEntrances[roadId].roadName,
        status: road.status,
        conflicts,
        ...extra,
      });

      if (road.holder?.vehicleId === vehicle.vehicleId) return entry("GO");

      const insiders = others.filter((other) =>
        other.insideRoadIds.includes(roadId),
      );

      const sameWay = (other) => relation(vehicle, other) === "SAME_DIRECTION";

      if (insiders.length > 0) {
        if (insiders.every(sameWay)) return entry("FOLLOW", insiders);

        // Not told to wait. Those inside are told it's coming.
        if (isPriorityVehicle(vehicle.vehicleType)) {
          return entry("PRIORITY", insiders);
        }

        return entry("WAIT", insiders, { reason: "OCCUPIED" });
      }

      const holder = others.find(
        (other) => other.vehicleId === road.holder?.vehicleId,
      );

      if (!holder) return null;

      if (sameWay(holder)) return entry("FOLLOW", [holder]);

      return entry("WAIT", [holder], {
        reason: "RESERVED",
        byPriority:
          isPriorityVehicle(holder.vehicleType) &&
          !isPriorityVehicle(vehicle.vehicleType),
      });
    },
  };
}

module.exports = {
  createOccupancyTracker,
  HOLD_MAX_MS,
  HOLD_STOPPED_MS,
};
