/**
 * Whether each narrow road is available, reserved or occupied, and what a
 * vehicle at one of its entrances should do: go, follow, or wait, and its
 * place in the queue.
 *
 * OCCUPIED: one or more vehicles are inside.
 * RESERVED: nobody is inside, and the road has been given to vehicles at
 *           one entrance.
 * AVAILABLE: nobody is inside or waiting.
 *
 * The road is given to one vehicle at a time, chosen in a fixed order, so
 * vehicles at opposite ends are never both told to go. Vehicles waiting at
 * the same end go through after it as a group, up to a limit, so the road
 * doesn't switch direction for every car. Then it's the other end's turn.
 * When anything is unclear, such as which way a stopped vehicle is going,
 * the answer is wait.
 */

const { getTravelBearing } = require("../utils/geo");
const { isPriorityVehicle } = require("../utils/vehicleTypes");

// A vehicle given the road that hasn't entered after this long loses it, and
// goes to the back of the line
const HOLD_MAX_MS = 60000;

// One that stays stopped this long after being told to go, such as a car
// parked near the entrance, loses it sooner
const HOLD_STOPPED_MS = 15000;

// A group from one end is at most this many vehicles, and stops taking more
// after this long, so the other end always gets a turn
const GROUP_MAX_VEHICLES = 3;
const GROUP_MAX_MS = 30000;

const isStopped = (vehicle) =>
  getTravelBearing(vehicle.speed, vehicle.bearing) === null;

const isPriority = (vehicle) => isPriorityVehicle(vehicle.vehicleType);

const entranceRoadIds = (vehicle) =>
  Object.keys(vehicle.atEntrances ?? {}).filter(
    (roadId) => !vehicle.insideRoadIds.includes(roadId),
  );

// Which entrance of the road a vehicle is at
const entranceOf = (vehicle, roadId) =>
  vehicle.atEntrances?.[roadId]?.entrance ?? 0;

/**
 * relation(a, b) says how two vehicles are moving relative to each other,
 * as in narrowRoadAlert: SAME_DIRECTION, ONCOMING or UNKNOWN.
 */
