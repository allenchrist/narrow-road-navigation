/**
 * Road entrances, vehicles arriving at them, and whether each road is
 * available, reserved or occupied. Needs no running server or database.
 *
 * Usage:
 *   npm run test:occupancy
 */

const assert = require("assert");
const { findEntrances, waysFromOsmApi } = require("../services/roadEntrances");
const { computeGeofenceState } = require("../services/geofenceService");
const { updateEntrances } = require("../services/entranceWatch");
const {
  createOccupancyTracker,
  HOLD_MAX_MS,
  HOLD_STOPPED_MS,
} = require("../services/roadOccupancy");
const {
  buildNarrowRoadAlert,
  createRightOfWayTracker,
  getRelation,
} = require("../services/narrowRoadAlert");
const { distanceBetween } = require("../utils/geo");

// ── A small made-up map, in metres east (x) and north (y) of a point ────

const ORIGIN = [11, 77];
const M_PER_DEG = 111194.9;

const at = (x, y) => [
  ORIGIN[0] + y / M_PER_DEG,
  ORIGIN[1] + x / (M_PER_DEG * Math.cos((ORIGIN[0] * Math.PI) / 180)),
];

// A narrow lane 100 m long and 4 m wide, from x = 0 to x = 100
const POLYGON = [at(0, -2), at(100, -2), at(100, 2), at(0, 2)];

let nextNode = 1;
const nodeIds = new Map();

const node = (x, y) => {
  const key = `${x},${y}`;
  if (!nodeIds.has(key)) nodeIds.set(key, nextNode++);
  return nodeIds.get(key);
};

const way = (highway, points) => ({
  type: "way",
  tags: { highway },
  nodes: points.map(([x, y]) => node(x, y)),
  geometry: points.map(([x, y]) => {
    const [lat, lon] = at(x, y);
    return { lat, lon };
  }),
});

const WAYS = [
  // The lane itself, carrying on beyond both ends
  way("residential", [
    [-80, 0],
    [-20, 0],
    [50, 0],
    [120, 0],
    [180, 0],
  ]),
  // A cross street at the west end
  way("residential", [
    [-20, -60],
    [-20, 0],
    [-20, 60],
  ]),
  // A side lane joining in the middle, from the south
  way("service", [
    [50, 0],
    [50, -70],
  ]),
  // A parallel street 30 m north, not connected
  way("residential", [
    [0, 30],
    [150, 30],
  ]),
  // A footpath joining from the north, which cars can't use
  way("footway", [
    [70, 0],
    [70, 40],
  ]),
];

const ENTRANCES = findEntrances(POLYGON, WAYS);

const ROAD = {
  id: "R1",
  name: "Test Lane",
  polygon: POLYGON,
  entrances: ENTRANCES,
};

const metresFrom = (point, x, y) =>
  distanceBetween(point[0], point[1], ...at(x, y));

const entranceNear = (x, y) =>
  ENTRANCES.find((entrance) => metresFrom(entrance.point, x, y) < 8);

// ── Vehicles ────────────────────────────────────────────────────────────

const EAST = 90;
const WEST = 270;
const NORTH = 0;
const MOVING = 5;

// Drives a vehicle through readings, one a second, as the server would
function drive(readings, start = {}) {
  let state = {
    entranceHistory: {},
    atEntrances: {},
    leftRoadAt: {},
    insideRoadIds: [],
    ...start,
  };

  let now = start.now ?? 0;

  for (const [x, y, speed, bearing] of readings) {
    now += 1000;

    const [lat, lon] = at(x, y);
    const geofence = computeGeofenceState(
      lat,
      lon,
      speed >= 1 ? bearing : null,
      [ROAD],
      5,
    );

    state = {
      ...state,
      ...updateEntrances(
        state,
        geofence.entranceCandidates,
        geofence.insideRoadIds,
        now,
      ),
      insideRoadIds: geofence.insideRoadIds,
      now,
    };
  }

  return state;
}

