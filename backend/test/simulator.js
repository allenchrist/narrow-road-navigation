/**
 * DEMO SIMULATOR — two cars meeting on a real narrow road
 *
 * Connects to the backend exactly like the phone app does, then drives
 * Car A and Car B along a road through every narrow-road alert. It checks
 * Car A's alert after each phase and exits with an error if one is wrong.
 *
 * Watch it on the dashboard as Car A: /sim_car_a
 *
 * Usage (the backend must be running):
 *   npm run simulate
 *   npm run simulate -- --loop      repeat until stopped with Ctrl+C
 *
 * Environment:
 *   BACKEND_URL   default http://localhost:5000
 *
 * Uses the demo accounts sim_car_a and sim_car_b, creating them on first run.
 */

const WebSocket = require("ws");
const { isPointInsidePolygon } = require("../services/geofenceService");
const { nearestPointOnPolygon } = require("../utils/geo");

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
const VEHICLE_WS_URL = `${BACKEND_URL.replace(/^http/, "ws")}/vehicle`;

// This account can only see its own demo dashboard, so a fixed password is fine
const DEMO_PASSWORD = "simulator-demo-only";

const CAR_A = { username: "sim_car_a", deviceId: "simulator-car-a" };
const CAR_B = { username: "sim_car_b", deviceId: "simulator-car-b" };

const TICK_MS = 1000;
const START_DELAY_MS = 5000;
const METRES_PER_DEGREE = 111195;

const MIN_ROAD_LENGTH_M = 100;
const MAX_ROAD_LENGTH_M = 500;

// Keeps the two lead-in stretches clear of other roads where possible
const CLEARANCE_M = 200;
const ROUTE_SAMPLES = 20;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Backend API ───────────────────────────────────────────────────────────────

async function postJson(path, body, token) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

/**
 * Creates the account if needed, links its device, and returns its login token.
 */
async function prepareDemoAccount({ username, deviceId }) {
  const registered = await postJson("/api/auth/register", {
    username,
    email: `${username}@example.com`,
    password: DEMO_PASSWORD,
  });

  if (registered.status !== 201 && registered.status !== 409) {
    throw new Error(`Could not create the demo account: ${registered.body.message}`);
  }

  const login = await postJson("/api/auth/login", {
    username,
    password: DEMO_PASSWORD,
  });

  if (login.status !== 200) {
    throw new Error(`Could not log in to the demo account: ${login.body.message}`);
  }

  const device = await postJson(
    "/api/auth/device",
    { deviceId },
    login.body.token
  );

  if (device.status !== 200) {
    throw new Error(`Could not link the demo device: ${device.body.message}`);
  }

  return login.body.token;
}

