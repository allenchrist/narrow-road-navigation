/**
 * MOUNTAIN MODE SIMULATOR — two vehicles at a real hairpin
 *
 * Connects to the backend like the phone app does, and drives two vehicles
 * on the Yercaud ghat road to the same hairpin bend. It checks both
 * vehicles' alerts after each phase and exits with an error if one is wrong.
 *
 * Scenarios, chosen with --scenario:
 *   car-bus         a car going up meets a bus coming down: the car waits,
 *                   as the bus needs the whole road to turn (the default)
 *   buses           two buses: the one going uphill goes first
 *   keep-left       two cars: both keep left, and nobody stops
 *   in-bend         the car is already in the bend when a bus arrives, so
 *                   the bus waits
 *   ambulance       an ambulance going up meets a bus coming down: the
 *                   ambulance goes first
 *   no-overtake     a car behind a bus near a bend is told not to overtake
 *
 * Watch the first vehicle on /sim_car_a and the second on /sim_car_b.
 *
 * Usage (the backend must be running):
 *   npm run simulate:mountain
 *   npm run simulate:mountain -- --scenario buses
 *   npm run simulate:mountain -- --loop    repeat until stopped with Ctrl+C
 *
 * Environment:
 *   BACKEND_URL         default http://127.0.0.1:5000
 *   SIMULATOR_PASSWORD  set this when using any database other people can reach
 *
 * Uses the demo accounts sim_car_a and sim_car_b, creating them on first run
 * and setting their vehicle types for the scenario.
 */

const WebSocket = require("ws");
const { bearingBetween } = require("../utils/geo");
const { measureLine, pointAt } = require("../services/hillRoads");
const hillRoads = require("../data/hillRoads.json");

const BACKEND_URL = (
  process.env.BACKEND_URL || "http://127.0.0.1:5000"
).replace(/\/$/, "");
const VEHICLE_WS_URL = `${BACKEND_URL.replace(/^http/, "ws")}/vehicle`;

// These accounts can only see their own demo dashboards
const DEMO_PASSWORD = process.env.SIMULATOR_PASSWORD || "simulator-demo-only";

const ROAD_ID = "HILL_YERCAUD";
const TICK_MS = 1000;
// Between rounds, and from one run to the next, the vehicles jump back to
// the start, which no real vehicle could do. The server forgets their last
// few readings after 6 seconds, so waiting longer than that lets it place
// them afresh. Otherwise it could put one on the other arm of the hairpin,
// near where it was.
const START_DELAY_MS = 8000;
const BETWEEN_ROUNDS_MS = 8000;

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
  await sendJson("PUT", "/api/auth/vehicle-type", { vehicleType }, token);

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

/**
 * The compass direction of travel at a point on the road, going up the road
 * or down it.
 */
function facing(metre, up) {
  const [lat, lon] = pointAt(road.line, metres, metre - 2);
  const [aheadLat, aheadLon] = pointAt(road.line, metres, metre + 2);
  const upTheRoad = bearingBetween(lat, lon, aheadLat, aheadLon);

  return up ? upTheRoad : (upTheRoad + 180) % 360;
}

/**
 * One position, as a phone sends it. The compass heading always points the
 * way the vehicle faces, so it still faces forward while it waits. The GPS
 * direction of travel is only sent while moving, as on a phone.
 */
