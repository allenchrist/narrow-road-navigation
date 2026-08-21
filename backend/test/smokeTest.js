/**
 * Smoke Test — Persistent Device Registration & Vehicle Identity
 *
 * Tests all required scenarios:
 *
 *   TEST 1 — New device gets a vehicle assigned
 *   TEST 2 — Second device gets a different vehicle
 *   TEST 3 — Reconnecting device gets the SAME vehicle
 *   TEST 4 — New device after disconnect gets a NEW vehicle (not stolen)
 *   TEST 5 — Duplicate connection: old replaced, same vehicleId kept
 *   TEST 6 — Telemetry isolation: device-A telemetry doesn't affect device-B
 *   TEST 7 — Disconnect marks vehicle connected=false, others unaffected
 *   TEST 8 — /health endpoint returns deviceCount and vehicleCount
 *
 * Usage:
 *   node backend/test/smokeTest.js
 *
 * Requires the backend to be running:
 *   node backend/server.js
 */

const WebSocket = require("ws");
const http = require("http");

const WS_URL = "ws://127.0.0.1:5000/vehicle";
const HEALTH_URL = process.env.HEALTH_URL || "http://127.0.0.1:5000/health";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Connect a WebSocket, send a register message, and wait for the registered response.
 * Returns { ws, deviceId, vehicleId }.
 */
