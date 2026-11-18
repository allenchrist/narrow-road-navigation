/**
 * Road checks. They only look at roads near a vehicle, so this compares
 * them with checking every road, at many points around Coimbatore.
 * Needs no running server or database.
 *
 * Usage:
 *   npm run test:geofence
 */

const assert = require("assert");
const {
  computeGeofenceState,
  isPointInsidePolygon,
} = require("../services/geofenceService");
const { angleDifference, nearestPointOnPolygon } = require("../utils/geo");

const realRoads = require("../data/narrowRoads.json");
const testRoads = require("./fixtures/simulatorRoads.json");

// The same rules as the server, applied to every road
function checkEveryRoad(lat, lon, travelBearing, roads, accuracy) {
  const tolerance =
    typeof accuracy === "number" ? Math.min(15, Math.max(8, accuracy)) : 10;

  const inside = [];
  const approaching = [];

  for (const road of roads) {
    const nearest = nearestPointOnPolygon(lat, lon, road.polygon);

    if (!nearest) continue;

    if (
      isPointInsidePolygon(lat, lon, road.polygon) ||
      nearest.distanceM <= tolerance
    ) {
      inside.push(road.id);
    } else if (
      travelBearing === null
        ? nearest.distanceM <= 40
        : nearest.distanceM <= 150 &&
          angleDifference(nearest.bearing, travelBearing) <= 45
    ) {
      approaching.push(road.id);
    }
  }

  return { inside, approaching: approaching.sort() };
}

// A repeatable spread of points, mostly close to roads where it matters
function testPoints(roads, count) {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  return Array.from({ length: count }, (_, i) => {
    const road = roads[i % roads.length];
    const [lat, lon] = road.polygon[0];

    // Up to about 300 m from a road's corner, in any direction
    return {
      lat: lat + (random() - 0.5) * 0.0055,
      lon: lon + (random() - 0.5) * 0.0055,
      bearing: random() < 0.3 ? null : random() * 360,
      accuracy: random() < 0.2 ? undefined : 3 + random() * 30,
    };
  });
}

function compare(roads, points) {
  for (const { lat, lon, bearing, accuracy } of points) {
    const fast = computeGeofenceState(lat, lon, bearing, roads, accuracy);
    const full = checkEveryRoad(lat, lon, bearing, roads, accuracy);

    assert.deepStrictEqual(
      fast.insideRoadIds,
      full.inside,
      `inside at ${lat}, ${lon}`,
    );
    assert.deepStrictEqual(
      fast.approachingRoads.map((road) => road.id).sort(),
      full.approaching,
      `approaching at ${lat}, ${lon}`,
    );
  }
}

const tests = {
  "the real roads give the same answers as checking every road": () => {
    compare(realRoads, testPoints(realRoads, 5000));
  },
  "the simulator's long roads give the same answers too": () => {
    compare(testRoads, testPoints(testRoads, 3000));
  },
  "a road added later is found straight away": () => {
    const added = {
      id: "ADDED",
      polygon: [
        [11.05, 76.9],
        [11.05, 76.901],
        [11.0501, 76.901],
        [11.0501, 76.9],
      ],
    };

    computeGeofenceState(11.05, 76.9005, null, realRoads);
    const updated = [...realRoads, added];

    assert.deepStrictEqual(
      computeGeofenceState(11.05005, 76.9005, null, updated).insideRoadIds,
      ["ADDED"],
    );
  },
  "checking only nearby roads is much faster": () => {
    // Many copies of the real roads, spread out, as if far more were added
    const manyRoads = Array.from({ length: 10 }, (_, copy) =>
      realRoads.map((road) => ({
        ...road,
        id: `${road.id}-${copy}`,
        polygon: road.polygon.map(([lat, lon]) => [lat + copy * 0.2, lon]),
      })),
    ).flat();

    const points = testPoints(manyRoads, 2000);

    computeGeofenceState(11, 77, null, manyRoads);

    const time = (check) => {
      const start = process.hrtime.bigint();
      for (const p of points)
        check(p.lat, p.lon, p.bearing, manyRoads, p.accuracy);
      return Number(process.hrtime.bigint() - start) / 1e6;
    };

    const fast = time(computeGeofenceState);
    const full = time(checkEveryRoad);

    console.log(
      `    ${manyRoads.length} roads, ${points.length} checks: ${fast.toFixed(0)} ms near only, ${full.toFixed(0)} ms checking all`,
    );
    assert.ok(fast * 5 < full, "expected at least five times faster");
  },
};

let failed = 0;

for (const [name, test] of Object.entries(tests)) {
  try {
    test();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}: ${error.message}`);
  }
}

console.log(
  `\n  ${Object.keys(tests).length - failed} passed, ${failed} failed`,
);

if (failed > 0) process.exit(1);