function createOccupancyTracker(relation) {
  // roadId → {
  //   queue: Map(vehicleId → when it arrived),
  //   holder: the vehicle given the road while it's empty,
  //   group: the vehicles from one end going through together,
  //   lastGroupEntrance: the end that went last, so the other goes next,
  //   order: waiting vehicles' IDs in the order they'll go,
  //   status,
  // }
  const roads = new Map();

  // A priority vehicle first, then whoever arrived first, then the ID, so
  // the order is always the same
  const byArrival = (queue) => (a, b) =>
    Number(isPriority(b)) - Number(isPriority(a)) ||
    queue.get(a.vehicleId) - queue.get(b.vehicleId) ||
    (a.vehicleId < b.vehicleId ? -1 : 1);

  function updateRoad(roadId, inside, waiting, now) {
    const road = roads.get(roadId) ?? {
      queue: new Map(),
      holder: null,
      group: null,
      lastGroupEntrance: null,
      order: [],
      status: "AVAILABLE",
    };

    // ── The queue: vehicles at the entrances, and when each arrived ──

    const waitingIds = new Set(waiting.map((vehicle) => vehicle.vehicleId));
    const insideIds = new Set(inside.map((vehicle) => vehicle.vehicleId));

    for (const vehicleId of road.queue.keys()) {
      if (!waitingIds.has(vehicleId)) road.queue.delete(vehicleId);
    }

    for (const vehicle of waiting) {
      if (!road.queue.has(vehicle.vehicleId)) {
        road.queue.set(vehicle.vehicleId, now);
      }
    }

    // ── The vehicle given the road ──

    let { holder, group } = road;
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
        group = null;
      } else if (!isPriority(holding) && waiting.some(isPriority)) {
        // A priority vehicle takes the road from one that hasn't gone in yet
        holder = null;
        group = null;
      }
    }

    // ── The group going through from one end ──

    if (group) {
      // Members that have gone through or left
      for (const vehicleId of group.members) {
        if (!waitingIds.has(vehicleId) && !insideIds.has(vehicleId)) {
          group.gone.add(vehicleId);
        }
      }

      const stillGoing = [...group.members].some(
        (vehicleId) => !group.gone.has(vehicleId),
      );

      // The road has stood empty while members wait without going in, such
      // as a car parked at the entrance. They go to the back of the line.
      const idle = inside.length === 0 && !holder;
      group.idleSince = idle ? (group.idleSince ?? now) : null;
      const stalled = idle && now - group.idleSince >= HOLD_STOPPED_MS;

      if (stalled) {
        for (const vehicleId of group.members) {
          if (road.queue.has(vehicleId)) road.queue.set(vehicleId, now);
        }
      }

      if (!stillGoing || stalled) {
        road.lastGroupEntrance = group.entrance;
        group = null;
      }
    }

    if (group) {
      const open =
        group.members.size < GROUP_MAX_VEHICLES &&
        now - group.startedAt < GROUP_MAX_MS &&
        !waiting.some(isPriority) &&
        inside.every((vehicle) => group.members.has(vehicle.vehicleId));

      if (open) {
        const joining = waiting
          .filter(
            (vehicle) =>
              !group.members.has(vehicle.vehicleId) &&
              entranceOf(vehicle, roadId) === group.entrance,
          )
          .sort(byArrival(road.queue));

        for (const vehicle of joining) {
          if (group.members.size >= GROUP_MAX_VEHICLES) break;
          group.members.add(vehicle.vehicleId);
        }
      }
    }

    // ── Giving the road to the next vehicle ──

    if (!holder && !group && inside.length === 0 && waiting.length > 0) {
      // After one end's group, the other end goes next, unless a priority
      // vehicle is waiting
      const otherEnd = waiting.filter(
        (vehicle) => entranceOf(vehicle, roadId) !== road.lastGroupEntrance,
      );
      const candidates = waiting.some(isPriority)
        ? waiting.filter(isPriority)
        : road.lastGroupEntrance !== null && otherEnd.length > 0
          ? otherEnd
          : waiting;

      const next = [...candidates].sort(byArrival(road.queue))[0];

      holder = { vehicleId: next.vehicleId, since: now, stoppedSince: null };
      group = {
        entrance: entranceOf(next, roadId),
        members: new Set([next.vehicleId]),
        gone: new Set(),
        startedAt: now,
      };
    }

    // ── The order everyone waiting will go in ──

    const groupFirst = (vehicle) =>
      group?.members.has(vehicle.vehicleId) ? 0 : 1;
    const otherEndFirst = (vehicle) =>
      entranceOf(vehicle, roadId) ===
      (group?.entrance ?? road.lastGroupEntrance)
        ? 1
        : 0;

    road.order = [...waiting]
      .sort(
        (a, b) =>
          (holder?.vehicleId === b.vehicleId) -
            (holder?.vehicleId === a.vehicleId) ||
          groupFirst(a) - groupFirst(b) ||
          Number(isPriority(b)) - Number(isPriority(a)) ||
          otherEndFirst(a) - otherEndFirst(b) ||
          byArrival(road.queue)(a, b),
      )
      .map((vehicle) => vehicle.vehicleId);

    const groupWaiting =
      group && waiting.some((vehicle) => group.members.has(vehicle.vehicleId));

    road.holder = holder;
    road.group = group;
    road.status =
      inside.length > 0
        ? "OCCUPIED"
        : holder || groupWaiting
          ? "RESERVED"
          : "AVAILABLE";

    if (road.status === "AVAILABLE" && road.queue.size === 0 && !group) {
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
        for (const roadId of vehicle.insideRoadIds) {
          add(inside, roadId, vehicle);
        }
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

    /** The vehicles waiting for a road, in the order they'll go. */
    queueOf(roadId) {
      return roads.get(roadId)?.order ?? [];
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

      // Its place in the queue, and who is ahead of it
      const index = road.order.indexOf(vehicle.vehicleId);
      const ahead = road.order
        .slice(0, Math.max(index, 0))
        .map((id) => others.find((other) => other.vehicleId === id))
        .filter(Boolean);
      const myEnd = entranceOf(vehicle, roadId);

      const queue = {
        position: index >= 0 ? index + 1 : null,
        aheadSameEnd: ahead.filter((v) => entranceOf(v, roadId) === myEnd)
          .length,
        aheadOtherEnd: ahead.filter((v) => entranceOf(v, roadId) !== myEnd)
          .length,
        priorityAhead: ahead.some(isPriority) && !isPriority(vehicle),
      };

      const entry = (action, conflicts = [], extra = {}) => ({
        action,
        roadId,
        roadName: vehicle.atEntrances[roadId].roadName,
        status: road.status,
        conflicts,
        ...queue,
        ...extra,
      });

      if (road.holder?.vehicleId === vehicle.vehicleId) return entry("GO");

      const insiders = others.filter((other) =>
        other.insideRoadIds.includes(roadId),
      );

      const { group } = road;
      const inGroup = group?.members.has(vehicle.vehicleId);

      // Part of the group from this end: it follows the vehicles ahead of
      // it, unless someone from another end has gone in
      if (inGroup) {
        const groupAhead = [...insiders, ...ahead].filter((other) =>
          group.members.has(other.vehicleId),
        );

        if (insiders.every((other) => group.members.has(other.vehicleId))) {
          return entry("FOLLOW", groupAhead.slice(-1));
        }

        return entry("WAIT", insiders, { reason: "OCCUPIED" });
      }

      const sameWay = (other) => relation(vehicle, other) === "SAME_DIRECTION";

      if (insiders.length > 0) {
        // Behind vehicles that went in without the road being given out,
        // and are clearly going the same way
        if (!group && insiders.every(sameWay)) {
          return entry("FOLLOW", insiders);
        }

        // Not told to wait. Those inside are told it's coming.
        if (isPriority(vehicle)) return entry("PRIORITY", insiders);

        // Its end has had its group, and the other end goes next
        const turn = group && group.entrance === myEnd;

        return entry("WAIT", insiders, {
          reason: turn ? "TURN" : "OCCUPIED",
        });
      }

      const goers = others.filter(
        (other) =>
          other.vehicleId === road.holder?.vehicleId ||
          group?.members.has(other.vehicleId),
      );

      if (goers.length === 0) return null;

      const leader =
        goers.find((other) => other.vehicleId === road.holder?.vehicleId) ??
        goers[0];

      return entry("WAIT", [leader], {
        reason: group && group.entrance === myEnd ? "TURN" : "RESERVED",
        byPriority: isPriority(leader) && !isPriority(vehicle),
      });
    },
  };
}

module.exports = {
  createOccupancyTracker,
  HOLD_MAX_MS,
  HOLD_STOPPED_MS,
  GROUP_MAX_VEHICLES,
  GROUP_MAX_MS,
};
