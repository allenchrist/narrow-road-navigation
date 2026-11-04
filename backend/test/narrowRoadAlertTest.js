/**
 * Narrow road alert rules. Needs no running server or database.
 *
 * Usage:
 *   npm run test:alerts
 */

const assert = require("assert");
const { computeGeofenceState } = require("../services/geofenceService");
const { buildNarrowRoadAlert } = require("../services/narrowRoadAlert");

// An east-west road about 220 m long and 22 m wide
const ROAD = {
  id: "R1",
  name: "Test Road",
  polygon: [
    [10.9999, 77.0],
    [10.9999, 77.002],
    [11.0001, 77.002],
    [11.0001, 77.0],
  ],
};

const EAST = 90;
const WEST = 270;
const MOVING = 5;

function vehicleAt(lat, lon, speed, bearing) {
  const travelBearing = speed >= 1 ? bearing : null;

  return {
    lat,
    lon,
    speed,
    bearing,
    ...computeGeofenceState(lat, lon, travelBearing, [ROAD]),
  };
}

const insideEastbound = () => vehicleAt(11, 77.0005, MOVING, EAST);
const insideWestbound = () => vehicleAt(11, 77.0015, MOVING, WEST);
const insideStopped = () => vehicleAt(11, 77.001, 0, null);
const aheadEastbound = () => vehicleAt(11, 76.9995, MOVING, EAST);
const aheadWestbound = () => vehicleAt(11, 77.0025, MOVING, WEST);

const kind = (vehicle, others = []) =>
  buildNarrowRoadAlert(vehicle, others).kind;

const tests = {
  "far away gets no alert": () => {
    assert.strictEqual(kind(vehicleAt(11.01, 77.01, MOVING, EAST)), "NONE");
  },
  "no alert until the vehicle enters the road": () => {
    assert.strictEqual(kind(aheadEastbound()), "NONE");
    assert.strictEqual(kind(aheadEastbound(), [insideWestbound()]), "NONE");
    assert.strictEqual(kind(aheadEastbound(), [aheadWestbound()]), "NONE");
  },
  "driving towards the road counts as approaching": () => {
    const [road] = aheadEastbound().approachingRoads;
    assert.ok(road.distanceM > 40 && road.distanceM < 70, `distance ${road.distanceM}`);
  },
  "driving away from the road is not approaching": () => {
    assert.strictEqual(vehicleAt(11, 76.9995, MOVING, WEST).approachingRoads.length, 0);
  },
  "driving past the road is not approaching": () => {
    assert.strictEqual(vehicleAt(11.0005, 76.9995, MOVING, 0).approachingRoads.length, 0);
  },
  "stopped far from the road is not approaching": () => {
    assert.strictEqual(vehicleAt(11, 76.9995, 0, null).approachingRoads.length, 0);
  },
  "stopped at the entrance counts as approaching": () => {
    assert.strictEqual(vehicleAt(11, 76.9998, 0, null).approachingRoads.length, 1);
  },
  "alone inside the road": () => {
    assert.strictEqual(kind(insideEastbound()), "IN_NARROW_ROAD");
  },
  "opposite direction inside is oncoming": () => {
    assert.strictEqual(kind(insideEastbound(), [insideWestbound()]), "ONCOMING_VEHICLE");
  },
  "same direction inside is not a conflict": () => {
    assert.strictEqual(kind(insideEastbound(), [vehicleAt(11, 77.001, MOVING, EAST)]), "IN_NARROW_ROAD");
  },
  "stopped vehicle inside is still a hazard": () => {
    assert.strictEqual(kind(insideEastbound(), [insideStopped()]), "VEHICLE_IN_ROAD");
  },
  "inside with a vehicle about to enter the far end": () => {
    assert.strictEqual(kind(insideEastbound(), [aheadWestbound()]), "VEHICLE_ENTERING");
  },
  "the alert gives the distance to the nearest other vehicle": () => {
    const alert = buildNarrowRoadAlert(insideEastbound(), [
      insideWestbound(),
      vehicleAt(11, 77.0019, MOVING, WEST),
    ]);
    assert.strictEqual(alert.vehicleCount, 2);
    assert.ok(alert.vehicleDistanceM > 100 && alert.vehicleDistanceM < 120, `distance ${alert.vehicleDistanceM}`);
  },
  "alone inside gives no vehicle distance": () => {
    assert.strictEqual(buildNarrowRoadAlert(insideEastbound(), []).vehicleDistanceM, null);
  },
  "a car just outside a thin road shape counts as on it": () => {
    // About 5.5 m beyond the road's northern edge
    const nearEdge = computeGeofenceState(11.00015, 77.001, null, [ROAD], 5);
    assert.deepStrictEqual(nearEdge.insideRoadIds, ["R1"]);
  },
  "a car well beyond the tolerance is not on the road": () => {
    // About 22 m beyond the northern edge
    const away = computeGeofenceState(11.0003, 77.001, null, [ROAD], 5);
    assert.deepStrictEqual(away.insideRoadIds, []);
  },
  "good GPS still allows the minimum tolerance": () => {
    // About 7 m beyond the edge, with GPS accurate to 2 m
    assert.strictEqual(computeGeofenceState(11.00016, 77.001, null, [ROAD], 2).insideRoadIds.length, 1);
    // About 12 m beyond the edge is too far when GPS is that good
    assert.strictEqual(computeGeofenceState(11.0002, 77.001, null, [ROAD], 2).insideRoadIds.length, 0);
  },
  "poor GPS widens the tolerance, up to a limit": () => {
    // About 12 m beyond the edge
    assert.strictEqual(computeGeofenceState(11.0002, 77.001, null, [ROAD], 14).insideRoadIds.length, 1);
    // About 17 m beyond the edge, even with very poor GPS
    assert.strictEqual(computeGeofenceState(11.00025, 77.001, null, [ROAD], 40).insideRoadIds.length, 0);
  },
  "a phone that reports no accuracy gets a middle tolerance": () => {
    // About 8.9 m beyond the edge
    assert.strictEqual(computeGeofenceState(11.00018, 77.001, null, [ROAD]).insideRoadIds.length, 1);
    // About 12 m beyond the edge
    assert.strictEqual(computeGeofenceState(11.0002, 77.001, null, [ROAD]).insideRoadIds.length, 0);
  },
  "a vehicle on another road is ignored": () => {
    assert.strictEqual(kind(insideEastbound(), [vehicleAt(11.01, 77.01, MOVING, WEST)]), "IN_NARROW_ROAD");
  },
  "a shared road is found when polygons overlap": () => {
    const overlap = { ...ROAD, id: "R2", name: "Overlap" };
    const first = computeGeofenceState(11, 77.001, null, [ROAD, overlap]);
    const second = computeGeofenceState(11, 77.001, null, [overlap, ROAD]);
    assert.deepStrictEqual(first.insideRoadIds, ["R1", "R2"]);
    assert.deepStrictEqual(second.insideRoadIds, ["R2", "R1"]);
    assert.strictEqual(
      kind({ lat: 11, lon: 77.001, speed: 0, bearing: null, ...first }, [{ lat: 11, lon: 77.001, speed: 0, bearing: null, ...second }]),
      "VEHICLE_IN_ROAD"
    );
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

console.log(`\n  ${Object.keys(tests).length - failed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