function send(vehicle, metre, speed, up) {
  const [lat, lon] = pointAt(road.line, metres, metre);
  const direction = facing(metre, up);

  vehicle.ws.send(
    JSON.stringify({
      lat,
      lon,
      heading: direction,
      accelX: 0,
      accelY: 0,
      accelZ: 9.8,
      gyroX: 0,
      gyroY: 0,
      gyroZ: 0,
      speed,
      accuracy: 5,
      ...(speed > 0 && { bearing: direction }),
    }),
  );
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

/**
 * Each scenario has two vehicles, a and b, with their types, names and
 * whether they drive up the road (metres rising) or down it. Each phase
 * moves them from the first position to the second, in metres along the
 * road, and says what each should then be told.
 */
const { startM, endM, waitBelowM, waitAboveM } = bend;

const SCENARIOS = {
  "car-bus": {
    a: { type: "car", name: "car", up: true },
    b: { type: "bus", name: "bus", up: false },
    phases: [
      {
        title:
          "The car and the bus head for the same hairpin from opposite directions",
        seconds: 8,
        a: [startM - 180, startM - 100],
        b: [endM + 150, endM + 102],
        expected: { a: "BEND_STOP", b: "BEND_GO" },
      },
      {
        title: "The car stops at the waiting point",
        seconds: 6,
        a: [startM - 100, waitBelowM],
        b: [endM + 102, endM + 66],
        expected: { a: "BEND_STOP", b: "BEND_GO" },
      },
      {
        title: "The bus takes the bend while the car waits",
        seconds: 10,
        a: [waitBelowM, waitBelowM],
        b: [endM + 66, startM + 6],
        expected: { a: "BEND_STOP", b: "BEND_GO" },
      },
      {
        title: "The bus is out of the bend, so the car is told it's clear",
        seconds: 8,
        a: [waitBelowM, waitBelowM],
        b: [startM + 6, startM - 60],
        expected: { a: "BEND_CLEAR" },
      },
      {
        title: "The car takes the bend",
        seconds: 12,
        a: [waitBelowM, endM + 60],
        b: [startM - 60, startM - 180],
        expected: { a: "NONE" },
      },
    ],
  },

  buses: {
    a: { type: "bus", name: "uphill bus", up: true },
    b: { type: "bus", name: "downhill bus", up: false },
    phases: uphillGoesFirst("uphill bus", "downhill bus", "Two buses"),
  },

  ambulance: {
    a: { type: "priority", name: "ambulance", up: true },
    b: { type: "bus", name: "bus", up: false },
    phases: uphillGoesFirst("ambulance", "bus", "An ambulance and a bus"),
  },

  "keep-left": {
    a: { type: "car", name: "uphill car", up: true },
    b: { type: "car", name: "downhill car", up: false },
    phases: [
      {
        title:
          "Two cars head for the same hairpin, so both are told to keep left",
        seconds: 8,
        a: [startM - 180, startM - 100],
        b: [endM + 150, endM + 102],
        expected: { a: "BEND_KEEP_LEFT", b: "BEND_KEEP_LEFT" },
      },
      {
        title: "Both drive round the bend, keeping left, without stopping",
        seconds: 12,
        a: [startM - 100, endM + 60],
        b: [endM + 102, startM - 60],
        expected: { a: "NONE", b: "NONE" },
      },
    ],
  },

  "in-bend": {
    a: { type: "car", name: "car", up: true },
    b: { type: "bus", name: "bus", up: false },
    phases: [
      {
        title: "The car drives into the hairpin",
        seconds: 8,
        a: [startM - 60, startM + 10],
        b: [endM + 250, endM + 200],
        expected: { a: "NONE", b: "NONE" },
      },
      {
        title:
          "A bus arrives while the car is still in the bend, so the bus waits",
        seconds: 8,
        a: [startM + 10, startM + 25],
        b: [endM + 200, endM + 90],
        expected: { a: "BEND_GO", b: "BEND_STOP" },
      },
      {
        title: "The car finishes the bend, so the bus is told it's clear",
        seconds: 8,
        a: [startM + 25, endM + 60],
        b: [endM + 90, waitAboveM],
        expected: { b: "BEND_CLEAR" },
      },
      {
        title: "The bus takes the bend",
        seconds: 12,
        a: [endM + 60, endM + 180],
        b: [waitAboveM, startM - 60],
        expected: { b: "NONE" },
      },
    ],
  },

  "no-overtake": {
    a: { type: "car", name: "car", up: true },
    b: { type: "bus", name: "bus ahead", up: true },
    phases: [
      {
        title: "A car follows a bus up towards a hairpin",
        seconds: 8,
        a: [startM - 260, startM - 180],
        b: [startM - 160, startM - 80],
        expected: { a: "BEND_NO_OVERTAKE", b: "NONE" },
      },
      {
        title: "The bus turns at the bend, so the car mustn't overtake",
        seconds: 8,
        a: [startM - 180, startM - 80],
        b: [startM - 80, startM + 20],
        expected: { a: "BEND_NO_OVERTAKE", b: "NONE" },
      },
      {
        title: "The bus is round the bend and away, so the warning ends",
        seconds: 12,
        a: [startM - 80, startM - 40],
        b: [startM + 20, endM + 200],
        expected: { a: "NONE" },
      },
    ],
  },
};

/**
 * The vehicle going uphill takes the bend first, and the one coming down
 * waits above it.
 */
function uphillGoesFirst(upName, downName, both) {
  const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  return [
    {
      title: `${both} head for the same hairpin, one uphill and one downhill`,
      seconds: 8,
      a: [startM - 180, startM - 100],
      b: [endM + 150, endM + 102],
      expected: { a: "BEND_GO", b: "BEND_STOP" },
    },
    {
      title: `The ${downName} stops at the waiting point above the bend`,
      seconds: 6,
      a: [startM - 100, startM - 50],
      b: [endM + 102, waitAboveM],
      expected: { a: "BEND_GO", b: "BEND_STOP" },
    },
    {
      title: `The ${upName} takes the bend while the ${downName} waits`,
      seconds: 10,
      a: [startM - 50, endM - 6],
      b: [waitAboveM, waitAboveM],
      expected: { a: "BEND_GO", b: "BEND_STOP" },
    },
    {
      title: `${cap(upName)} is out of the bend, so the ${downName} is told it's clear`,
      seconds: 8,
      a: [endM - 6, endM + 70],
      b: [waitAboveM, waitAboveM],
      expected: { b: "BEND_CLEAR" },
    },
    {
      title: `The ${downName} takes the bend`,
      seconds: 12,
      a: [endM + 70, endM + 190],
      b: [waitAboveM, startM - 60],
      expected: { b: "NONE" },
    },
  ];
}

// ── Running a scenario ────────────────────────────────────────────────────────

// --buses is kept as a short way of asking for two buses
const scenarioFlag = process.argv.indexOf("--scenario");
const scenarioName = process.argv.includes("--buses")
  ? "buses"
  : scenarioFlag >= 0
    ? process.argv[scenarioFlag + 1]
    : "car-bus";

const scenario = SCENARIOS[scenarioName];

if (!scenario) {
  console.error(
    `Unknown scenario "${scenarioName}". Choose from: ${Object.keys(SCENARIOS).join(", ")}`,
  );
  process.exit(1);
}

const A = {
  username: "sim_car_a",
  deviceId: "simulator-car-a",
  vehicleType: scenario.a.type,
};
const B = {
  username: "sim_car_b",
  deviceId: "simulator-car-b",
  vehicleType: scenario.b.type,
};

async function runPhase(phase, a, b) {
  console.log(`\n▶ ${phase.title}`);

  for (let tick = 1; tick <= phase.seconds; tick++) {
    const progress = tick / phase.seconds;

    for (const [vehicle, [from, to], up] of [
      [a, phase.a, scenario.a.up],
      [b, phase.b, scenario.b.up],
    ]) {
      send(
        vehicle,
        from + (to - from) * progress,
        Math.abs(to - from) / phase.seconds,
        up,
      );
    }

    await delay(TICK_MS);
  }

  let passed = true;

  for (const [key, vehicle] of [
    ["a", a],
    ["b", b],
  ]) {
    const expected = phase.expected[key];

    if (!expected) continue;

    const state = await getVehicle(vehicle.token);
    const kind = state?.narrowRoadAlert?.kind ?? "UNKNOWN";
    const ok = kind === expected;
    const counter = state?.mountain?.nextBend
      ? ` (hairpin ${state.mountain.nextBend.number} of ${state.mountain.bendCount})`
      : "";

    console.log(
      `  ${ok ? "✓" : "✗"} ${scenario[key].name}: ${kind}${counter}${ok ? "" : ` (expected ${expected})`}`,
    );

    passed &&= ok;
  }

  return passed;
}

async function main() {
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`${road.name}, hairpin ${bend.number} of ${road.bends.length}`);

  const a = await connect(A, await prepareDemoAccount(A));
  const b = await connect(B, await prepareDemoAccount(B));

  console.log(
    `\nWatch the ${scenario.a.name} on /${A.username} or the ${scenario.b.name} on /${B.username}`,
  );
  console.log(`Starting in ${START_DELAY_MS / 1000}s...`);

  await delay(START_DELAY_MS);

  const loop = process.argv.includes("--loop");
  let failed = 0;

  for (;;) {
    for (const phase of scenario.phases) {
      if (!(await runPhase(phase, a, b))) failed++;
    }

    if (!loop) break;

    console.log(`\nStarting again in ${BETWEEN_ROUNDS_MS / 1000}s...`);
    await delay(BETWEEN_ROUNDS_MS);
  }

  a.ws.close();
  b.ws.close();

  console.log(
    failed === 0 ? "\nAll alerts correct." : `\n${failed} phases were wrong.`,
  );

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nSimulator stopped: ${error.message}`);
  process.exit(1);
});
