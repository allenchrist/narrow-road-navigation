/**
 * MOUNTAIN MODE SIMULATOR — a bus and a car meeting at a real hairpin
 *
 * Connects to the backend like the phone app does, and drives a car up the
 * Yercaud ghat road and a bus down it, to the same hairpin bend. It checks
 * both vehicles' alerts after each phase and exits with an error if one is
 * wrong.
 *
 * Watch it on the dashboard as the car: /sim_car_a, or the bus: /sim_car_b
 *
 * Usage (the backend must be running):
 *   npm run simulate:mountain
 *
 * Environment:
 *   BACKEND_URL         default http://127.0.0.1:5000
 *   SIMULATOR_PASSWORD  set this when using any database other people can reach
 *
 * Uses the demo accounts sim_car_a (a car) and sim_car_b (a bus), creating
 * them on first run.
 */

const WebSocket = require("ws");
const { measureLine, pointAt } = require("../services/hillRoads");
const hillRoads = require("../data/hillRoads.json");

const BACKEND_URL = (
  process.env.BACKEND_URL || "http://127.0.0.1:5000"
).replace(/\/$/, "");
const VEHICLE_WS_URL = `${BACKEND_URL.replace(/^http/, "ws")}/vehicle`;

// These accounts can only see their own demo dashboards
const DEMO_PASSWORD = process.env.SIMULATOR_PASSWORD || "simulator-demo-only";

const CAR = { username: "sim_car_a", deviceId: "simulator-car-a" };
const BUS = {
  username: "sim_car_b",
  deviceId: "simulator-car-b",
  vehicleType: "bus",
};

const ROAD_ID = "HILL_YERCAUD";
const TICK_MS = 1000;
const START_DELAY_MS = 3000;

// A bend with this much road clear of other bends on each side, so the
// vehicles only meet at this one
const CLEAR_OF_BENDS_M = 220;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Backend API ───────────────────────────────────────────────────────────────

async function sendJson(method, path, body, token) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

/** Creates the account if needed, links its device, and returns its token. */
async function prepareDemoAccount({ username, deviceId, vehicleType }) {
  const registered = await sendJson("POST", "/api/auth/register", {
    username,
    email: `${username}@example.com`,
    password: DEMO_PASSWORD,
    vehicleType,
  });

  if (![201, 409, 410].includes(registered.status)) {
    throw new Error(`Could not create ${username}: ${registered.body.message}`);
  }

  const login = await sendJson("POST", "/api/auth/login", {
    username,
    password: DEMO_PASSWORD,
  });

  if (login.status !== 200) {
    throw new Error(
      `Could not log in as ${username}. To create it, set ALLOW_TEST_SIGNUP=true on the server.`,
    );
  }

  const { token } = login.body;

  await sendJson("POST", "/api/auth/device", { deviceId }, token);
  await sendJson(
    "PUT",
    "/api/auth/vehicle-type",
    { vehicleType: vehicleType ?? "car" },
    token,
  );

  return token;
}

async function getVehicle(token) {
  const response = await fetch(`${BACKEND_URL}/api/auth/vehicle`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return (await response.json()).vehicle ?? null;
}

function connect({ deviceId }, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(VEHICLE_WS_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    ws.on("open", () =>
      ws.send(JSON.stringify({ type: "register", deviceId })),
    );
    ws.on("error", reject);
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());

      if (message.type === "registered") resolve({ ws, token });
    });
  });
}

// ── The road ──────────────────────────────────────────────────────────────────

const road = hillRoads.find((hill) => hill.id === ROAD_ID);
const metres = measureLine(road.line);

const bend = road.bends.find((candidate, i) => {
  const before = road.bends[i - 1];
  const after = road.bends[i + 1];

  return (
    (!before || candidate.startM - before.endM >= CLEAR_OF_BENDS_M) &&
    (!after || after.startM - candidate.endM >= CLEAR_OF_BENDS_M)
  );
});

