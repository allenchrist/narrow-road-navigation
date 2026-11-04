/**
 * Vehicle ID Allocator
 *
 * Allocates a new vehicle ID for a device that has never been seen before.
 * Once allocated, a vehicle ID is PERMANENTLY reserved for that device.
 * It is NEVER released back to the pool, even when the device disconnects.
 *
 * This is the key difference from the old session-only allocator:
 *
 *   OLD: releaseVehicleId() returned the slot to the pool on disconnect.
 *        A reconnecting device could get a different ID.
 *
 *   reserveVehicleId() permanently marks the slot.
 *        Only brand-new devices consume a new slot.
 *        Reconnecting devices are handled by deviceRegistry, not here.
 *
 * Format: VEHICLE_001, VEHICLE_002, ... VEHICLE_999, VEHICLE_1000, ...
 * Numeric format chosen over letters to support arbitrary scale cleanly.
 */

let nextCounter = 1;

/**
 * Allocate and permanently reserve the next available vehicle ID.
 * Call this ONLY for a device that has never been seen before.
 * Returns a string like "VEHICLE_001".
 */
function allocateVehicleId() {
  const id = `VEHICLE_${String(nextCounter).padStart(3, "0")}`;
  nextCounter++;
  return id;
}

/**
 * Mark a saved vehicle ID as taken, so new devices never receive it.
 */
function reserveVehicleId(vehicleId) {
  const number = parseInt(vehicleId.replace("VEHICLE_", ""), 10);

  if (number >= nextCounter) {
    nextCounter = number + 1;
  }
}

module.exports = { allocateVehicleId, reserveVehicleId };
