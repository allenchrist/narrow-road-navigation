/**
 * The live vehicle list. Needs no running server or database.
 *
 * Usage:
 *   npm run test:state
 */

const assert = require("assert");
const {
  registerVehicle,
  setVehicleConnected,
  forgetIdleVehicles,
  getVehicleCount,
} = require("../services/vehicleState");

const HOUR_MS = 60 * 60 * 1000;

const tests = {
  "a connected vehicle is never forgotten": () => {
    registerVehicle("VEHICLE_901");
    const before = getVehicleCount();
    assert.strictEqual(forgetIdleVehicles(Date.now() + 2 * HOUR_MS), 0);
    assert.strictEqual(getVehicleCount(), before);
  },
  "a vehicle gone for under an hour is kept": () => {
    registerVehicle("VEHICLE_902");
    setVehicleConnected("VEHICLE_902", false);
    assert.strictEqual(forgetIdleVehicles(Date.now() + HOUR_MS / 2), 0);
  },
  "a vehicle gone for over an hour is forgotten": () => {
    const before = getVehicleCount();
    assert.strictEqual(forgetIdleVehicles(Date.now() + 2 * HOUR_MS), 1);
    assert.strictEqual(getVehicleCount(), before - 1);
  },
  "a forgotten vehicle can come back": () => {
    const before = getVehicleCount();
    registerVehicle("VEHICLE_902");
    assert.strictEqual(getVehicleCount(), before + 1);
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