function connectAndRegister(deviceId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => reject(new Error(`Timeout registering ${deviceId}`)), 5000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "register", deviceId }));
    });

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === "registered") {
        clearTimeout(timeout);
        resolve({ ws, deviceId: msg.deviceId, vehicleId: msg.vehicleId });
      }
      if (msg.type === "error") {
        clearTimeout(timeout);
        reject(new Error(`Server error for ${deviceId}: ${msg.message}`));
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Send one telemetry packet on an open WebSocket.
 */
function sendTelemetry(ws, overrides = {}) {
  const packet = {
    lat: 10.958063,
    lon: 76.956192,
    heading: 90.0,
    accelX: 0.1,
    accelY: 0.2,
    accelZ: 9.6,
    gyroX: 0.01,
    gyroY: 0.02,
    gyroZ: 0.01,
    ...overrides,
  };
  ws.send(JSON.stringify(packet));
}

/**
 * Fetch the /health endpoint and return parsed JSON.
 */
function fetchHealth() {
  return new Promise((resolve, reject) => {
    http.get(HEALTH_URL, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

/**
 * Close a WebSocket and wait for the close event.
 */
function closeAndWait(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.on("close", resolve);
    ws.close();
  });
}

// ── Main test runner ──────────────────────────────────────────────────────────

async function runTests() {
  console.log("=".repeat(60));
  console.log("  Connected Vehicle — Smoke Test Suite");
  console.log("=".repeat(60));
  console.log(`  Backend: ${WS_URL}`);
  console.log("");

  // ── TEST 1: New device gets a vehicle assigned ──────────────────────────
  console.log("TEST 1 — New device gets a vehicle assigned");
  const r1 = await connectAndRegister("smoke-device-A");
  assert(typeof r1.vehicleId === "string" && r1.vehicleId.startsWith("VEHICLE_"), `device-A assigned vehicleId: ${r1.vehicleId}`);
  assert(r1.deviceId === "smoke-device-A", `deviceId echoed correctly: ${r1.deviceId}`);
  const vehicleA = r1.vehicleId;
  console.log("");

  // ── TEST 2: Second device gets a different vehicle ──────────────────────
  console.log("TEST 2 — Second device gets a different vehicle");
  const r2 = await connectAndRegister("smoke-device-B");
  assert(typeof r2.vehicleId === "string" && r2.vehicleId.startsWith("VEHICLE_"), `device-B assigned vehicleId: ${r2.vehicleId}`);
  assert(r2.vehicleId !== vehicleA, `device-B got different vehicle than device-A (${r2.vehicleId} ≠ ${vehicleA})`);
  const vehicleB = r2.vehicleId;
  console.log("");

  // ── TEST 3: Reconnecting device gets the SAME vehicle ───────────────────
  console.log("TEST 3 — Reconnecting device gets the same vehicle");
  await closeAndWait(r1.ws);
  await delay(300);
  const r3 = await connectAndRegister("smoke-device-A");
  assert(r3.vehicleId === vehicleA, `device-A reconnected → same vehicleId ${r3.vehicleId} (expected ${vehicleA})`);
  console.log("");

  // ── TEST 4: New device after disconnect gets a new vehicle ──────────────
  console.log("TEST 4 — New device after disconnect gets a new vehicle");
  const r4 = await connectAndRegister("smoke-device-C");
  assert(r4.vehicleId !== vehicleA, `device-C did NOT steal device-A's vehicle (${r4.vehicleId} ≠ ${vehicleA})`);
  assert(r4.vehicleId !== vehicleB, `device-C did NOT steal device-B's vehicle (${r4.vehicleId} ≠ ${vehicleB})`);
  assert(r4.vehicleId.startsWith("VEHICLE_"), `device-C got a valid new vehicleId: ${r4.vehicleId}`);
  const vehicleC = r4.vehicleId;
  console.log("");

  // ── TEST 5: Duplicate connection — old replaced, same vehicleId ─────────
  console.log("TEST 5 — Duplicate connection: old replaced, same vehicleId retained");
  // r3.ws is the current active connection for smoke-device-A
  let oldConnectionClosed = false;
  r3.ws.on("close", () => { oldConnectionClosed = true; });

  const r5 = await connectAndRegister("smoke-device-A");
  await delay(300);
  assert(r5.vehicleId === vehicleA, `Duplicate connection for device-A still gets ${vehicleA}`);
  assert(oldConnectionClosed, "Old connection for device-A was closed by server");
  console.log("");

  // ── TEST 6: Telemetry isolation ─────────────────────────────────────────
  console.log("TEST 6 — Telemetry isolation: device-A telemetry doesn't affect device-B");
  const uniqueLat = 13.123456;
  sendTelemetry(r5.ws, { lat: uniqueLat, lon: 77.0 });
  await delay(400);
  const health6 = await fetchHealth();
  const vA = health6.vehicles.find((v) => v.vehicleId === vehicleA);
  const vB = health6.vehicles.find((v) => v.vehicleId === vehicleB);
  assert(vA && Math.abs(vA.lat - uniqueLat) < 0.0001, `device-A telemetry updated (lat=${vA?.lat})`);
  assert(vB && vB.lat !== uniqueLat, `device-B telemetry unchanged (lat=${vB?.lat})`);
  console.log("");

  // ── TEST 7: Disconnect marks vehicle connected=false ────────────────────
  console.log("TEST 7 — Disconnect marks vehicle connected=false, others unaffected");
  await closeAndWait(r5.ws);
  await delay(400);
  const health7 = await fetchHealth();
  const vA7 = health7.vehicles.find((v) => v.vehicleId === vehicleA);
  const vB7 = health7.vehicles.find((v) => v.vehicleId === vehicleB);
  const vC7 = health7.vehicles.find((v) => v.vehicleId === vehicleC);
  assert(vA7 && vA7.connected === false, `${vehicleA} connected=false after disconnect`);
  assert(vB7 && vB7.connected === true, `${vehicleB} still connected=true`);
  assert(vC7 && vC7.connected === true, `${vehicleC} still connected=true`);
  console.log("");

  // ── TEST 8: /health endpoint ────────────────────────────────────────────
  console.log("TEST 8 — /health endpoint returns deviceCount and vehicleCount");
  const health8 = await fetchHealth();
  assert(health8.status === "ok", `status: ${health8.status}`);
  assert(typeof health8.deviceCount === "number" && health8.deviceCount >= 3, `deviceCount: ${health8.deviceCount}`);
  assert(typeof health8.vehicleCount === "number" && health8.vehicleCount >= 3, `vehicleCount: ${health8.vehicleCount}`);
  assert(Array.isArray(health8.vehicles), "vehicles array present");
  console.log("");

  // ── Cleanup ─────────────────────────────────────────────────────────────
  await closeAndWait(r2.ws);
  await closeAndWait(r4.ws);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("\n[Smoke Test] Fatal error:", err.message);
  process.exit(1);
});
