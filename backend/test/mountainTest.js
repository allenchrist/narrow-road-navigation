/**
 * Mountain Mode: finding hairpins, placing vehicles on a ghat road, and what
 * vehicles meeting at a bend are told. Needs no running server or database.
 *
 * Usage:
 *   npm run test:mountain
 */

const assert = require("assert");
const {
  describeBends,
  findHairpins,
  locateOnRoad,
  measureLine,
  pointAt,
  prepareRoad,
} = require("../services/hillRoads");
const {
  createMountainTracker,
  updateHillPosition,
} = require("../services/mountainMode");

// ── A made-up ghat road, in metres east (x) and north (y) of a point ────

const ORIGIN = [10.4, 76.9];
const M_PER_DEG = 111194.9;

const at = (x, y) => [
  ORIGIN[0] + y / M_PER_DEG,
  ORIGIN[1] + x / (M_PER_DEG * Math.cos((ORIGIN[0] * Math.PI) / 180)),
];

// Up 300 m, a hairpin to the east, down 300 m, a hairpin, up 300 m. The arms
// are 30 m apart.
function zigzag() {
  const points = [];
  const arm = (x, fromY, toY) => {
    const step = fromY < toY ? 10 : -10;
    for (let y = fromY; step > 0 ? y <= toY : y >= toY; y += step) {
      points.push([x, y]);
    }
  };
  const turn = (centreX, centreY, top) => {
    for (let angle = 170; angle >= 10; angle -= 10) {
      const radians = (angle * Math.PI) / 180;
      points.push([
        centreX + 15 * Math.cos(radians) * (top ? -1 : -1),
        centreY + 15 * Math.sin(radians) * (top ? 1 : -1),
      ]);
    }
  };

  arm(0, 0, 300);
  turn(15, 300, true);
  arm(30, 300, 0);
  turn(45, 0, false);
  arm(60, 0, 300);

  return points.map(([x, y]) => at(x, y));
}

const LINE = zigzag();
const METRES = measureLine(LINE);
const BENDS = describeBends(LINE, findHairpins(LINE));
const ROAD = prepareRoad({
  id: "HILL_TEST",
  name: "Test ghat road",
  line: LINE,
  bends: BENDS,
});
const getRoad = (id) => (id === ROAD.id ? ROAD : null);

const [BEND_1, BEND_2] = BENDS;

// ── Vehicles ────────────────────────────────────────────────────────────

/**
 * A vehicle driven along the road through the given metres, one reading a
 * second, ending at `now`.
 */
function driven(id, type, metresAlong, now = 100000) {
  let hill = null;
  const start = now - (metresAlong.length - 1) * 1000;

  metresAlong.forEach((metre, i) => {
    const [lat, lon] = pointAt(LINE, METRES, metre);
    hill = updateHillPosition(hill, lat, lon, [ROAD], start + i * 1000);
  });

  return { vehicleId: id, vehicleType: type, hill };
}

// Steady driving: `count` readings ending at `endM`, moving `speed` m/s
// up (+) or down (-) the road
const path = (endM, speed, count = 5) =>
  Array.from({ length: count }, (_, i) => endM - speed * (count - 1 - i));

const stoppedAt = (metre, cameFrom) => [
  cameFrom,
  cameFrom + (metre - cameFrom) / 2,
  metre,
  metre,
  metre,
  metre,
];

