/**
 * Mountain Mode: vehicles on ghat roads, and what to do at hairpin bends.
 *
 * Each vehicle is placed on the ghat road it's on, by how many metres along
 * the road it is. Its direction (up or down) and speed come from how that
 * changes over the last few readings, which follows the road round the bends
 * where a compass would spin.
 *
 * At a bend, vehicles from opposite directions that would be in its turning
 * zone at the same time are told what to do. Two cars keep left. A bus,
 * lorry or truck needs the whole road to turn, so a car waits before the
 * bend. Between two of those, the one going uphill goes first, as the hill
 * road rule says. A vehicle already in the bend finishes it, and a priority
 * vehicle goes first.
 */

const { locateOnRoad, lineBetween } = require("./hillRoads");
const { isPriorityVehicle } = require("../utils/vehicleTypes");

// ── Placing vehicles on the road ────────────────────────────────────────

// A position this close to a ghat road is on it. Once on, a little further
// is allowed, as GPS is poor on hill roads.
const ON_ROAD_M = 15;
const STAY_ON_M = 25;

// Readings kept for working out direction and speed. Speed is averaged
// over the most recent ones, so a vehicle that stops is noticed quickly.
const KEEP_READINGS_MS = 6000;
const SPEED_OVER_MS = 3000;

// The last readings must all move the same way, by this much overall, to
// show the direction
const DIRECTION_READINGS = 3;
const DIRECTION_MIN_M = 2;

// Slower than this along the road counts as stopped
const MOVING_MPS = 1;

// A stopped vehicle is still facing the way it was going, for this long
const DIRECTION_MEMORY_MS = 2 * 60 * 1000;

// ── Bend decisions ──────────────────────────────────────────────────────

// Bends further ahead than this aren't looked at yet
const LOOK_AHEAD_M = 250;

// Vehicles that would reach the bend within this time are compared
const HORIZON_S = 20;

// Extra time either side of being in the bend, as speeds change and
// positions arrive about a second late
const MARGIN_S = 3;

// A stopped or crawling vehicle this close to a bend could move into it
// at any moment, so it counts as at the bend
const AT_BEND_M = 50;
const CRAWL_MPS = 2;

// These need the whole road to turn at a hairpin
const HEAVY_TYPES = new Set(["bus", "lorry", "truck"]);
const HEAVY_LENGTH_M = 12;
const LENGTH_M = 5;

// The vehicle that waited is told the bend is clear for this long
const CLEAR_FOR_MS = 20000;

// A car this close behind a heavy vehicle near a bend is told not to overtake
const BEHIND_M = 150;
const NEAR_BEND_M = 100;

const isHeavy = (vehicle) => HEAVY_TYPES.has(vehicle.vehicleType);

/**
 * The vehicle's place on a ghat road after a new position, or null if it's
 * not on one. `previous` is its last place, or null.
 */