const isAtEntrance = (state) => Boolean(state.atEntrances.R1);

// A vehicle for the occupancy rules, already placed
function vehicle(
  id,
  {
    inside = false,
    entrance = null,
    speed = MOVING,
    bearing = EAST,
    type = "car",
    // Which end: cars heading west come from the other end
    end = bearing === WEST ? 1 : bearing === NORTH ? 2 : 0,
  } = {},
) {
  return {
    vehicleId: id,
    vehicleType: type,
    insideRoadIds: inside ? ["R1"] : [],
    atEntrances: entrance
      ? {
          R1: {
            roadId: "R1",
            roadName: "Test Lane",
            distanceM: entrance,
            entrance: end,
            point: at(0, 0),
          },
        }
      : {},
    speed,
    bearing,
    roadEnteredAt: inside ? { R1: 0 } : {},
  };
}

function actions(tracker, vehicles, now) {
  tracker.update(vehicles, now);

  return Object.fromEntries(
    vehicles.map((v) => [
      v.vehicleId,
      tracker.entryFor(
        v,
        vehicles.filter((other) => other !== v),
      )?.action ?? null,
    ]),
  );
}

const newTracker = () => createOccupancyTracker(getRelation);

// Cars waiting at the north end (0) or the south end (1), stopped
const north = (id, extra = {}) =>
  vehicle(id, { entrance: 20, speed: 0, end: 0, ...extra });
const south = (id, extra = {}) =>
  vehicle(id, { entrance: 20, speed: 0, end: 1, ...extra });
const inRoad = (id, extra = {}) => vehicle(id, { inside: true, ...extra });

