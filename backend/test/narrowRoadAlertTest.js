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
  "driving towards the road warns before entry": () => {
    const alert = buildNarrowRoadAlert(aheadEastbound(), []);
    assert.strictEqual(alert.kind, "NARROW_ROAD_AHEAD");
    assert.ok(alert.distanceM > 40 && alert.distanceM < 70, `distance ${alert.distanceM}`);
  },
  "driving away from the road gets no alert": () => {
    assert.strictEqual(kind(vehicleAt(11, 76.9995, MOVING, WEST)), "NONE");
  },
  "driving past the road gets no alert": () => {
    assert.strictEqual(kind(vehicleAt(11.0005, 76.9995, MOVING, 0)), "NONE");
  },
  "stopped far from the road gets no alert": () => {
    assert.strictEqual(kind(vehicleAt(11, 76.9995, 0, null)), "NONE");
  },
  "stopped at the entrance counts as approaching": () => {
    assert.strictEqual(kind(vehicleAt(11, 76.9998, 0, null)), "NARROW_ROAD_AHEAD");
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
  "outside with a vehicle coming through says wait": () => {
    assert.strictEqual(kind(aheadEastbound(), [insideWestbound()]), "WAIT_VEHICLE_IN_ROAD");
  },
  "inside with a vehicle about to enter the far end": () => {
    assert.strictEqual(kind(insideEastbound(), [aheadWestbound()]), "VEHICLE_ENTERING");
  },
  "both about to enter from opposite ends": () => {
    assert.strictEqual(kind(aheadEastbound(), [aheadWestbound()]), "VEHICLE_ALSO_APPROACHING");
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
      kind({ speed: 0, bearing: null, ...first }, [{ speed: 0, bearing: null, ...second }]),
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
