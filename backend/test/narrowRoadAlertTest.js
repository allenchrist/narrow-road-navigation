/**
 * Narrow road alert rules. Needs no running server or database.
 *
 * Usage:
 *   npm run test:alerts
 */

const assert = require("assert");
const { computeGeofenceState } = require("../services/geofenceService");
const {
  buildNarrowRoadAlert,
  createRightOfWayTracker,
  updateRoadEntries,
} = require("../services/narrowRoadAlert");

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

let nextId = 1;

// Each new vehicle counts as entering after the ones made before it
function vehicleAt(lat, lon, speed, bearing) {
  const travelBearing = speed >= 1 ? bearing : null;
  const id = nextId++;
  const geofence = computeGeofenceState(lat, lon, travelBearing, [ROAD]);

  return {
    vehicleId: `V${String(id).padStart(3, "0")}`,
    lat,
    lon,
    speed,
    bearing,
    ...geofence,
    roadEnteredAt: Object.fromEntries(
      geofence.insideRoadIds.map((road) => [road, id]),
    ),
  };
}

// Moves a vehicle, keeping when it entered the road
function moved(vehicle, lat, lon, speed, bearing) {
  const travelBearing = speed >= 1 ? bearing : null;

  return {
    ...vehicle,
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

const alertFor = (
  vehicle,
  others = [],
  tracker = createRightOfWayTracker(),
) => {
  tracker.update([vehicle, ...others]);

  return buildNarrowRoadAlert(vehicle, others, tracker);
};

const kind = (vehicle, others = [], tracker) =>
  alertFor(vehicle, others, tracker).kind;

// Each vehicle's alert after one server update, using a shared tracker
function kindsAfterUpdate(tracker, vehicles) {
  tracker.update(vehicles);

  return vehicles.map(
    (vehicle) =>
      buildNarrowRoadAlert(
        vehicle,
        vehicles.filter((other) => other !== vehicle),
        tracker,
      ).kind,
  );
}

const tests = {
  "an ambulance that entered last still has right of way": () => {
    const first = { ...insideEastbound(), vehicleType: "car" };
    const ambulance = { ...insideWestbound(), vehicleType: "ambulance" };
    const tracker = createRightOfWayTracker();
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [first, ambulance]), [
      "GIVE_WAY",
      "RIGHT_OF_WAY",
    ]);
    assert.strictEqual(
      buildNarrowRoadAlert(first, [ambulance], tracker).byPriority,
      true,
    );
    assert.strictEqual(
      buildNarrowRoadAlert(first, [ambulance], tracker).otherVehicleType,
      "ambulance",
    );
  },
  "between two ambulances, the first in keeps going": () => {
    const first = { ...insideEastbound(), vehicleType: "ambulance" };
    const later = { ...insideWestbound(), vehicleType: "ambulance" };
    const tracker = createRightOfWayTracker();
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [first, later]), [
      "RIGHT_OF_WAY",
      "GIVE_WAY",
    ]);
    assert.strictEqual(
      buildNarrowRoadAlert(later, [first], tracker).byPriority,
      false,
    );
  },
  "a normal meeting isn't marked as priority": () => {
    const first = { ...insideEastbound(), vehicleType: "car" };
    const later = { ...insideWestbound(), vehicleType: "bus" };
    const tracker = createRightOfWayTracker();
    tracker.update([first, later]);
    assert.strictEqual(
      buildNarrowRoadAlert(later, [first], tracker).byPriority,
      false,
    );
  },
  "an approaching ambulance is named": () => {
    const inside = insideEastbound();
    const ambulance = { ...aheadWestbound(), vehicleType: "ambulance" };
    const alert = alertFor(inside, [ambulance]);
    assert.strictEqual(alert.kind, "VEHICLE_ENTERING");
    assert.strictEqual(alert.otherVehicleType, "ambulance");
  },
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
    assert.ok(
      road.distanceM > 40 && road.distanceM < 70,
      `distance ${road.distanceM}`,
    );
  },
  "driving away from the road is not approaching": () => {
    assert.strictEqual(
      vehicleAt(11, 76.9995, MOVING, WEST).approachingRoads.length,
      0,
    );
  },
  "driving past the road is not approaching": () => {
    assert.strictEqual(
      vehicleAt(11.0005, 76.9995, MOVING, 0).approachingRoads.length,
      0,
    );
  },
  "stopped far from the road is not approaching": () => {
    assert.strictEqual(
      vehicleAt(11, 76.9995, 0, null).approachingRoads.length,
      0,
    );
  },
  "stopped at the entrance counts as approaching": () => {
    assert.strictEqual(
      vehicleAt(11, 76.9998, 0, null).approachingRoads.length,
      1,
    );
  },
  "alone inside the road": () => {
    assert.strictEqual(kind(insideEastbound()), "IN_NARROW_ROAD");
  },
  "head on: the first in keeps going and the later car gives way": () => {
    const first = insideEastbound();
    const later = insideWestbound();
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, later]),
      ["RIGHT_OF_WAY", "GIVE_WAY"],
    );
  },
  "head on: the result doesn't depend on which car is checked first": () => {
    const first = insideEastbound();
    const later = insideWestbound();
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [later, first]),
      ["GIVE_WAY", "RIGHT_OF_WAY"],
    );
  },
  "entering at the same moment still gives opposite instructions": () => {
    const a = insideEastbound();
    const b = insideWestbound();
    const tied = { R1: 1000 };
    const kinds = kindsAfterUpdate(createRightOfWayTracker(), [
      { ...a, roadEnteredAt: tied },
      { ...b, roadEnteredAt: tied },
    ]);
    assert.deepStrictEqual([...kinds].sort(), ["GIVE_WAY", "RIGHT_OF_WAY"]);
  },
  "a car entering a road gets the current time": () => {
    assert.deepStrictEqual(updateRoadEntries({}, ["R1"], 900, 1000), {
      R1: 1000,
    });
  },
  "a car still in the road keeps its entry time": () => {
    assert.deepStrictEqual(updateRoadEntries({ R1: 500 }, ["R1"], 900, 1000), {
      R1: 500,
    });
  },
  "a car that left the road loses its entry time": () => {
    assert.deepStrictEqual(updateRoadEntries({ R1: 500 }, [], 900, 1000), {});
  },
  "a short gap in updates keeps the entry time": () => {
    assert.deepStrictEqual(
      updateRoadEntries({ R1: 500 }, ["R1"], 1000, 31000),
      { R1: 500 },
    );
  },
  "after a long gap the car counts as entering again": () => {
    assert.deepStrictEqual(
      updateRoadEntries({ R1: 500 }, ["R1"], 1000, 62000),
      { R1: 62000 },
    );
  },
  "a first update has no old entry time": () => {
    assert.deepStrictEqual(updateRoadEntries({}, ["R1"], null, 1000), {
      R1: 1000,
    });
  },
  "the instruction stays when the car giving way stops": () => {
    const tracker = createRightOfWayTracker();
    const first = insideEastbound();
    const later = insideWestbound();
    kindsAfterUpdate(tracker, [first, later]);
    const stopped = moved(later, 11, 77.0015, 0, null);
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [first, stopped]), [
      "RIGHT_OF_WAY",
      "GIVE_WAY",
    ]);
  },
  "the instruction stays when the car giving way reverses": () => {
    const tracker = createRightOfWayTracker();
    const first = insideEastbound();
    const later = insideWestbound();
    kindsAfterUpdate(tracker, [first, later]);
    const reversing = moved(later, 11, 77.0016, 2, EAST);
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [first, reversing]), [
      "RIGHT_OF_WAY",
      "GIVE_WAY",
    ]);
  },
  "the decision doesn't flip if the first car stops": () => {
    const tracker = createRightOfWayTracker();
    const first = insideEastbound();
    const later = insideWestbound();
    kindsAfterUpdate(tracker, [first, later]);
    const stopped = moved(first, 11, 77.0005, 0, null);
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [stopped, later]), [
      "RIGHT_OF_WAY",
      "GIVE_WAY",
    ]);
  },
  "the car that gave way is told the road is clear once the first has passed":
    () => {
      const tracker = createRightOfWayTracker();
      const first = insideEastbound();
      const later = insideWestbound();
      kindsAfterUpdate(tracker, [first, later]);
      const waiting = moved(later, 11, 77.0015, 0, null);
      const past = moved(first, 11, 77.0018, MOVING, EAST);
      assert.deepStrictEqual(kindsAfterUpdate(tracker, [past, waiting]), [
        "IN_NARROW_ROAD",
        "ROAD_CLEAR",
      ]);
      // Stays over, even though they are still in the same road
      const stillPast = moved(past, 11, 77.0019, MOVING, EAST);
      assert.deepStrictEqual(kindsAfterUpdate(tracker, [stillPast, waiting]), [
        "IN_NARROW_ROAD",
        "ROAD_CLEAR",
      ]);
      assert.strictEqual(
        buildNarrowRoadAlert(waiting, [stillPast], tracker).otherCount,
        1,
      );
    },
  "cars side by side while passing keep their instructions": () => {
    const tracker = createRightOfWayTracker();
    const first = insideEastbound();
    const later = insideWestbound();
    kindsAfterUpdate(tracker, [first, later]);
    const beside = moved(first, 11, 77.00151, MOVING, EAST);
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [beside, later]), [
      "RIGHT_OF_WAY",
      "GIVE_WAY",
    ]);
  },
  "cars already driving apart are not told to give way": () => {
    const west = vehicleAt(11, 77.0005, MOVING, WEST);
    const east = vehicleAt(11, 77.0015, MOVING, EAST);
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [west, east]),
      ["IN_NARROW_ROAD", "IN_NARROW_ROAD"],
    );
  },
  "a later car following the first gives way to the same oncoming car": () => {
    const oncoming = insideWestbound();
    const a = vehicleAt(11, 77.0002, MOVING, EAST);
    const b = vehicleAt(11, 77.0004, MOVING, EAST);
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [oncoming, a, b]),
      ["RIGHT_OF_WAY", "GIVE_WAY", "GIVE_WAY"],
    );
  },
  "with three cars, only the earliest keeps going": () => {
    const a = vehicleAt(11, 77.0002, MOVING, EAST);
    const c = vehicleAt(11, 77.0015, MOVING, WEST);
    const b = vehicleAt(11, 77.0004, MOVING, EAST);
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [a, c, b]),
      ["RIGHT_OF_WAY", "GIVE_WAY", "GIVE_WAY"],
    );
  },
  "walking devices still get opposite instructions": () => {
    const first = vehicleAt(11, 77.0005, 0.8, EAST);
    const later = vehicleAt(11, 77.0015, 0.8, WEST);
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, later]),
      ["RIGHT_OF_WAY", "GIVE_WAY"],
    );
  },
  "the last in gives way when the first has stopped": () => {
    const first = insideStopped();
    const later = insideWestbound();
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, later]),
      ["RIGHT_OF_WAY", "GIVE_WAY"],
    );
  },
  "the last in gives way when it has stopped": () => {
    const first = insideEastbound();
    const later = insideStopped();
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, later]),
      ["RIGHT_OF_WAY", "GIVE_WAY"],
    );
  },
  "the last in gives way when both have stopped": () => {
    const first = insideStopped();
    const later = insideStopped();
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, later]),
      ["RIGHT_OF_WAY", "GIVE_WAY"],
    );
  },
  "a phone with no direction still gets an instruction": () => {
    const first = vehicleAt(11, 77.0005, MOVING, null);
    const later = vehicleAt(11, 77.0015, MOVING, null);
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, later]),
      ["RIGHT_OF_WAY", "GIVE_WAY"],
    );
  },
  "directions at an angle still get instructions": () => {
    const first = vehicleAt(11, 77.0005, MOVING, EAST);
    const later = vehicleAt(11, 77.0015, MOVING, 190);
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, later]),
      ["RIGHT_OF_WAY", "GIVE_WAY"],
    );
  },
  "cars driving apart get instructions if one turns back": () => {
    const tracker = createRightOfWayTracker();
    const first = vehicleAt(11, 77.0005, MOVING, WEST);
    const later = vehicleAt(11, 77.0015, MOVING, EAST);
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [first, later]), [
      "IN_NARROW_ROAD",
      "IN_NARROW_ROAD",
    ]);
    const turned = moved(first, 11, 77.0005, MOVING, EAST);
    const turnedLater = moved(later, 11, 77.0015, MOVING, WEST);
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [turned, turnedLater]), [
      "RIGHT_OF_WAY",
      "GIVE_WAY",
    ]);
  },
  "the alert names the one other vehicle": () => {
    const first = { ...insideEastbound(), vehicleType: "car" };
    const later = { ...insideWestbound(), vehicleType: "bus" };
    const tracker = createRightOfWayTracker();
    tracker.update([first, later]);
    assert.strictEqual(
      buildNarrowRoadAlert(first, [later], tracker).otherVehicleType,
      "bus",
    );
    assert.strictEqual(
      buildNarrowRoadAlert(later, [first], tracker).otherVehicleType,
      "car",
    );
  },
  "a bigger vehicle that entered last still gives way": () => {
    const first = { ...insideEastbound(), vehicleType: "auto" };
    const later = { ...insideWestbound(), vehicleType: "truck" };
    assert.deepStrictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, later]),
      ["RIGHT_OF_WAY", "GIVE_WAY"],
    );
  },
  "several other vehicles aren't named": () => {
    const oncoming = { ...insideWestbound(), vehicleType: "bus" };
    const a = { ...vehicleAt(11, 77.0002, MOVING, EAST), vehicleType: "car" };
    const b = { ...vehicleAt(11, 77.0004, MOVING, EAST), vehicleType: "car" };
    const tracker = createRightOfWayTracker();
    tracker.update([oncoming, a, b]);
    assert.strictEqual(
      buildNarrowRoadAlert(oncoming, [a, b], tracker).otherVehicleType,
      null,
    );
    assert.strictEqual(
      buildNarrowRoadAlert(oncoming, [a, b], tracker).otherCount,
      2,
    );
  },
  "a car that entered last gives way to everyone before it": () => {
    const first = insideEastbound();
    const oncoming = insideWestbound();
    const parked = vehicleAt(11, 77.001, 0, null);
    assert.strictEqual(
      kindsAfterUpdate(createRightOfWayTracker(), [first, oncoming, parked])[2],
      "GIVE_WAY",
    );
  },
  "the decision ends when a car leaves, and a new meeting decides again":
    () => {
      const tracker = createRightOfWayTracker();
      const first = insideEastbound();
      const later = insideWestbound();
      kindsAfterUpdate(tracker, [first, later]);
      const gone = moved(first, 11, 76.99, MOVING, WEST);
      assert.strictEqual(
        kindsAfterUpdate(tracker, [gone, later])[1],
        "IN_NARROW_ROAD",
      );
      assert.strictEqual(tracker.get(gone, later), null);
    },
  "a car that goes silent stops counting": () => {
    const tracker = createRightOfWayTracker();
    const first = insideEastbound();
    const later = insideWestbound();
    kindsAfterUpdate(tracker, [first, later]);
    // The server leaves stale vehicles out of its active list
    assert.deepStrictEqual(kindsAfterUpdate(tracker, [first]), [
      "IN_NARROW_ROAD",
    ]);
    assert.strictEqual(tracker.get(first, later), null);
  },
  "an overlap of two road shapes uses the earliest entry": () => {
    const a = insideEastbound();
    const b = insideWestbound();
    const kinds = kindsAfterUpdate(createRightOfWayTracker(), [
      {
        ...a,
        insideRoadIds: ["R1", "R2"],
        roadEnteredAt: { R1: 500, R2: 100 },
      },
      {
        ...b,
        insideRoadIds: ["R1", "R2"],
        roadEnteredAt: { R1: 200, R2: 300 },
      },
    ]);
    assert.deepStrictEqual(kinds, ["RIGHT_OF_WAY", "GIVE_WAY"]);
  },
  "same direction inside is not a conflict": () => {
    assert.strictEqual(
      kind(insideEastbound(), [vehicleAt(11, 77.001, MOVING, EAST)]),
      "IN_NARROW_ROAD",
    );
  },
  "inside with a vehicle about to enter the far end": () => {
    assert.strictEqual(
      kind(insideEastbound(), [aheadWestbound()]),
      "VEHICLE_ENTERING",
    );
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
    assert.strictEqual(
      computeGeofenceState(11.00016, 77.001, null, [ROAD], 2).insideRoadIds
        .length,
      1,
    );
    // About 12 m beyond the edge is too far when GPS is that good
    assert.strictEqual(
      computeGeofenceState(11.0002, 77.001, null, [ROAD], 2).insideRoadIds
        .length,
      0,
    );
  },
  "poor GPS widens the tolerance, up to a limit": () => {
    // About 12 m beyond the edge
    assert.strictEqual(
      computeGeofenceState(11.0002, 77.001, null, [ROAD], 14).insideRoadIds
        .length,
      1,
    );
    // About 17 m beyond the edge, even with very poor GPS
    assert.strictEqual(
      computeGeofenceState(11.00025, 77.001, null, [ROAD], 40).insideRoadIds
        .length,
      0,
    );
  },
  "a phone that reports no accuracy gets a middle tolerance": () => {
    // About 8.9 m beyond the edge
    assert.strictEqual(
      computeGeofenceState(11.00018, 77.001, null, [ROAD]).insideRoadIds.length,
      1,
    );
    // About 12 m beyond the edge
    assert.strictEqual(
      computeGeofenceState(11.0002, 77.001, null, [ROAD]).insideRoadIds.length,
      0,
    );
  },
  "a vehicle on another road is ignored": () => {
    assert.strictEqual(
      kind(insideEastbound(), [vehicleAt(11.01, 77.01, MOVING, WEST)]),
      "IN_NARROW_ROAD",
    );
  },
  "a shared road is found when polygons overlap": () => {
    const overlap = { ...ROAD, id: "R2", name: "Overlap" };
    const first = computeGeofenceState(11, 77.001, null, [ROAD, overlap]);
    const second = computeGeofenceState(11, 77.001, null, [overlap, ROAD]);
    assert.deepStrictEqual(first.insideRoadIds, ["R1", "R2"]);
    assert.deepStrictEqual(second.insideRoadIds, ["R2", "R1"]);
    assert.strictEqual(
      kind(
        {
          vehicleId: "V1",
          lat: 11,
          lon: 77.001,
          speed: 0,
          bearing: null,
          roadEnteredAt: { R1: 1, R2: 1 },
          ...first,
        },
        [
          {
            vehicleId: "V2",
            lat: 11,
            lon: 77.001,
            speed: 0,
            bearing: null,
            roadEnteredAt: { R1: 2, R2: 2 },
            ...second,
          },
        ],
      ),
      "RIGHT_OF_WAY",
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

console.log(
  `\n  ${Object.keys(tests).length - failed} passed, ${failed} failed`,
);

if (failed > 0) process.exit(1);
