/**
 * Demos of the system: two simulated vehicles, over and over, with both car
 * screens open side by side. Each demo shows one rule; see DEMOS below.
 *
 * Runs everything on this computer: a temporary database, the server, the
 * website and the simulator. Nothing touches the real server or database.
 * Press Ctrl+C to stop, and the temporary database is deleted.
 *
 * Usage (run npm install in backend, frontend and e2e first):
 *   npm run demo:<name>, such as npm run demo:buses
 *   add -- --no-browser to print the links instead of opening Chrome
 *
 * Environment:
 *   CHROME_PATH   where Chrome is, if it isn't found by itself
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");

const DATABASE_PORT = 55450;
const API_PORT = 55451;
const SITE_PORT = 55452;

const API = `http://127.0.0.1:${API_PORT}`;
const SITE = `http://127.0.0.1:${SITE_PORT}`;

// Only for this demo, which runs on this computer
const DEMO_PASSWORD = "simulator-demo-only";
const ADMIN_PASSWORD = "demo-admin";

const CHROME_LOCATIONS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

// Each demo: its title, the simulator and scenario it runs, and what the
// two screens show. The first vehicle is on the left, the second on the right.
const NARROW = "test/simulator.js";
const MOUNTAIN = "test/mountainSimulator.js";

const DEMOS = {
  entrance: {
    title: "Narrow road: wait at the entrance",
    simulator: NARROW,
    scenario: "entrance",
    left: "Car A",
    right: "Car B",
  },
  giveway: {
    title: "Narrow road: every alert, including giving way inside",
    simulator: NARROW,
    scenario: "full",
    left: "Car A",
    right: "Car B (a bus)",
  },
  ambulance: {
    title: "Narrow road: an ambulance",
    simulator: NARROW,
    scenario: "ambulance",
    left: "Car A",
    right: "Ambulance",
  },
  mountain: {
    title: "Mountain Mode: a car and a bus",
    simulator: MOUNTAIN,
    scenario: "car-bus",
    left: "Car",
    right: "Bus",
  },
  buses: {
    title: "Mountain Mode: two buses, uphill first",
    simulator: MOUNTAIN,
    scenario: "buses",
    left: "Uphill bus",
    right: "Downhill bus",
  },
  keepleft: {
    title: "Mountain Mode: two cars keep left",
    simulator: MOUNTAIN,
    scenario: "keep-left",
    left: "Uphill car",
    right: "Downhill car",
  },
  inbend: {
    title: "Mountain Mode: a car already in the bend",
    simulator: MOUNTAIN,
    scenario: "in-bend",
    left: "Car",
    right: "Bus",
  },
  "ambulance-bend": {
    title: "Mountain Mode: an ambulance at a bend",
    simulator: MOUNTAIN,
    scenario: "ambulance",
    left: "Ambulance",
    right: "Bus",
  },
  overtake: {
    title: "Mountain Mode: don't overtake",
    simulator: MOUNTAIN,
    scenario: "no-overtake",
    left: "Car behind",
    right: "Bus ahead",
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const children = [];

function start(args, cwd, env, { show = false } = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, NODE_NO_WARNINGS: "1", ...env },
  });

  child.output = "";
  child.stdout.on("data", (data) => {
    child.output += data;
    if (show) process.stdout.write(data);
  });
  child.stderr.on("data", (data) => {
    child.output += data;
    if (show) process.stderr.write(data);
  });
  children.push(child);

  return child;
}

async function waitFor(url, child, what) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not ready yet
    }

    if (child.exitCode !== null) break;

    await sleep(500);
  }

  throw new Error(`The ${what} didn't start:\n${child.output.slice(-800)}`);
}

async function login(username) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: DEMO_PASSWORD }),
  });

  return (await response.json()).token;
}

/**
 * Opens a driver's car screen in its own Chrome window, already logged in,
 * on the left or right half of the screen.
 */
async function openCarScreen(browser, username, side) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  const session = await page.target().createCDPSession();
  const { windowId } = await session.send("Browser.getWindowForTarget");
  await session.send("Browser.setWindowBounds", {
    windowId,
    bounds: {
      left: side === "left" ? 0 : 960,
      top: 0,
      width: 960,
      height: 900,
      windowState: "normal",
    },
  });

  const token = await login(username);

  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    (sessionToken, name) =>
      localStorage.setItem(
        "driverSession",
        JSON.stringify({ token: sessionToken, username: name }),
      ),
    token,
    username,
  );
  await page.goto(`${SITE}/${username}`, { waitUntil: "domcontentloaded" });
}

