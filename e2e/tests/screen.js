// The full-screen button, and keeping the screen awake

const FULL = 'button[aria-label="Full screen"]';
const EXIT = 'button[aria-label="Exit full screen"]';

// Replaces the browser's wake lock, to count requests and simulate refusals
function fakeWakeLock() {
  window.__locks = { requests: 0, held: 0, refuse: false };

  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: {
      request: async () => {
        window.__locks.requests++;

        if (window.__locks.refuse) {
          throw new DOMException("refused", "NotAllowedError");
        }

        window.__locks.held++;

        const listeners = [];

        const sentinel = {
          released: false,
          addEventListener: (_name, listener) => listeners.push(listener),
          release: async () => {
            if (!sentinel.released) {
              sentinel.released = true;
              window.__locks.held--;
              listeners.forEach((listener) => listener());
            }
          },
        };

        window.__locks.last = sentinel;

        return sentinel;
      },
    },
  });
}

module.exports = async ({ check, sleep, createDriver, openDashboard }) => {
  const username = "screen_driver";
  const token = await createDriver(username);

  const leaveDashboard = (page) =>
    page.evaluate(async () => {
      document.querySelector('button[aria-label="Open menu"]').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      [...document.querySelectorAll(".cv-menu-list button")]
        .find((button) => button.innerText.includes("Suggest"))
        .click();
    });

  // ---------- Full screen ----------
  let page = await openDashboard(username, token);
  const isFull = () => page.evaluate(() => Boolean(document.fullscreenElement));

  await page.bringToFront();
  await page.click(FULL);
  await sleep(500);
  check("the button goes full screen", await isFull());
  check("the button changes to exit", Boolean(await page.$(EXIT)));

  const size = await page.evaluate(() => {
    const map = document.querySelector(".leaflet-container").getBoundingClientRect();
    return map.width === innerWidth && map.height === innerHeight;
  });
  check("the map fills the screen", size);

  await page.click(EXIT);
  await sleep(500);
  check("the button leaves full screen", !(await isFull()));

  await page.click(FULL);
  await sleep(400);
  await page.evaluate(() => document.exitFullscreen());
  await sleep(400);
  check("leaving another way updates the button", Boolean(await page.$(FULL)));

  await page.click(FULL);
  await sleep(400);
  await leaveDashboard(page);
  await sleep(800);
  check("leaving the dashboard leaves full screen", !(await isFull()));
  await page.close();

  page = await openDashboard(username, token, {
    before: () =>
      Object.defineProperty(Document.prototype, "fullscreenEnabled", {
        get: () => false,
      }),
  });
  check("no button where full screen isn't allowed", !(await page.$(FULL)));
  await page.close();

  // ---------- Keeping the screen awake ----------
  page = await openDashboard(username, token, { before: fakeWakeLock });

  const locks = () =>
    page.evaluate(() => ({
      requests: window.__locks.requests,
      held: window.__locks.held,
    }));

  const setVisibility = async (value) => {
    await page.evaluate((visibility) => {
      Object.defineProperty(document, "visibilityState", {
        value: visibility,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, value);

    await sleep(100);
  };

  let state = await locks();
  check("the screen is kept awake on opening", state.held === 1);

  // The development server starts components twice, so counting starts here
  const base = state.requests;

  await page.evaluate(() => window.__locks.last.release());
  await setVisibility("hidden");
  state = await locks();
  check("nothing is requested while hidden", state.held === 0 && state.requests === base);

  await setVisibility("visible");
  state = await locks();
  check("it's kept awake again on return", state.held === 1 && state.requests === base + 1);

  await setVisibility("visible");
  state = await locks();
  check("no second lock if one is held", state.held === 1 && state.requests === base + 1);

  await page.evaluate(() => {
    window.__locks.refuse = true;
    window.__locks.last.release();
  });
  await setVisibility("visible");
  state = await locks();
  check("a refusal does no harm", state.held === 0 && state.requests === base + 2);

  await page.evaluate(() => {
    window.__locks.refuse = false;
  });
  await setVisibility("visible");
  state = await locks();
  check("it's asked for again after a refusal", state.held === 1);

  await leaveDashboard(page);
  await sleep(800);
  state = await locks();
  check("leaving the dashboard lets the screen sleep", state.held === 0);
  await page.close();

  page = await openDashboard(username, token, {
    before: () => {
      delete Navigator.prototype.wakeLock;
    },
  });
  check("a browser without it still opens the dashboard", Boolean(await page.$(".cv-topbar")));
  await page.close();

  // ---------- Small screens ----------
  page = await openDashboard(username, token, { width: 390, height: 844 });
  const fits = await page.evaluate(() => {
    const bar = document.querySelector(".cv-topbar").getBoundingClientRect();
    return [...document.querySelectorAll(".cv-topbar button")].every((button) => {
      const box = button.getBoundingClientRect();
      return box.left >= bar.left && box.right <= bar.right;
    });
  });
  check("the top bar fits a phone-sized screen", fits);
};
