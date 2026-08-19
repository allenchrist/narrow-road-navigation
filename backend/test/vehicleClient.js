/**
 * DEVELOPMENT TEST CLIENT — NOT FOR PRODUCTION
 *
 * Simulates Android phones connecting to the backend.
 *
 * Each simulated phone has a PERSISTENT device ID (like a real Android device).
 * The device ID never changes across reconnects — exactly like SharedPreferences
 * on a real phone.
 *
 * Behaviour mirrors the real Android app:
 *
 *   1. Connect to ws://localhost:5000/vehicle
 *   2. Send:  { type: "register", deviceId: "<persistent-id>" }
 *   3. Wait for: { type: "registered", deviceId: "...", vehicleId: "VEHICLE_001" }
 *   4. Store the assigned vehicleId for this session
 *   5. Begin sending telemetry (no vehicleId in each packet)
 *   6. On disconnect: reconnect using the SAME deviceId
 *
 * Usage:
 *   node backend/test/vehicleClient.js
 *
 * Requires the backend to be running:
 *   node backend/server.js
 */

const WebSocket = require("ws");

const BACKEND_WS_URL =
  process.env.BACKEND_WS_URL || "ws://localhost:5000/vehicle";

const RECONNECT_DELAY_MS = 3000;
const TELEMETRY_INTERVAL_MS = 1000;

// Each entry represents one simulated Android device.
// The deviceId is fixed — it never changes, just like a real phone.
const SIMULATED_DEVICES = [
  {
    label: "SIMULATOR_1",
    deviceId: "test-device-001",
    startPos: { lat: 10.958063, lon: 76.956192, heading: 0,   latDelta:  0.000015, lonDelta:  0.000005, headingDelta:  0.8 },
  },
  {
    label: "SIMULATOR_2",
    deviceId: "test-device-002",
    startPos: { lat: 10.958300, lon: 76.956500, heading: 180, latDelta: -0.000012, lonDelta: -0.000003, headingDelta: -0.6 },
  },
];

function createSimulatedPhone({ label, deviceId, startPos }) {
  const pos = { ...startPos };

  let ws = null;
  let assignedVehicleId = null;
  let telemetryInterval = null;
  let reconnectTimer = null;
  let running = true;

  function connect() {
    if (!running) return;

    console.log(`[${label}] Connecting to ${BACKEND_WS_URL} ...`);
    ws = new WebSocket(BACKEND_WS_URL);

    ws.on("open", () => {
      console.log(`[${label}] Connected`);
      console.log(`[${label}] Registering device ${deviceId}`);

      // Step 1: send persistent deviceId — server determines vehicleId
      ws.send(JSON.stringify({ type: "register", deviceId }));
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.warn(`[${label}] Received non-JSON message`);
        return;
      }

      if (msg.type === "registered") {
        assignedVehicleId = msg.vehicleId;
        console.log(`[${label}] Assigned ${assignedVehicleId} (deviceId: ${msg.deviceId})`);
        startTelemetry();
        return;
      }

      if (msg.type === "error") {
        console.error(`[${label}] Server error: ${msg.message}`);
        return;
      }
    });

    ws.on("close", (code, reason) => {
      stopTelemetry();
      const prev = assignedVehicleId;
      assignedVehicleId = null;

      if (running) {
        console.log(
          `[${label}] Disconnected (was ${prev ?? "unassigned"}, code ${code}) — reconnecting in ${RECONNECT_DELAY_MS}ms`
        );
        // Reconnect with the SAME deviceId — backend will restore the same vehicleId
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    });

    ws.on("error", (err) => {
      console.error(`[${label}] WebSocket error: ${err.message}`);
    });
  }

  function startTelemetry() {
    stopTelemetry(); // guard against double-start
    console.log(`[${label}] Sending telemetry`);

    telemetryInterval = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      pos.lat += pos.latDelta;
      pos.lon += pos.lonDelta;
      pos.heading = (pos.heading + pos.headingDelta + 360) % 360;

      // Telemetry has NO vehicleId — the connection identifies the device
      const telemetry = {
        lat:     parseFloat(pos.lat.toFixed(7)),
        lon:     parseFloat(pos.lon.toFixed(7)),
        heading: parseFloat(pos.heading.toFixed(1)),
        accelX:  parseFloat((Math.random() * 0.4 - 0.2).toFixed(3)),
        accelY:  parseFloat((Math.random() * 0.4 - 0.2).toFixed(3)),
        accelZ:  parseFloat((9.5 + Math.random() * 0.2).toFixed(3)),
        gyroX:   parseFloat((Math.random() * 0.04 - 0.02).toFixed(4)),
        gyroY:   parseFloat((Math.random() * 0.04 - 0.02).toFixed(4)),
        gyroZ:   parseFloat((Math.random() * 0.04 - 0.02).toFixed(4)),
      };

      ws.send(JSON.stringify(telemetry));
    }, TELEMETRY_INTERVAL_MS);
  }

  function stopTelemetry() {
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
    }
  }

  connect();

  return {
    stop() {
      running = false;
      stopTelemetry();
      clearTimeout(reconnectTimer);
      if (ws) ws.terminate();
      console.log(`[${label}] Stopped`);
    },
  };
}

// Start all simulated phones
const phones = SIMULATED_DEVICES.map(createSimulatedPhone);

process.on("SIGINT", () => {
  console.log("\n[Test Client] Stopping all simulated phones...");
  phones.forEach((p) => p.stop());
  process.exit(0);
});