function updateHillPosition(previous, lat, lon, roads, now) {
  const elapsedS = previous ? (now - previous.at) / 1000 : 0;
  const expected =
    previous && elapsedS < KEEP_READINGS_MS / 1000
      ? previous.metre + previous.speed * elapsedS
      : null;

  let found = null;

  for (const road of roads) {
    const staying = previous?.roadId === road.id;
    const place = locateOnRoad(
      lat,
      lon,
      road,
      staying ? STAY_ON_M : ON_ROAD_M,
      staying ? expected : null,
    );

    if (place && (!found || place.distanceM < found.place.distanceM)) {
      found = { road, place };
    }
  }

  if (!found) return null;

  const { road, place } = found;
  const sameRoad = previous?.roadId === road.id;

  const readings = [
    ...(sameRoad ? previous.readings : []).filter(
      (reading) => now - reading.at <= KEEP_READINGS_MS,
    ),
    { at: now, metre: place.metre },
  ];

  // Speed along the road, over the last few seconds
  const first =
    readings.find((reading) => now - reading.at <= SPEED_OVER_MS) ??
    readings[0];
  const spanS = (now - first.at) / 1000;
  const velocity = spanS >= 1 ? (place.metre - first.metre) / spanS : 0;

  // Direction: the last few readings all moving the same way
  const recent = readings.slice(-DIRECTION_READINGS);
  const steps = recent
    .slice(1)
    .map((reading, i) => reading.metre - recent[i].metre);
  const net = recent[recent.length - 1].metre - recent[0].metre;

  let direction = 0;

  if (
    recent.length === DIRECTION_READINGS &&
    Math.abs(velocity) >= MOVING_MPS &&
    Math.abs(net) >= DIRECTION_MIN_M &&
    steps.every((step) => Math.sign(step) === Math.sign(net))
  ) {
    direction = Math.sign(net);
  }

  const remembered =
    sameRoad &&
    previous.heading &&
    now - previous.headingAt < DIRECTION_MEMORY_MS;

  return {
    roadId: road.id,
    roadName: road.name,
    metre: place.metre,
    at: now,
    readings,
    speed: Math.abs(velocity) >= MOVING_MPS ? velocity : 0,
    moving: Math.abs(velocity) >= MOVING_MPS,

    // +1 up the road, -1 down, kept for a while after stopping
    heading: direction || (remembered ? previous.heading : 0),
    headingAt: direction ? now : remembered ? previous.headingAt : null,
  };
}

/**
 * The bend a vehicle is in, or the next one ahead in the way it's going, and
 * when it would be in its turning zone.
 */
function bendAhead(vehicle, road) {
  const { metre, heading, speed, moving } = vehicle.hill;

  if (!heading) return null;

  const bend =
    road.bends.find((b) => metre >= b.startM && metre <= b.endM) ??
    (heading > 0
      ? road.bends.find((b) => b.startM > metre)
      : [...road.bends].reverse().find((b) => b.endM < metre));

  if (!bend) return null;

  const inside = metre >= bend.startM && metre <= bend.endM;
  const toZoneM = inside
    ? 0
    : heading > 0
      ? bend.startM - metre
      : metre - bend.endM;

  if (toZoneM > LOOK_AHEAD_M) return null;

  const length = isHeavy(vehicle) ? HEAVY_LENGTH_M : LENGTH_M;
  const zoneLeftM =
    heading > 0
      ? bend.endM - Math.max(metre, bend.startM)
      : Math.min(metre, bend.endM) - bend.startM;
  const pace = Math.abs(speed);

  let entersS;
  let leavesS;

  if (moving && pace >= CRAWL_MPS) {
    entersS = toZoneM / pace;
    leavesS = entersS + (zoneLeftM + length) / pace;
  } else if (toZoneM <= AT_BEND_M) {
    // Stopped or crawling near the bend: it could go in at any moment
    entersS = 0;
    leavesS = (toZoneM + zoneLeftM + length) / CRAWL_MPS;
  } else {
    return null;
  }

  return { bend, inside, toZoneM, entersS, leavesS };
}

/**
 * Of two vehicles meeting at a bend, the one that goes first, or null when
 * both fit, which is when neither needs the whole road.
 */
function whoGoesFirst(a, b, atA, atB) {
  const heavyA = isHeavy(a);
  const heavyB = isHeavy(b);

  if (!heavyA && !heavyB) return null;

  // Already turning: it finishes the bend
  if (atA.inside !== atB.inside) return atA.inside ? a : b;

  const priorityA = isPriorityVehicle(a.vehicleType);
  const priorityB = isPriorityVehicle(b.vehicleType);

  if (priorityA !== priorityB) return priorityA ? a : b;

  if (heavyA !== heavyB) return heavyA ? a : b;

  // Two heavy vehicles: uphill first
  if (a.hill.heading !== b.hill.heading) return a.hill.heading > 0 ? a : b;

  return atA.entersS <= atB.entersS ? a : b;
}

const ALERT_ORDER = [
  "BEND_STOP",
  "BEND_CLEAR",
  "BEND_GO",
  "BEND_KEEP_LEFT",
  "BEND_NO_OVERTAKE",
];