function alerts(
  vehicles,
  now = 100000,
  tracker = createMountainTracker(getRoad),
) {
  tracker.update(vehicles, now);

  return Object.fromEntries(
    vehicles.map((v) => [
      v.vehicleId,
      tracker.alertFor(v.vehicleId)?.kind ?? null,
    ]),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

const tests = {
  // The road and its bends

  "both hairpins are found, numbered from the bottom": () => {
    assert.strictEqual(BENDS.length, 2);
    assert.deepStrictEqual(
      BENDS.map((b) => b.number),
      [1, 2],
    );
    assert.ok(
      BEND_1.startM > 250 && BEND_1.endM < 400,
      `${BEND_1.startM}-${BEND_1.endM}`,
    );
  },
  "the waiting points are 30 m before the turning zone": () => {
    assert.strictEqual(BEND_1.startM - BEND_1.waitBelowM, 30);
    assert.strictEqual(BEND_1.waitAboveM - BEND_1.endM, 30);
  },
  "a straight road has no hairpins": () => {
    const straight = Array.from({ length: 50 }, (_, i) => at(0, i * 20));
    assert.strictEqual(findHairpins(straight).length, 0);
  },

  // Placing vehicles

  "a position on the road gets its metre": () => {
    const [lat, lon] = at(0, 100);
    const place = locateOnRoad(lat, lon, ROAD, 15);
    assert.ok(Math.abs(place.metre - 100) < 1);
  },
  "between two arms, the arm it was on is kept": () => {
    // 15 m from both arms, which are 30 m apart
    const [lat, lon] = at(15, 150);
    const onSecondArm = locateOnRoad(lat, lon, ROAD, 25, BEND_1.endM + 150);
    assert.ok(onSecondArm.metre > BEND_1.endM, `${onSecondArm.metre}`);
    const onFirstArm = locateOnRoad(lat, lon, ROAD, 25, 150);
    assert.ok(onFirstArm.metre < BEND_1.startM, `${onFirstArm.metre}`);
  },
  "far from the road isn't on it": () => {
    const [lat, lon] = at(-60, 100);
    assert.strictEqual(locateOnRoad(lat, lon, ROAD, 15), null);
  },
  "driving up the road is going up": () => {
    assert.strictEqual(driven("A", "car", path(150, 8)).hill.heading, 1);
  },
  "driving down is going down": () => {
    assert.strictEqual(driven("A", "car", path(150, -8)).hill.heading, -1);
  },
  "a stopped vehicle keeps the direction it was going": () => {
    const car = driven("A", "car", [100, 108, 116, 124, 124, 124, 124]);
    assert.strictEqual(car.hill.moving, false);
    assert.strictEqual(car.hill.heading, 1);
  },
  "a GPS jump towards the other arm doesn't move the car onto it": () => {
    let hill = null;
    // Up the first arm at x = 0, with one reading 20 m towards the second
    [
      [0, 100],
      [0, 108],
      [0, 116],
      [20, 124],
      [0, 132],
    ].forEach(([x, y], i) => {
      hill = updateHillPosition(hill, ...at(x, y), [ROAD], i * 1000);
    });
    assert.ok(Math.abs(hill.metre - 132) < 2, `${hill.metre}`);
    assert.strictEqual(hill.heading, 1);
  },
  "one reading isn't enough to know the direction": () => {
    assert.strictEqual(driven("A", "car", [150]).hill.heading, 0);
  },

  // Meeting at a bend

  "a bus and a car from opposite directions: the car stops, the bus goes":
    () => {
      const car = driven("CAR", "car", path(BEND_1.startM - 90, 8));
      const bus = driven("BUS", "bus", path(BEND_1.endM + 90, -6));
      assert.deepStrictEqual(alerts([car, bus]), {
        CAR: "BEND_STOP",
        BUS: "BEND_GO",
      });
    },
  "the car is shown where to wait": () => {
    const tracker = createMountainTracker(getRoad);
    const car = driven("CAR", "car", path(BEND_1.startM - 90, 8));
    const bus = driven("BUS", "bus", path(BEND_1.endM + 90, -6));
    tracker.update([car, bus], 100000);
    const alert = tracker.alertFor("CAR");
    assert.deepStrictEqual(alert.waitPoint, BEND_1.waitBelow);
    assert.strictEqual(alert.otherVehicleType, "bus");
    assert.strictEqual(alert.bendNumber, 1);
  },
  "two cars both keep left, and nobody stops": () => {
    const a = driven("A", "car", path(BEND_1.startM - 90, 8));
    const b = driven("B", "car", path(BEND_1.endM + 90, -6));
    assert.deepStrictEqual(alerts([a, b]), {
      A: "BEND_KEEP_LEFT",
      B: "BEND_KEEP_LEFT",
    });
  },
  "two buses: the one going uphill goes first": () => {
    const up = driven("UP", "bus", path(BEND_1.startM - 90, 8));
    const down = driven("DOWN", "lorry", path(BEND_1.endM + 90, -6));
    assert.deepStrictEqual(alerts([up, down]), {
      UP: "BEND_GO",
      DOWN: "BEND_STOP",
    });
  },
  "a car already in the bend finishes it, and the bus waits": () => {
    const car = driven("CAR", "car", path(BEND_1.startM + 10, 6));
    const bus = driven("BUS", "bus", path(BEND_1.endM + 60, -6));
    assert.deepStrictEqual(alerts([car, bus]), {
      CAR: "BEND_GO",
      BUS: "BEND_STOP",
    });
  },
  "a priority vehicle goes before a bus": () => {
    const ambulance = driven("AMB", "priority", path(BEND_1.startM - 90, 8));
    const bus = driven("BUS", "bus", path(BEND_1.endM + 90, -6));
    assert.deepStrictEqual(alerts([ambulance, bus]), {
      AMB: "BEND_GO",
      BUS: "BEND_STOP",
    });
  },
  "a car waiting at the waiting point keeps waiting while the bus turns":
    () => {
      const tracker = createMountainTracker(getRoad);
      const bus = driven("BUS", "bus", path(BEND_1.endM + 90, -6));
      alerts(
        [driven("CAR", "car", path(BEND_1.startM - 90, 8)), bus],
        100000,
        tracker,
      );
      const waiting = driven(
        "CAR",
        "car",
        stoppedAt(BEND_1.waitBelowM, BEND_1.waitBelowM - 30),
        105000,
      );
      const turning = driven(
        "BUS",
        "bus",
        path(BEND_1.startM + 20, -6),
        105000,
      );
      assert.deepStrictEqual(alerts([waiting, turning], 105000, tracker), {
        CAR: "BEND_STOP",
        BUS: "BEND_GO",
      });
    },
  "once the bus is out of the bend, the car is told it's clear": () => {
    const tracker = createMountainTracker(getRoad);
    alerts(
      [
        driven("CAR", "car", path(BEND_1.startM - 90, 8)),
        driven("BUS", "bus", path(BEND_1.endM + 90, -6)),
      ],
      100000,
      tracker,
    );
    const waiting = driven(
      "CAR",
      "car",
      stoppedAt(BEND_1.waitBelowM, BEND_1.waitBelowM - 30),
      120000,
    );
    const out = driven("BUS", "bus", path(BEND_1.startM - 20, -6), 120000);
    assert.strictEqual(
      alerts([waiting, out], 120000, tracker).CAR,
      "BEND_CLEAR",
    );
  },
  "vehicles that won't be in the bend together get nothing": () => {
    // The car is nearly at the bend; the bus is 240 m above it, crawling
    const car = driven("CAR", "car", path(BEND_1.startM - 20, 8));
    const bus = driven("BUS", "bus", path(BEND_1.endM + 240, -2.5));
    assert.deepStrictEqual(alerts([car, bus]), { CAR: null, BUS: null });
  },
  "vehicles heading for different bends get nothing": () => {
    const car = driven("CAR", "car", path(BEND_1.startM - 90, 8));
    const bus = driven("BUS", "bus", path(BEND_2.endM + 90, -6));
    assert.deepStrictEqual(alerts([car, bus]), { CAR: null, BUS: null });
  },
  "a car behind a bus near a bend is told not to overtake": () => {
    const bus = driven("BUS", "bus", path(BEND_1.startM - 40, 6));
    const car = driven("CAR", "car", path(BEND_1.startM - 120, 8));
    assert.deepStrictEqual(alerts([bus, car]), {
      BUS: null,
      CAR: "BEND_NO_OVERTAKE",
    });
  },
  "the bend counter says which bend is next and how far": () => {
    const tracker = createMountainTracker(getRoad);
    const car = driven("CAR", "car", path(BEND_1.startM - 100, 8));
    tracker.update([car], 100000);
    const info = tracker.infoFor("CAR");
    assert.strictEqual(info.bendCount, 2);
    assert.strictEqual(info.nextBend.number, 1);
    assert.ok(Math.abs(info.nextBend.distanceM - 100) <= 1);
    assert.strictEqual(info.heading, "UP");
  },
  "off the ghat road there's no Mountain Mode": () => {
    const [lat, lon] = at(-200, 0);
    assert.strictEqual(updateHillPosition(null, lat, lon, [ROAD], 0), null);
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
