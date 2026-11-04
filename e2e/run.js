/**
 * Browser tests of the whole system: the real server and website, Chrome, and
 * a temporary Postgres that is deleted afterwards. The database address is
 * always set here, so backend/.env's database is never used.
 *
 * Usage (run npm install in backend, frontend and e2e first):
 *   npm test
 *   npm test -- admin      only the tests whose file name contains "admin"
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

const DATABASE_PORT = 55440;
const API_PORT = 55441;
const SITE_PORT = 55442;

const API = `http://127.0.0.1:${API_PORT}`;
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const ADMIN_PASSWORD = "e2e-admin-password";

const CHROME_LOCATIONS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const children = [];

function start(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, NODE_NO_WARNINGS: "1", ...env },
  });

  child.output = "";
  child.stdout.on("data", (data) => (child.output += data));
  child.stderr.on("data", (data) => (child.output += data));
  children.push(child);

  return child;
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      // Not ready yet
    }

    await sleep(500);
  }

  throw new Error(`${url} didn't start:\n${child.output.slice(-1500)}`);
}

async function post(urlPath, body, token) {
  const response = await fetch(API + urlPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

// A new driver account, returning its login token
async function createDriver(username) {
  const password = `${username}-password`;

  const created = await post("/api/auth/register", {
    username,
    email: `${username}@example.com`,
    password,
  });

  if (created.status !== 201) {
    throw new Error(`Couldn't create ${username}: ${created.status}`);
  }

  return (await post("/api/auth/login", { username, password })).body.token;
}

async function main() {
  const filter = process.argv[2] ?? "";

  const chrome = CHROME_LOCATIONS.find((file) => file && fs.existsSync(file));

  if (!chrome) {
    throw new Error("Chrome wasn't found. Set CHROME_PATH.");
  }

  const { default: EmbeddedPostgres } = await import("embedded-postgres");

  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-"));

  const database = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "e2e-only",
    port: DATABASE_PORT,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });

  let browser;
  let failed = 0;

  try {
    await database.initialise();
    await database.start();
    await database.createDatabase("connected_vehicle");

    const serverEnv = {
      DATABASE_URL: `postgres://postgres:e2e-only@localhost:${DATABASE_PORT}/connected_vehicle`,
      JWT_SECRET: "e2e-only-not-a-real-secret-0123456789",
      ADMIN_PASSWORD,
      CORS_ORIGIN: SITE,
      PORT: String(API_PORT),
      REQUIRE_VEHICLE_TOKEN: "true",
      STALE_THRESHOLD_MS: "15000",
    };

    const setup = spawnSync(process.execPath, ["database/init.js"], {
      cwd: BACKEND,
      env: { ...process.env, ...serverEnv },
      encoding: "utf8",
    });

    if (setup.status !== 0) {
      throw new Error(`db:init failed:\n${setup.stdout}${setup.stderr}`);
    }

    const server = start(["server.js"], BACKEND, serverEnv);
    await waitFor(`${API}/health`, server);

    const site = start(
      ["node_modules/vite/bin/vite.js", "--port", String(SITE_PORT), "--strictPort", "--host", "127.0.0.1"],
      FRONTEND,
      { VITE_BACKEND_URL: API }
    );
    await waitFor(SITE, site);

    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: "new",
      // GitHub's machines can't use Chrome's sandbox
      args: process.env.CI ? ["--no-sandbox"] : [],
    });

    const problems = [];

    const check = (label, passed) => {
      console.log(`  ${passed ? "✓" : "✗"} ${label}`);

      if (!passed) {
        failed++;
      }
    };

    async function newPage({ width = 1280, height = 800, before } = {}) {
      const page = await browser.newPage();

      await page.setViewport({ width, height });

      page.on("pageerror", (error) => problems.push(error.message));

      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !/ERR_|Failed to load resource|Refused for testing/.test(message.text())
        ) {
          problems.push(message.text().slice(0, 200));
        }
      });

      if (before) {
        await page.evaluateOnNewDocument(before);
      }

      return page;
    }

    async function logIn(page, username, token) {
      await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });

      await page.evaluate(
        (sessionToken, name) =>
          localStorage.setItem(
            "driverSession",
            JSON.stringify({ token: sessionToken, username: name })
          ),
        token,
        username
      );
    }

    // A page already logged in as this driver, showing their dashboard
    async function openDashboard(username, token, options) {
      const page = await newPage(options);

      await logIn(page, username, token);

      await page.goto(`${SITE}/${username}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".cv-topbar");
      await sleep(800);

      return page;
    }

    function runSimulator() {
      return start(["test/simulator.js"], BACKEND, { BACKEND_URL: API });
    }

    const context = {
      SITE,
      API,
      ADMIN_PASSWORD,
      sleep,
      post,
      check,
      createDriver,
      newPage,
      logIn,
      openDashboard,
      runSimulator,
    };

    const testsDir = path.join(__dirname, "tests");

    const tests = fs
      .readdirSync(testsDir)
      .filter((file) => file.endsWith(".js") && file.includes(filter))
      .sort();

    for (const file of tests) {
      console.log(`\n${file}`);

      try {
        await require(path.join(testsDir, file))(context);
      } catch (error) {
        failed++;
        console.error(`  ✗ stopped early: ${error.message}`);
      }

      for (const page of await browser.pages()) {
        await page.close().catch(() => {});
      }
    }

    console.log("");
    check(`no errors in the browser ${JSON.stringify(problems)}`, problems.length === 0);
  } finally {
    await browser?.close().catch(() => {});

    for (const child of children) {
      child.kill();
    }

    await database.stop().catch(() => {});
    await sleep(500);
    fs.rmSync(databaseDir, { recursive: true, force: true, maxRetries: 5 });
  }

  console.log(failed === 0 ? "\nAll passed" : `\n${failed} failed`);

  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