// Each car's action and place in the queue, after cars arrive one a second
function queueAfter(tracker, arrivals, at = 0) {
  arrivals.forEach((_, i) =>
    tracker.update(arrivals.slice(0, i + 1), at + i * 1000),
  );
  const now = at + arrivals.length * 1000;
  tracker.update(arrivals, now);

  return Object.fromEntries(
    arrivals.map((v) => {
      const entry = tracker.entryFor(
        v,
        arrivals.filter((o) => o !== v),
      );
      return [v.vehicleId, entry && `${entry.action} ${entry.position}`];
    }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

const tests = {
  // Finding entrances

  "entrances are where roads leave the shape: both ends and the side lane":
    () => {
      assert.strictEqual(ENTRANCES.length, 3);
      assert.ok(entranceNear(-6, 0), "west end");
      assert.ok(entranceNear(106, 0), "east end");
      assert.ok(entranceNear(50, -8), "side lane");
    },
  "the west entrance has a lane for each road leading to it": () => {
    // Straight on, and both ways along the cross street
    assert.strictEqual(entranceNear(-6, 0).lanes.length, 3);
  },
  "lanes go back about 60 m from the entrance": () => {
    const lane = entranceNear(106, 0).lanes[0];
    const end = lane[lane.length - 1];
    assert.ok(Math.abs(metresFrom(end, 166, 0)) < 2);
  },
  "a parallel street and a footpath aren't entrances": () => {
    for (const entrance of ENTRANCES) {
      for (const lane of entrance.lanes) {
        for (const point of lane) {
          assert.ok(metresFrom(point, 70, 20) > 15, "footpath");
          assert.ok(
            ![...Array(15).keys()].some(
              (i) => metresFrom(point, i * 10, 30) < 3,
            ),
            "parallel street",
          );
        }
      }
    }
  },
  "a map line wandering a few metres off the lane isn't an entrance": () => {
    const wobbly = [
      way("residential", [
        [-50, 0],
        [40, 0],
        [50, 8],
        [60, 0],
        [150, 0],
      ]),
    ];
    assert.strictEqual(findEntrances(POLYGON, wobbly).length, 2);
  },
  "roads from OpenStreetMap's main API give the same entrances": () => {
    // The made-up map, as the main API sends it: nodes, then ways by node ID
    const nodes = new Map();
    for (const w of WAYS) {
      w.nodes.forEach((id, i) => nodes.set(id, w.geometry[i]));
    }
    const elements = [
      ...[...nodes].map(([id, { lat, lon }]) => ({
        type: "node",
        id,
        lat,
        lon,
      })),
      ...WAYS.map((w, i) => ({
        type: "way",
        id: i + 1,
        tags: w.tags,
        nodes: w.nodes,
      })),
      { type: "way", id: 99, tags: { building: "yes" }, nodes: [1, 2] },
    ];
    const ways = waysFromOsmApi(elements);
    assert.strictEqual(ways.length, WAYS.length, "buildings are left out");
    assert.deepStrictEqual(
      findEntrances(POLYGON, ways).map((e) => e.point),
      ENTRANCES.map((e) => e.point),
    );
  },
  "with no roads known, the middles of the shape's ends are used": () => {
    const ends = findEntrances(POLYGON, []);
    assert.strictEqual(ends.length, 2);
    assert.ok(ends.some((end) => metresFrom(end.point, 0, 0) < 1));
    assert.ok(ends.some((end) => metresFrom(end.point, 100, 0) < 1));
    assert.ok(ends.every((end) => end.lanes.length === 0));
  },

  // Arriving at an entrance

  "a car driving up the cross street towards the lane arrives": () => {
    const state = drive([
      [-20, -50, MOVING, NORTH],
      [-20, -45, MOVING, NORTH],
      [-20, -40, MOVING, NORTH],
    ]);
    assert.ok(isAtEntrance(state));
  },
  "it takes three readings getting closer, not one": () => {
    assert.ok(!isAtEntrance(drive([[-20, -40, MOVING, NORTH]])));
    assert.ok(
      !isAtEntrance(
        drive([
          [-20, -45, MOVING, NORTH],
          [-20, -40, MOVING, NORTH],
        ]),
      ),
    );
  },
  "a car on the parallel street is ignored, however close": () => {
    const state = drive([
      [20, 30, MOVING, EAST],
      [25, 30, MOVING, EAST],
      [30, 30, MOVING, EAST],
      [35, 30, MOVING, EAST],
    ]);
    assert.ok(!isAtEntrance(state));
  },
  "a car beside the lane, not at an entrance, is ignored": () => {
    const state = drive([
      [80, -14, 0, null],
      [80, -14, 0, null],
    ]);
    assert.ok(!isAtEntrance(state));
  },
  "a car stopped within 20 m of an entrance is waiting": () => {
    assert.ok(isAtEntrance(drive([[120, 0, 0, null]])));
  },
  "a car stopped 30 m away isn't": () => {
    assert.ok(!isAtEntrance(drive([[136, 0, 0, null]])));
  },
  "a car that arrives and stops 30 m back keeps its place": () => {
    const state = drive([
      [155, 0, MOVING, WEST],
      [150, 0, MOVING, WEST],
      [145, 0, MOVING, WEST],
      [140, 0, MOVING, WEST],
      [136, 0, 0, null],
      [136, 0, 0, null],
    ]);
    assert.ok(isAtEntrance(state));
  },
  "a car driving away from the entrance stops counting": () => {
    const arrived = drive([
      [140, 0, MOVING, WEST],
      [135, 0, MOVING, WEST],
      [130, 0, MOVING, WEST],
    ]);
    assert.ok(isAtEntrance(arrived));
    const leaving = drive(
      [
        [133, 0, MOVING, EAST],
        [137, 0, MOVING, EAST],
      ],
      arrived,
    );
    assert.ok(!isAtEntrance(leaving));
  },
  "a car that has just driven out and stops near the end isn't waiting": () => {
    const state = drive([
      [90, 0, MOVING, EAST],
      [100, 0, MOVING, EAST],
      [110, 0, MOVING, EAST],
      [118, 0, 0, null],
      [118, 0, 0, null],
    ]);
    assert.ok(!isAtEntrance(state));
  },
  "a car inside the lane isn't at its entrance": () => {
    assert.ok(!isAtEntrance(drive([[50, 0, 0, null]])));
  },

  // Who goes

  "a car alone at the entrance is told to go, and the road is reserved": () => {
    const tracker = newTracker();
    assert.deepStrictEqual(
      actions(tracker, [vehicle("A", { entrance: 30 })], 0),
      {
        A: "GO",
      },
    );
    assert.strictEqual(tracker.statusOf("R1"), "RESERVED");
  },
  "the first to arrive goes, the other end waits": () => {
    const tracker = newTracker();
    const a = vehicle("B", { entrance: 30, bearing: EAST });
    actions(tracker, [a], 0);
    const b = vehicle("A", { entrance: 30, bearing: WEST });
    assert.deepStrictEqual(actions(tracker, [a, b], 1000), {
      B: "GO",
      A: "WAIT",
    });
    assert.strictEqual(tracker.entryFor(b, [a]).reason, "RESERVED");
  },
  "arriving together, exactly one is told to go": () => {
    const tracker = newTracker();
    const result = actions(
      tracker,
      [
        vehicle("A", { entrance: 30, bearing: EAST }),
        vehicle("B", { entrance: 30, bearing: WEST }),
        vehicle("C", { entrance: 30, bearing: NORTH }),
      ],
      0,
    );
    assert.strictEqual(
      Object.values(result).filter((a) => a === "GO").length,
      1,
    );
  },
  "once inside, the road is occupied and the other end keeps waiting": () => {
    const tracker = newTracker();
    const waiting = vehicle("B", { entrance: 30, bearing: WEST });
    actions(tracker, [vehicle("A", { entrance: 20 }), waiting], 0);
    const result = actions(
      tracker,
      [vehicle("A", { inside: true }), waiting],
      1000,
    );
    assert.strictEqual(result.B, "WAIT");
    assert.strictEqual(tracker.statusOf("R1"), "OCCUPIED");
  },
  "when the road empties, the waiting car is told to go": () => {
    const tracker = newTracker();
    const waiting = vehicle("B", { entrance: 30, bearing: WEST });
    actions(tracker, [vehicle("A", { inside: true }), waiting], 0);
    assert.deepStrictEqual(actions(tracker, [waiting], 1000), { B: "GO" });
  },
  "a car behind, going the same way as the one inside, follows": () => {
    const tracker = newTracker();
    const result = actions(
      tracker,
      [vehicle("A", { inside: true }), vehicle("B", { entrance: 30 })],
      0,
    );
    assert.strictEqual(result.B, "FOLLOW");
  },
  "if the one inside has stopped, the car behind waits": () => {
    const tracker = newTracker();
    const result = actions(
      tracker,
      [
        vehicle("A", { inside: true, speed: 0 }),
        vehicle("B", { entrance: 30 }),
      ],
      0,
    );
    assert.strictEqual(result.B, "WAIT");
  },
  "a priority vehicle at an occupied road isn't told to wait": () => {
    const tracker = newTracker();
    const inside = vehicle("A", { inside: true });
    const ambulance = vehicle("B", {
      entrance: 30,
      bearing: WEST,
      type: "priority",
    });
    assert.strictEqual(actions(tracker, [inside, ambulance], 0).B, "PRIORITY");

    // and the car inside is told it's coming
    const alert = buildNarrowRoadAlert(
      inside,
      [ambulance],
      createRightOfWayTracker(),
      tracker,
    );
    assert.strictEqual(alert.kind, "VEHICLE_ENTERING");
    assert.strictEqual(alert.otherVehicleType, "priority");
  },
  "a priority vehicle takes the road from a car that hasn't gone in yet":
    () => {
      const tracker = newTracker();
      const car = vehicle("A", { entrance: 30, bearing: EAST });
      actions(tracker, [car], 0);
      const ambulance = vehicle("B", {
        entrance: 40,
        bearing: WEST,
        type: "priority",
      });
      assert.deepStrictEqual(actions(tracker, [car, ambulance], 1000), {
        A: "WAIT",
        B: "GO",
      });
      assert.strictEqual(tracker.entryFor(car, [ambulance]).byPriority, true);
    },
  "a car told to go that stays parked loses its turn": () => {
    const tracker = newTracker();
    const parked = vehicle("A", { entrance: 10, speed: 0 });
    actions(tracker, [parked], 0);
    const arriving = vehicle("B", { entrance: 40, bearing: WEST });
    assert.strictEqual(actions(tracker, [parked, arriving], 1000).B, "WAIT");
    assert.deepStrictEqual(
      actions(tracker, [parked, arriving], HOLD_STOPPED_MS + 1000),
      { A: "WAIT", B: "GO" },
    );
  },
  "a car that doesn't go in within a minute loses its turn": () => {
    const tracker = newTracker();
    const slow = vehicle("A", { entrance: 50, bearing: EAST });
    actions(tracker, [slow], 0);
    const other = vehicle("B", { entrance: 40, bearing: WEST });
    actions(tracker, [slow, other], 1000);
    assert.strictEqual(actions(tracker, [slow, other], HOLD_MAX_MS).B, "GO");
  },
  "a car whose phone stops sending loses its turn": () => {
    const tracker = newTracker();
    const quiet = vehicle("A", { entrance: 30, bearing: EAST });
    const other = vehicle("B", { entrance: 30, bearing: WEST });
    actions(tracker, [quiet, other], 0);
    assert.deepStrictEqual(actions(tracker, [other], 1000), { B: "GO" });
  },
  "far from any entrance there's no entry alert": () => {
    const tracker = newTracker();
    assert.deepStrictEqual(actions(tracker, [vehicle("A")], 0), { A: null });
    assert.strictEqual(tracker.statusOf("R1"), "AVAILABLE");
  },
  // The queue

  "each car waiting knows its place in the queue": () => {
    const tracker = newTracker();
    // A and B at the north end, C at the south end, arriving A, C, B
    const result = queueAfter(tracker, [north("A"), south("C"), north("B")]);
    assert.deepStrictEqual(result, { A: "GO 1", C: "WAIT 3", B: "FOLLOW 2" });
  },
  "it says how many are ahead at each end": () => {
    const tracker = newTracker();
    const cars = [north("A"), south("C"), north("B")];
    queueAfter(tracker, cars);
    const entry = tracker.entryFor(cars[1], [cars[0], cars[2]]);
    assert.strictEqual(entry.aheadSameEnd, 0);
    assert.strictEqual(entry.aheadOtherEnd, 2);
  },
  "cars at the same end go through together": () => {
    const tracker = newTracker();
    queueAfter(tracker, [north("A"), north("B"), south("C")]);
    // A has gone in; B follows it, C still waits
    const now = [inRoad("A"), north("B"), south("C")];
    assert.deepStrictEqual(actions(tracker, now, 10000), {
      A: null,
      B: "FOLLOW",
      C: "WAIT",
    });
  },
  "a group is at most 3 cars, then the other end goes": () => {
    const tracker = newTracker();
    const result = queueAfter(tracker, [
      north("A"),
      north("B"),
      north("C"),
      north("D"),
      south("E"),
    ]);
    assert.deepStrictEqual(result, {
      A: "GO 1",
      B: "FOLLOW 2",
      C: "FOLLOW 3",
      E: "WAIT 4",
      D: "WAIT 5",
    });
  },
  "the car left out of the group is told it's the other end's turn": () => {
    const tracker = newTracker();
    const cars = [north("A"), north("B"), north("C"), north("D"), south("E")];
    queueAfter(tracker, cars);
    const d = tracker.entryFor(
      cars[3],
      cars.filter((v) => v !== cars[3]),
    );
    assert.strictEqual(d.reason, "TURN");
  },
  "after a group, the other end goes, even if the car left out came first":
    () => {
      const tracker = newTracker();
      const d = north("D");
      const e = south("E");
      queueAfter(tracker, [north("A"), north("B"), north("C"), d, e]);
      actions(tracker, [inRoad("A"), inRoad("B"), inRoad("C"), d, e], 10000);
      assert.deepStrictEqual(actions(tracker, [d, e], 20000), {
        D: "WAIT",
        E: "GO",
      });
    },
  "a group stops taking cars after 30 seconds": () => {
    const tracker = newTracker();
    actions(tracker, [north("A")], 0);
    actions(tracker, [inRoad("A")], 1000);
    const late = north("B");
    const other = south("C");
    assert.deepStrictEqual(
      actions(tracker, [inRoad("A"), late, other], 31000),
      {
        A: null,
        B: "WAIT",
        C: "WAIT",
      },
    );
    // When A is out, the other end goes first
    assert.deepStrictEqual(actions(tracker, [late, other], 40000), {
      B: "WAIT",
      C: "GO",
    });
  },
  "an ambulance joining goes to the front, and others are told": () => {
    const tracker = newTracker();
    const car = north("A");
    const other = south("C");
    queueAfter(tracker, [car, other]);
    const ambulance = south("AMB", { type: "priority" });
    const vehicles = [car, other, ambulance];
    tracker.update(vehicles, 10000);
    const entryOf = (v) =>
      tracker.entryFor(
        v,
        vehicles.filter((o) => o !== v),
      );
    assert.strictEqual(entryOf(ambulance).action, "GO");
    assert.strictEqual(entryOf(car).action, "WAIT");
    assert.strictEqual(entryOf(car).priorityAhead, true);
    assert.strictEqual(entryOf(ambulance).position, 1);
  },
  "if a car from the other end goes in anyway, the group waits": () => {
    const tracker = newTracker();
    queueAfter(tracker, [north("A"), north("B")]);
    const result = actions(
      tracker,
      [inRoad("A"), north("B"), inRoad("X", { bearing: WEST })],
      10000,
    );
    assert.strictEqual(result.B, "WAIT");
  },
  "a group member parked at the entrance doesn't block the road": () => {
    const tracker = newTracker();
    const parked = north("B");
    const other = south("C");
    queueAfter(tracker, [north("A"), parked, other]);
    actions(tracker, [inRoad("A"), parked, other], 10000);
    // A has gone; B never moves
    actions(tracker, [parked, other], 20000);
    assert.deepStrictEqual(actions(tracker, [parked, other], 36000), {
      B: "WAIT",
      C: "GO",
    });
  },

  "the alert says what to do and why": () => {
    const tracker = newTracker();
    const inside = { ...vehicle("A", { inside: true }), vehicleType: "bus" };
    const waiting = vehicle("B", { entrance: 30, bearing: WEST });
    tracker.update([inside, waiting], 0);
    const alert = buildNarrowRoadAlert(
      waiting,
      [inside],
      createRightOfWayTracker(),
      tracker,
    );
    assert.strictEqual(alert.kind, "ENTRY_WAIT");
    assert.strictEqual(alert.reason, "OCCUPIED");
    assert.strictEqual(alert.otherVehicleType, "bus");
    assert.strictEqual(alert.roadName, "Test Lane");
  },
};

let failed = 0;

for (const [name, test] of Object.entries(tests)) {
  try {
    test();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`  ✗ ${name}: ${error.message}`);
  }
}

console.log(
  `\n  ${Object.keys(tests).length - failed} passed, ${failed} failed`,
);

process.exitCode = failed > 0 ? 1 : 0;
