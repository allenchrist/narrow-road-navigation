/**
 * DEVELOPMENT TEST CLIENT — NOT FOR PRODUCTION
 *
 * Simulates Android phones connecting to the backend.
 * Behaves exactly like the real Android app will:
 *
 *   1. Connect to ws://localhost:5000/vehicle
 *   2. Wait for { type: "registered", vehicleId: "VEHICLE_X" }
 *   3. Store the assigned vehicle ID
 *   4. Begin sending telemetry (no vehicleId in each packet)
 *   5. Reconnect automatically on disconnect
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

const RECONNECT_DELAY = 3000;
const TELEMETRY_INTERVAL_MS = 1000;
const SIMULATOR_COUNT = 2;

// Starting positions for each simulated phone
const STARTING_POSITIONS = [
  { lat: 10.958063, lon: 76.956192, heading: 0,   latDelta:  0.000015, lonDelta:  0.000005, headingDelta:  0.8 },
  { lat: 10.958300, lon: 76.956500, heading: 180, latDelta: -0.000012, lonDelta: -0.000003, headingDelta: -0.6 },
];

function createSimulatedPhone(index) {
  const label = `SIMULATOR_${index + 1}`;
  const pos = { ...STARTING_POSITIONS[index] };

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
      console.log(`[${label}] Connected — waiting for vehicle ID assignment`);
      // Do NOT send anything — backend assigns ID automatically
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "registered") {
        assignedVehicleId = msg.vehicleId;
        console.log(`[${label}] Assigned ${assignedVehicleId}`);

        // Start sending telemetry now that we have an ID
        telemetryInterval = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;

          pos.lat += pos.latDelta;
          pos.lon += pos.lonDelta;
          pos.heading = (pos.heading + pos.headingDelta + 360) % 360;

          // Telemetry has NO vehicleId — the connection identifies the vehicle
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

        return;
      }

      if (msg.type === "error") {
        console.error(`[${label}] Server error: ${msg.message}`);
      }
    });

    ws.on("close", () => {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
      const prev = assignedVehicleId;
      assignedVehicleId = null;

      if (running) {
        console.log(
          `[${label}] Disconnected (was ${prev || "unassigned"}) — reconnecting in ${RECONNECT_DELAY}ms`
        );
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
      }
    });

    ws.on("error", (err) => {
      console.error(`[${label}] Error: ${err.message}`);
    });
  }

  connect();

  return {
    stop() {
      running = false;
      clearInterval(telemetryInterval);
      clearTimeout(reconnectTimer);
      if (ws) ws.terminate();
      console.log(`[${label}] Stopped`);
    },
  };
}

// Start all simulated phones
const phones = Array.from({ length: SIMULATOR_COUNT }, (_, i) =>
  createSimulatedPhone(i)
);

process.on("SIGINT", () => {
  console.log("\n[Test Client] Stopping all simulated phones...");
  phones.forEach((p) => p.stop());
  process.exit(0);
});