async function getRoads(token) {
  const response = await fetch(`${BACKEND_URL}/api/narrow-roads`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const { roads } = await response.json();

  if (!roads || roads.length === 0) {
    throw new Error("The backend has no narrow roads. Run: npm run db:init");
  }

  return roads;
}

async function getAlert(token) {
  const response = await fetch(`${BACKEND_URL}/api/auth/vehicle`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const { vehicle } = await response.json();

  return vehicle?.narrowRoadAlert?.kind ?? "UNKNOWN";
}

// ── Route: a straight line through the road, extended past both ends ──────────

function makeRoute(start, end) {
  const lonScale = Math.cos((start[0] * Math.PI) / 180);
  const north = (end[0] - start[0]) * METRES_PER_DEGREE;
  const east = (end[1] - start[1]) * METRES_PER_DEGREE * lonScale;
  const length = Math.hypot(north, east);

  return {
    length,
    bearing: ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360,
    pointAt(distance) {
      const fraction = distance / length;

      return {
        lat: start[0] + (end[0] - start[0]) * fraction,
        lon: start[1] + (end[1] - start[1]) * fraction,
      };
    },
  };
}

function farthestPoints(polygon) {
  let best = { distance: -1 };

  for (let i = 0; i < polygon.length; i++) {
    for (let j = i + 1; j < polygon.length; j++) {
      const distance = makeRoute(polygon[i], polygon[j]).length;

      if (distance > best.distance) {
        best = { distance, start: polygon[i], end: polygon[j] };
      }
    }
  }

  return best;
}

function sampleRoute(route, from, to) {
  return Array.from({ length: ROUTE_SAMPLES + 1 }, (_, i) =>
    route.pointAt(from + ((to - from) * i) / ROUTE_SAMPLES)
  );
}

/**
 * The route must stay inside the road along its length and outside it on
 * the lead-in at each end. Returns how many other roads are close to it.
 */
function scoreRoad(road, roads) {
  const { start, end } = farthestPoints(road.polygon);
  const route = makeRoute(start, end);

  if (route.length < MIN_ROAD_LENGTH_M || route.length > MAX_ROAD_LENGTH_M) {
    return null;
  }

  const isInside = ({ lat, lon }) => isPointInsidePolygon(lat, lon, road.polygon);

  const staysInside = sampleRoute(route, route.length * 0.02, route.length * 0.98).every(isInside);
  const clearOfRoad = [
    ...sampleRoute(route, -CLEARANCE_M, -5),
    ...sampleRoute(route, route.length + 5, route.length + CLEARANCE_M),
  ].every((point) => !isInside(point));

  if (!staysInside || !clearOfRoad) {
    return null;
  }

  const wholeRoute = sampleRoute(route, -CLEARANCE_M, route.length + CLEARANCE_M);

  const nearbyRoads = roads.filter(
    (other) =>
      other.id !== road.id &&
      wholeRoute.some(
        ({ lat, lon }) =>
          nearestPointOnPolygon(lat, lon, other.polygon).distanceM < CLEARANCE_M ||
          isPointInsidePolygon(lat, lon, other.polygon)
      )
  ).length;

  return { road, route, nearbyRoads };
}

function chooseRoad(roads) {
  const candidates = roads
    .map((road) => scoreRoad(road, roads))
    .filter(Boolean)
    .sort((a, b) => a.nearbyRoads - b.nearbyRoads);

  if (candidates.length === 0) {
    throw new Error("No narrow road is straight enough to simulate on.");
  }

  // A named road reads better on screen, if one is just as clear of others
  const clearest = candidates.filter((c) => c.nearbyRoads === candidates[0].nearbyRoads);

  return clearest.find((c) => !/^Narrow Road \d+$/.test(c.road.name)) || clearest[0];
}

// ── Simulated phones ──────────────────────────────────────────────────────────

function connectCar({ deviceId }, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(VEHICLE_WS_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "register", deviceId }));
    });

    ws.on("error", reject);

    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());

      if (message.type === "registered") {
        resolve({ ws, vehicleId: message.vehicleId });
      }
    });
  });
}

function sendTelemetry(car, { lat, lon }, speed, bearing) {
  car.ws.send(
    JSON.stringify({
      lat,
      lon,
      heading: bearing ?? 0,
      accelX: 0,
      accelY: 0,
      accelZ: 9.8,
      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,
      speed,
      accuracy: 5,
      ...(bearing !== null && { bearing }),
    })
  );
}

// ── Scenario ──────────────────────────────────────────────────────────────────

/**
 * Positions are metres along the route: 0 is where Car A's end of the road
 * starts and L is the far end. Car A drives forwards and Car B backwards.
 * Car B is "away" (parked well clear of the road), "silent" (connected but
 * sending nothing) or moving between two positions.
 */