if (!bend) throw new Error("No hairpin is clear enough of the others");

function send(vehicle, metre, speed) {
  const [lat, lon] = pointAt(road.line, metres, metre);

  vehicle.ws.send(
    JSON.stringify({
      lat,
      lon,
      heading: 0,
      accelX: 0,
      accelY: 0,
      accelZ: 9.8,
      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,
      speed,
      accuracy: 5,
    }),
  );
}

// ── Scenario ──────────────────────────────────────────────────────────────────

/**
 * Positions are metres along the road. The car drives up (metres rising),
 * the bus down. Each phase moves them from the first position to the second.
 */
function buildPhases() {
  const { startM, endM, waitBelowM } = bend;

  return [
    {
      title:
        "The car and the bus head for the same hairpin from opposite directions",
      seconds: 8,
      car: [startM - 180, startM - 100],
      bus: [endM + 150, endM + 102],
      expected: { car: "BEND_STOP", bus: "BEND_GO" },
    },
    {
      title: "The car stops at the waiting point",
      seconds: 6,
      car: [startM - 100, waitBelowM],
      bus: [endM + 102, endM + 66],
      expected: { car: "BEND_STOP", bus: "BEND_GO" },
    },
    {
      title: "The bus takes the bend while the car waits",
      seconds: 10,
      car: [waitBelowM, waitBelowM],
      bus: [endM + 66, startM + 6],
      expected: { car: "BEND_STOP", bus: "BEND_GO" },
    },
    {
      title: "The bus is out of the bend, so the car is told it's clear",
      seconds: 8,
      car: [waitBelowM, waitBelowM],
      bus: [startM + 6, startM - 60],
      expected: { car: "BEND_CLEAR" },
    },
    {
      title: "The car takes the bend",
      seconds: 12,
      car: [waitBelowM, endM + 60],
      bus: [startM - 60, startM - 180],
      expected: { car: "NONE" },
    },
  ];
}

async function runPhase(phase, car, bus) {
  console.log(`\n▶ ${phase.title}`);

  for (let tick = 1; tick <= phase.seconds; tick++) {
    const progress = tick / phase.seconds;

    for (const [vehicle, [from, to]] of [
      [car, phase.car],
      [bus, phase.bus],
    ]) {
      send(
        vehicle,
        from + (to - from) * progress,
        Math.abs(to - from) / phase.seconds,
      );
    }

    await delay(TICK_MS);
  }

  let passed = true;

  for (const [name, vehicle] of [
    ["car", car],
    ["bus", bus],
  ]) {
    const expected = phase.expected[name];

    if (!expected) continue;

    const state = await getVehicle(vehicle.token);
    const kind = state?.narrowRoadAlert?.kind ?? "UNKNOWN";
    const ok = kind === expected;
    const counter = state?.mountain?.nextBend
      ? ` (hairpin ${state.mountain.nextBend.number} of ${state.mountain.bendCount})`
      : "";

    console.log(
      `  ${ok ? "✓" : "✗"} ${name}: ${kind}${counter}${ok ? "" : ` (expected ${expected})`}`,
    );

    passed &&= ok;
  }

  return passed;
}

async function main() {
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`${road.name}, hairpin ${bend.number} of ${road.bends.length}`);

  const car = await connect(CAR, await prepareDemoAccount(CAR));
  const bus = await connect(BUS, await prepareDemoAccount(BUS));

  console.log(
    `\nWatch the car on /${CAR.username} or the bus on /${BUS.username}`,
  );
  console.log(`Starting in ${START_DELAY_MS / 1000}s...`);

  await delay(START_DELAY_MS);

  let failed = 0;

  for (const phase of buildPhases()) {
    if (!(await runPhase(phase, car, bus))) failed++;
  }

  car.ws.close();
  bus.ws.close();

  console.log(
    failed === 0 ? "\nAll alerts correct." : `\n${failed} phases were wrong.`,
  );

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nSimulator stopped: ${error.message}`);
  process.exit(1);
});