async function main() {
  const openBrowser = !process.argv.includes("--no-browser");

  // The demo's name, such as "buses". --buses is kept from before.
  const name = process.argv.includes("--buses")
    ? "buses"
    : (process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
      "mountain");
  const demo = DEMOS[name];

  if (!demo) {
    console.error(`Unknown demo "${name}". Choose from:`);
    for (const [key, { title }] of Object.entries(DEMOS)) {
      console.error(`  npm run demo:${key.padEnd(15)} ${title}`);
    }
    process.exit(1);
  }
  const chrome = CHROME_LOCATIONS.find((file) => file && fs.existsSync(file));

  const { default: EmbeddedPostgres } = await import("embedded-postgres");

  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-demo-"));
  const database = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "demo-only",
    port: DATABASE_PORT,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });

  let browser;
  let stopping = false;

  async function stop(code = 0) {
    if (stopping) return;
    stopping = true;

    console.log("\nStopping the demo...");

    await browser?.close().catch(() => {});

    for (const child of children) child.kill();

    await database.stop().catch(() => {});
    fs.rmSync(databaseDir, { recursive: true, force: true, maxRetries: 5 });

    process.exit(code);
  }

  process.on("SIGINT", () => stop(0));

  try {
    console.log("Starting a temporary database...");
    await database.initialise();
    await database.start();
    await database.createDatabase("connected_vehicle");

    const serverEnv = {
      DATABASE_URL: `postgres://postgres:demo-only@localhost:${DATABASE_PORT}/connected_vehicle`,
      JWT_SECRET: "demo-only-not-a-real-secret-0123456789",
      ADMIN_PASSWORD,
      CORS_ORIGIN: SITE,
      PORT: String(API_PORT),
      ALLOW_TEST_SIGNUP: "true",
      ROAD_ENTRANCES_ONLINE: "false",
    };

    const setup = spawnSync(
      process.execPath,
      ["database/init.js", "--simulator-roads"],
      {
        cwd: BACKEND,
        env: { ...process.env, ...serverEnv },
        encoding: "utf8",
      },
    );

    if (setup.status !== 0) {
      throw new Error(
        `The database wasn't set up:\n${setup.stdout}${setup.stderr}`,
      );
    }

    console.log("Starting the server...");
    const server = start(["server.js"], BACKEND, serverEnv);
    await waitFor(`${API}/health`, server, "server");

    console.log("Building the website, which takes a moment...");
    const siteDist = path.join(os.tmpdir(), "connected-vehicle-demo-site");
    const build = spawnSync(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "build",
        "--outDir",
        siteDist,
        "--emptyOutDir",
      ],
      {
        cwd: FRONTEND,
        env: { ...process.env, VITE_BACKEND_URL: API },
        encoding: "utf8",
      },
    );

    if (build.status !== 0) {
      throw new Error(
        `The website didn't build:\n${build.stdout}${build.stderr}`,
      );
    }

    const site = start(
      [
        "node_modules/vite/bin/vite.js",
        "preview",
        "--outDir",
        siteDist,
        "--port",
        String(SITE_PORT),
        "--strictPort",
        "--host",
        "127.0.0.1",
      ],
      FRONTEND,
      { VITE_BACKEND_URL: API },
    );
    await waitFor(SITE, site, "website");

    // The simulator creates the two drivers, then drives them round and round
    const simulator = start(
      [demo.simulator, "--loop", "--scenario", demo.scenario],
      BACKEND,
      { BACKEND_URL: API },
      { show: true },
    );

    while (!simulator.output.includes("Starting in")) {
      if (simulator.exitCode !== null) {
        throw new Error(
          `The simulator stopped:\n${simulator.output.slice(-800)}`,
        );
      }

      await sleep(200);
    }

    console.log(`
────────────────────────────────────────────────────────────
  ${demo.title}
  The demo is running. Press Ctrl+C to stop.

  ${`${demo.left}:`.padEnd(15)} ${SITE}/sim_car_a
  ${`${demo.right}:`.padEnd(15)} ${SITE}/sim_car_b
  Password for both: ${DEMO_PASSWORD}

  Admin page: ${SITE}/admin   (password: ${ADMIN_PASSWORD})
────────────────────────────────────────────────────────────`);

    if (openBrowser && chrome) {
      browser = await puppeteer.launch({
        executablePath: chrome,
        headless: false,
        defaultViewport: null,
        args: ["--no-first-run", "--no-default-browser-check"],
      });

      await openCarScreen(browser, "sim_car_a", "left");
      await openCarScreen(browser, "sim_car_b", "right");

      // The first, empty window isn't needed
      const [blank] = await browser.pages();
      if (blank && blank.url() === "about:blank") await blank.close();

      browser.on("disconnected", () => stop(0));
    } else if (openBrowser) {
      console.log("\nChrome wasn't found, so open the links above yourself.");
    }

    await new Promise((resolve) => simulator.on("exit", resolve));
    await stop(simulator.exitCode ?? 0);
  } catch (error) {
    console.error(`\nThe demo couldn't start: ${error.message}`);
    await stop(1);
  }
}

main();