function buildPhases(L) {
  return [
    {
      title: "Car A drives towards the road (no alert yet)",
      expected: "NONE",
      seconds: 10,
      carA: [-120, -20],
      carB: "away",
    },
    {
      title: "Car A enters the narrow road",
      expected: "IN_NARROW_ROAD",
      seconds: 10,
      carA: [-20, L * 0.2],
      carB: "away",
    },
    {
      title: "Car B is about to enter the far end",
      expected: "VEHICLE_ENTERING",
      seconds: 8,
      carA: [L * 0.2, L * 0.3],
      carB: [L + 60, L + 10],
    },
    {
      title: "Car B enters, coming towards Car A",
      expected: "ONCOMING_VEHICLE",
      seconds: 8,
      carA: [L * 0.3, L * 0.4],
      carB: [L + 10, L * 0.75],
    },
    {
      title: "Car B stops in the road",
      expected: "VEHICLE_IN_ROAD",
      seconds: 8,
      carA: [L * 0.4, L * 0.5],
      carB: [L * 0.75, L * 0.75],
    },
    {
      title: "Car B's phone goes silent, so it stops counting",
      expected: "IN_NARROW_ROAD",
      seconds: 8,
      carA: [L * 0.5, L * 0.6],
      carB: "silent",
    },
    {
      title: "Car A leaves the road",
      expected: "NONE",
      seconds: 30,
      carA: [L * 0.6, L + CLEARANCE_M],
      carB: "away",
    },
  ];
}

function moveAlongRoute(car, route, [from, to], progress, seconds, forwardBearing) {
  const distance = from + (to - from) * progress;
  const speed = Math.abs(to - from) / seconds;

  sendTelemetry(
    car,
    route.pointAt(distance),
    speed,
    speed > 0 ? forwardBearing : null
  );
}

async function runPhase(phase, route, carA, carB) {
  const { seconds } = phase;
  const carABearing = route.bearing;
  const carBBearing = (route.bearing + 180) % 360;

  // Well clear of the road, on the far side of Car A's lead-in
  const awayPoint = route.pointAt(-5000);

  console.log(`\n▶ ${phase.title}`);

  for (let tick = 1; tick <= seconds; tick++) {
    const progress = tick / seconds;

    moveAlongRoute(carA, route, phase.carA, progress, seconds, carABearing);

    if (phase.carB === "away") {
      sendTelemetry(carB, awayPoint, 0, null);
    } else if (phase.carB !== "silent") {
      moveAlongRoute(carB, route, phase.carB, progress, seconds, carBBearing);
    }

    await delay(TICK_MS);
  }

  const alert = await getAlert(carA.token);
  const passed = alert === phase.expected;

  console.log(
    `  ${passed ? "✓" : "✗"} Car A alert: ${alert}` +
      (passed ? "" : ` (expected ${phase.expected})`)
  );

  return passed;
}

async function runScenario(route, carA, carB) {
  let failed = 0;

  for (const phase of buildPhases(route.length)) {
    if (!(await runPhase(phase, route, carA, carB))) {
      failed++;
    }
  }

  return failed;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const loop = process.argv.includes("--loop");

  console.log(`Backend: ${BACKEND_URL}`);

  const carAToken = await prepareDemoAccount(CAR_A);
  const carBToken = await prepareDemoAccount(CAR_B);

  const { road, route, nearbyRoads } = chooseRoad(await getRoads(carAToken));

  console.log(
    `Road: ${road.name} (${Math.round(route.length)} m, ${nearbyRoads} other roads nearby)`
  );

  const carA = await connectCar(CAR_A, carAToken);
  carA.token = carAToken;
  const carB = await connectCar(CAR_B, carBToken);

  const stop = () => {
    carA.ws.close();
    carB.ws.close();
    process.exit(0);
  };

  process.on("SIGINT", stop);

  console.log(`Car A: ${carA.vehicleId}, Car B: ${carB.vehicleId}`);
  console.log(`\nOpen the dashboard as Car A: /${CAR_A.username}`);
  console.log(`Click once on the page to allow alert sounds. Starting in ${START_DELAY_MS / 1000}s...`);

  await delay(START_DELAY_MS);

  let failed = 0;

  do {
    failed += await runScenario(route, carA, carB);
  } while (loop);

  carA.ws.close();
  carB.ws.close();

  console.log(failed === 0 ? "\nAll alerts correct." : `\n${failed} alerts were wrong.`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nSimulator stopped: ${error.message}`);

  if (error.cause?.code === "ECONNREFUSED" || error.code === "ECONNREFUSED") {
    console.error(`Is the backend running at ${BACKEND_URL}? Start it with: npm run dev`);
  }

  process.exit(1);
});
