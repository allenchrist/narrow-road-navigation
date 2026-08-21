/**
 * Temporary in-memory vehicle pairing service.
 *
 * Pairing code:
 *   6-digit code → deviceId → vehicleId
 *
 * No database for Phase 1.
 */

const pairings = new Map();

function generatePairingCode() {
  let code;

  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (pairings.has(code));

  return code;
}

function createPairing(deviceId, vehicleId) {
  // Remove any previous pairing for this device
  for (const [code, pairing] of pairings.entries()) {
    if (pairing.deviceId === deviceId) {
      pairings.delete(code);
    }
  }

  const code = generatePairingCode();

  pairings.set(code, {
    deviceId,
    vehicleId,
    createdAt: Date.now(),
  });

  console.log(
    `[Pairing] ${deviceId} → ${vehicleId} | Code: ${code}`
  );

  return code;
}

function getPairing(code) {
  if (!code) return null;

  const normalizedCode = String(code).trim();

  const pairing = pairings.get(normalizedCode);

  if (!pairing) {
    return null;
  }

  return { ...pairing };
}

function removePairing(code) {
  if (!code) return;

  pairings.delete(String(code).trim());
}

function getPairingCount() {
  return pairings.size;
}

module.exports = {
  createPairing,
  getPairing,
  removePairing,
  getPairingCount,
};