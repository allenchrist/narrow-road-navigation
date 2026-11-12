// Two simulated cars, with both dashboards open in Chrome
module.exports = async ({
  SITE,
  API,
  ADMIN_PASSWORD,
  check,
  sleep,
  post,
  newPage,
  logIn,
  runSimulator,
}) => {
  const simulator = runSimulator();

  const waitForPhase = async (text) => {
    while (!simulator.output.includes(text)) {
      if (simulator.exitCode !== null) {
        throw new Error(
          `The simulator stopped early:\n${simulator.output.slice(-800)}`,
        );
      }

      await sleep(200);
    }
  };

  await waitForPhase("Car A drives towards");

  async function openCar(username) {
    const { token } = (
      await post("/api/auth/login", {
        username,
        password: "simulator-demo-only",
      })
    ).body;

    const page = await newPage();

    await logIn(page, username, token);

    await page.goto(`${SITE}/${username}`, { waitUntil: "domcontentloaded" });

    return page;
  }

  const carA = await openCar("sim_car_a");
  const carB = await openCar("sim_car_b");

  const alertOf = (page) =>
    page.evaluate(
      () => document.querySelector(".cv-alert strong")?.innerText ?? "none",
    );

  const listedIn = (page) =>
    page.$$eval(".cv-nearby li strong", (names) => names.length);

  const hasRoadList = async (page) => Boolean(await page.$(".cv-nearby"));

  // Car B is nearby by now, but hasn't entered the road
  await waitForPhase("Car B is about to enter");
  await sleep(5000);
  check("a car outside the road isn't listed", (await listedIn(carA)) === 0);
  check(
    "a car outside any narrow road has no list",
    !(await hasRoadList(carB)),
  );
  check(
    "a nearby car still shows on the map",
    (await carA.$$(".cv-marker-other")).length === 1,
  );

  await waitForPhase("Car B enters after Car A");
  await sleep(5500);
  check("a car in the same road is listed", (await listedIn(carA)) === 1);
  check(
    "your own car is a car image on the map",
    Boolean(await carA.$(".cv-marker-ego[data-vehicle='car'] img")),
  );
  check(
    "another driver shows as their own vehicle type",
    Boolean(await carA.$(".cv-marker-other[data-vehicle='bus'] img")),
  );
  check(
    "the alert names the other vehicle",
    (
      await carA.evaluate(() => document.querySelector(".cv-alert").innerText)
    ).includes("The bus should give way"),
  );
  check(
    "the first car in has right of way",
    (await alertOf(carA)) === "You have right of way",
  );
  check(
    "the later car is told to give way",
    (await alertOf(carB)) === "Give way",
  );
  check(
    "the give way card shows both vehicles on the road",
    (await carB.$$(".cv-scene-vehicle")).length === 2,
  );
  check(
    "the give way card shows the steps",
    Boolean(await carB.$(".cv-alert-steps .is-current")),
  );
  check(
    "the road you're in is outlined on the map",
    (await carB.$$(".cv-current-road")).length > 0,
  );

  // The admin page shows both cars live, with their alerts
  const { token: adminToken } = (
    await post("/api/admin/login", { password: ADMIN_PASSWORD })
  ).body;
  const admin = await newPage();
  await admin.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
  await admin.evaluate(
    (token) => sessionStorage.setItem("adminToken", token),
    adminToken,
  );
  await admin.goto(`${SITE}/admin`, { waitUntil: "domcontentloaded" });
  await admin.waitForSelector(".admin-tabs");
  await admin.evaluate(() =>
    [...document.querySelectorAll(".admin-tabs button")]
      .find((tab) => tab.innerText.startsWith("Live"))
      .click(),
  );
  await sleep(3000);
  const liveText = await admin.evaluate(
    () => document.querySelector(".admin-tab-panel").innerText,
  );
  check(
    "the admin page lists both cars live",
    (await admin.$$(".admin-live-item")).length === 2,
  );
  check(
    "it shows each car's driver and alert",
    liveText.includes("sim_car_b") && liveText.includes("Give way"),
  );
  check(
    "the cars are on the admin map",
    (await admin.$$(".cv-marker-other")).length === 2,
  );
  await admin.close();

  // The top bar says when a position is getting old
  const gpsOf = (page) =>
    page.evaluate(() => document.querySelector(".cv-topbar-chips").innerText);

  await waitForPhase("phone goes silent");
  await sleep(7000);
  check(
    "an old position shows as a weak signal",
    (await gpsOf(carB)).includes("Weak signal"),
  );

  await waitForPhase("Car B stops to give way");
  await sleep(4000);
  check(
    "the instruction stays when the later car stops",
    (await alertOf(carB)) === "Give way",
  );

  await waitForPhase("Car A passes Car B");
  await sleep(9000);
  check(
    "passing ends the first car's instruction",
    (await alertOf(carA)) === "Narrow road",
  );
  check(
    "the later car is told the road is clear",
    (await alertOf(carB)) === "Road clear",
  );

  const code =
    simulator.exitCode ??
    (await new Promise((resolve) => simulator.on("exit", resolve)));

  check("every alert in the simulator was right", code === 0);

  const health = await (await fetch(`${API}/health`)).json();
  check("the server is still healthy", health.status === "ok");
};
