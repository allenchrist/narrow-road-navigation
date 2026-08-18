/**
 * Vehicle ID Allocator
 *
 * Strategy: reuse the lowest available slot.
 * VEHICLE_A is always the first connection, VEHICLE_B the second, etc.
 * When a vehicle disconnects its slot is released and can be reused
 * by the next incoming connection.
 *
 * This is a SESSION identity only — not persistent ownership.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Set of currently active (allocated) vehicle IDs
const activeIds = new Set();

/**
 * Allocate the next available vehicle ID.
 * Returns a string like "VEHICLE_A", "VEHICLE_B", etc.
 * Supports up to 26 simultaneous vehicles (A–Z).
 * Beyond that, uses two-letter suffixes: AA, AB, ...
 */
function allocateVehicleId() {
  // Find the first unused single-letter slot
  for (const letter of LETTERS) {
    const id = `VEHICLE_${letter}`;
    if (!activeIds.has(id)) {
      activeIds.add(id);
      return id;
    }
  }

  // Overflow: two-letter slots (VEHICLE_AA, VEHICLE_AB, ...)
  for (const l1 of LETTERS) {
    for (const l2 of LETTERS) {
      const id = `VEHICLE_${l1}${l2}`;
      if (!activeIds.has(id)) {
        activeIds.add(id);
        return id;
      }
    }
  }

  // Should never reach here in practice
  throw new Error("[Vehicle Allocator] No available vehicle IDs");
}

/**
 * Release a vehicle ID back to the pool when its session ends.
 */
function releaseVehicleId(vehicleId) {
  activeIds.delete(vehicleId);
}

/**
 * Check if a vehicle ID is currently active.
 */
function isVehicleIdActive(vehicleId) {
  return activeIds.has(vehicleId);
}

module.exports = { allocateVehicleId, releaseVehicleId, isVehicleIdActive };