const LEVELS = {
  BEND_STOP: "danger",
  BEND_CLEAR: "clear",
  BEND_GO: "clear",
  BEND_KEEP_LEFT: "caution",
  BEND_NO_OVERTAKE: "caution",
};

function createMountainTracker(getRoad) {
  // `${roadId}|${bendNumber}|${a}|${b}` → who goes first and who waits
  const decisions = new Map();

  let alerts = new Map();
  let info = new Map();

  const pairKey = (road, bend, a, b) => {
    const [first, second] = [a.vehicleId, b.vehicleId].sort();
    return `${road.id}|${bend.number}|${first}|${second}`;
  };

  return {
    update(vehicles, now = Date.now()) {
      const nextAlerts = new Map();
      const nextInfo = new Map();

      const onHills = vehicles.filter((v) => v.hill && getRoad(v.hill.roadId));
      const ahead = new Map();

      const offer = (vehicle, alert) => {
        const current = nextAlerts.get(vehicle.vehicleId);

        if (
          !current ||
          ALERT_ORDER.indexOf(alert.kind) < ALERT_ORDER.indexOf(current.kind)
        ) {
          nextAlerts.set(vehicle.vehicleId, alert);
        }
      };

      // The bend counter, for every vehicle on a ghat road
      for (const vehicle of onHills) {
        const road = getRoad(vehicle.hill.roadId);
        const at = bendAhead(vehicle, road);

        ahead.set(vehicle.vehicleId, at);

        const { metre, heading } = vehicle.hill;
        const inBend = road.bends.find(
          (b) => metre >= b.startM && metre <= b.endM,
        );
        const next =
          inBend ??
          (heading < 0
            ? [...road.bends].reverse().find((b) => b.endM < metre)
            : road.bends.find((b) => b.startM > metre));

        nextInfo.set(vehicle.vehicleId, {
          roadId: road.id,
          roadName: road.name,
          bendCount: road.bends.length,
          heading: heading > 0 ? "UP" : heading < 0 ? "DOWN" : null,
          inBend: inBend?.number ?? null,
          nextBend: next
            ? {
                number: next.number,
                distanceM: inBend
                  ? 0
                  : Math.round(
                      heading < 0 ? metre - next.endM : next.startM - metre,
                    ),
                zone: lineBetween(
                  road.line,
                  road.metres,
                  next.startM,
                  next.endM,
                ),
              }
            : null,
        });
      }

      // Pairs from opposite directions heading for the same bend
      const current = new Set();

      onHills.forEach((a, index) => {
        for (const b of onHills.slice(index + 1)) {
          const atA = ahead.get(a.vehicleId);
          const atB = ahead.get(b.vehicleId);

          if (
            !atA ||
            !atB ||
            a.hill.roadId !== b.hill.roadId ||
            atA.bend.number !== atB.bend.number ||
            a.hill.heading === b.hill.heading
          ) {
            continue;
          }

          const road = getRoad(a.hill.roadId);
          const { bend } = atA;
          const key = pairKey(road, bend, a, b);

          const overlap =
            Math.max(atA.entersS, atB.entersS) - MARGIN_S <=
            Math.min(atA.leavesS, atB.leavesS) + MARGIN_S;

          const soon = atA.entersS <= HORIZON_S && atB.entersS <= HORIZON_S;

          if (!decisions.has(key) && !(overlap && soon)) continue;

          current.add(key);

          if (!decisions.has(key)) {
            const first = whoGoesFirst(a, b, atA, atB);

            decisions.set(
              key,
              first ? { goId: first.vehicleId, at: now } : { keepLeft: true },
            );
          }

          const decision = decisions.get(key);

          if (decision.keepLeft) {
            for (const [vehicle, other] of [
              [a, b],
              [b, a],
            ]) {
              offer(vehicle, {
                kind: "BEND_KEEP_LEFT",
                bendNumber: bend.number,
                otherVehicleType: other.vehicleType ?? null,
              });
            }

            continue;
          }

          const [goer, waiter] =
            decision.goId === a.vehicleId ? [a, b] : [b, a];
          const waitAt =
            waiter.hill.heading > 0 ? bend.waitBelow : bend.waitAbove;

          offer(goer, {
            kind: "BEND_GO",
            bendNumber: bend.number,
            otherVehicleType: waiter.vehicleType ?? null,
          });

          offer(waiter, {
            kind: "BEND_STOP",
            bendNumber: bend.number,
            otherVehicleType: goer.vehicleType ?? null,
            waitPoint: waitAt,
          });
        }
      });

      // Decisions whose vehicles have moved on. The one that waited is told
      // the bend is clear once the other has come out on its side.
      for (const [key, decision] of decisions) {
        if (current.has(key)) continue;

        const [roadId, number, idA, idB] = key.split("|");
        const road = getRoad(roadId);
        const bend = road?.bends.find((b) => String(b.number) === number);
        const goer = onHills.find((v) => v.vehicleId === decision.goId);
        const waiter = onHills.find(
          (v) => v.vehicleId === (decision.goId === idA ? idB : idA),
        );

        const stillWaiting =
          !decision.keepLeft &&
          bend &&
          waiter?.hill.roadId === roadId &&
          now - (decision.clearAt ?? now) < CLEAR_FOR_MS &&
          !(waiter.hill.metre > bend.startM && waiter.hill.metre < bend.endM);

        if (!stillWaiting) {
          decisions.delete(key);
          continue;
        }

        const goerOut =
          !goer ||
          goer.hill.roadId !== roadId ||
          (waiter.hill.heading > 0
            ? goer.hill.metre < bend.startM
            : goer.hill.metre > bend.endM);

        if (goerOut) {
          decision.clearAt ??= now;
          offer(waiter, { kind: "BEND_CLEAR", bendNumber: bend.number });
        } else {
          offer(waiter, {
            kind: "BEND_STOP",
            bendNumber: bend.number,
            otherVehicleType: goer.vehicleType ?? null,
            waitPoint:
              waiter.hill.heading > 0 ? bend.waitBelow : bend.waitAbove,
          });
        }
      }

      // Not overtaking a heavy vehicle at a bend
      for (const vehicle of onHills) {
        const { roadId, heading, metre } = vehicle.hill;

        if (!heading) continue;

        const leader = onHills.find((other) => {
          if (other === vehicle || !isHeavy(other)) return false;
          if (other.hill.roadId !== roadId || other.hill.heading !== heading)
            return false;

          const gap = (other.hill.metre - metre) * heading;
          const at = ahead.get(other.vehicleId);

          return gap > 0 && gap <= BEHIND_M && at && at.toZoneM <= NEAR_BEND_M;
        });

        if (leader) {
          offer(vehicle, {
            kind: "BEND_NO_OVERTAKE",
            bendNumber: ahead.get(leader.vehicleId).bend.number,
            otherVehicleType: leader.vehicleType ?? null,
          });
        }
      }

      for (const [vehicleId, alert] of nextAlerts) {
        const vehicle = onHills.find((v) => v.vehicleId === vehicleId);

        nextAlerts.set(vehicleId, {
          ...alert,
          level: LEVELS[alert.kind],
          roadId: vehicle.hill.roadId,
          roadName: vehicle.hill.roadName,
          otherCount: alert.otherVehicleType === undefined ? 0 : 1,
          byPriority: false,
          bendCount: nextInfo.get(vehicleId)?.bendCount ?? null,
        });
      }

      alerts = nextAlerts;
      info = nextInfo;
    },

    /** The bend alert for this vehicle, or null. */
    alertFor(vehicleId) {
      return alerts.get(vehicleId) ?? null;
    },

    /** Where this vehicle is on a ghat road, for the bend counter, or null. */
    infoFor(vehicleId) {
      return info.get(vehicleId) ?? null;
    },
  };
}

module.exports = {
  updateHillPosition,
  createMountainTracker,
  HEAVY_TYPES,
  AT_BEND_M,
  HORIZON_S,
};
