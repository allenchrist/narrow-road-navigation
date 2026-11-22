// Mountain Mode: a simulated car and bus meet at a hairpin on the Yercaud
// ghat road, with both dashboards open in Chrome
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
  const simulator = runSimulator("test/mountainSimulator.js");

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

  async function openDriver(username) {
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

  await waitForPhase("Starting in");

  const car = await openDriver("sim_car_a");
  const bus = await openDriver("sim_car_b");

  const alertOf = (page) =>
    page.evaluate(
      () => document.querySelector(".cv-alert strong")?.innerText ?? "none",
    );
  const alertText = (page) =>
    page.evaluate(() => document.querySelector(".cv-alert")?.innerText ?? "");

  // Heading for the same hairpin
  await waitForPhase("The car stops at the waiting point");
  await sleep(2500);
  check(
    "the car is told to stop before the bend",
    (await alertOf(car)) === "Stop before the bend",
  );
  check(
    "it says a bus is coming from the opposite direction",
    (await alertText(car)).includes(
      "bus is coming from the opposite direction",
    ),
  );
  check(
    "the bus is told to take the bend",
    (await alertOf(bus)) === "Take the bend",
  );
  check(
    "the bus is told the car is waiting",
    (await alertText(bus)).includes("car is waiting for you on the other side"),
  );

  const mountainText = await car.evaluate(
    () =>
      document.querySelector("[data-testid='mountain-mode']")?.innerText ?? "",
  );
  check(
    "Mountain Mode shows the ghat road and the next hairpin",
    mountainText.includes("Yercaud ghat road") &&
      /Hairpin \d+ of \d+/.test(mountainText),
  );
  check(
    "it says which way you're going",
    mountainText.toLowerCase().includes("uphill"),
  );

  // Waiting while the bus turns
  await waitForPhase("The bus takes the bend while the car waits");
  await sleep(4000);
  check(
    "the car's map shows where to wait",
    Boolean(await car.$(".cv-wait-point")),
  );
  check("the car's map shows the bend", Boolean(await car.$(".cv-bend-zone")));
  check(
    "the car keeps waiting while the bus turns",
    (await alertOf(car)) === "Stop before the bend",
  );

  // The bus has gone
  await waitForPhase("The car takes the bend");
  await sleep(1000);
  check(
    "once the bus is out, the car is told the bend is clear",
    (await alertOf(car)) === "Bend clear",
  );

  // The admin page lists the ghat roads and shows the hairpins
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
      .find((tab) => tab.innerText.startsWith("Ghat roads"))
      .click(),
  );
  await sleep(1500);
  const ghatText = await admin.evaluate(
    () => document.querySelector(".admin-tab-panel").innerText,
  );
  check(
    "the admin page lists the three ghat roads",
    ["Valparai", "Ooty", "Yercaud"].every((name) => ghatText.includes(name)),
  );
  await admin.evaluate(() =>
    [...document.querySelectorAll(".admin-hill-item button")].at(-1).click(),
  );
  await sleep(1500);
  check(
    "viewing one shows its numbered hairpins",
    (await admin.$$(".admin-bend-number")).length > 0,
  );

  // Adding a hairpin: the mode turns on, says what to do, and Esc ends it
  await admin.click(".admin-add-bend");
  await sleep(300);
  check(
    "Add a hairpin says to click on the road",
    (
      await admin.evaluate(
        () => document.querySelector(".admin-adding-help")?.innerText ?? "",
      )
    ).includes("Click on the road where the hairpin is"),
  );
  await admin.keyboard.press("Escape");
  await sleep(300);
  check(
    "Esc stops adding",
    !(await admin.$(".admin-adding-help")) &&
      (await admin.$eval(".admin-add-bend", (b) => b.innerText)).includes(
        "Add a hairpin",
      ),
  );
  await admin.close();

  // Correcting the bends, on the Valparai road so the simulator isn't affected
  const hillApi = async (method, path, body, token = adminToken) => {
    const response = await fetch(`${API}/api/hill-roads${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    });

    return { status: response.status, body: await response.json() };
  };

  check(
    "only the admin can see the ghat roads",
    (await hillApi("GET", "", null, null)).status === 401,
  );

  const valparai = (await hillApi("GET", "")).body.roads.find(
    (road) => road.id === "HILL_VALPARAI",
  );
  const [first, second] = valparai.bends;

  // A few points further down the road than it is now. The road runs from
  // the bottom of the ghat to the top.
  const gap = (point) =>
    Math.hypot(point[0] - first.waitBelow[0], point[1] - first.waitBelow[1]);
  const nearest = valparai.line.reduce(
    (best, point, i) => (gap(point) < gap(valparai.line[best]) ? i : best),
    0,
  );
  const lower = valparai.line[Math.max(0, nearest - 5)];
  const moved = await hillApi("PUT", `/HILL_VALPARAI/bends/1/wait`, {
    side: "below",
    point: lower,
  });
  check(
    "a waiting point can be moved along the road",
    moved.status === 200 &&
      moved.body.road.bends[0].waitBelowM < first.waitBelowM,
  );
  check(
    "it can't be moved past the bend",
    (
      await hillApi("PUT", `/HILL_VALPARAI/bends/1/wait`, {
        side: "below",
        point: second.apex,
      })
    ).status === 400,
  );

  const deleted = await hillApi("DELETE", "/HILL_VALPARAI/bends/1");
  check(
    "a wrong bend can be deleted, and the rest are numbered again",
    deleted.status === 200 &&
      deleted.body.road.bends.length === valparai.bends.length - 1 &&
      deleted.body.road.bends[0].number === 1 &&
      deleted.body.road.bends[0].startM === second.startM,
  );

  // Adding it back where it was, as if the map data had missed it
  const readded = await hillApi("POST", "/bends", { point: first.apex });
  check(
    "a missing hairpin can be added, in its place, marked as added",
    readded.status === 201 &&
      readded.body.bend.number === 1 &&
      readded.body.bend.addedByAdmin === true &&
      readded.body.road.bends.length === valparai.bends.length &&
      readded.body.road.bends[1].startM === second.startM,
  );
  check(
    "a hairpin can't be added where there already is one",
    (await hillApi("POST", "/bends", { point: second.apex })).status === 400,
  );
  check(
    "a hairpin can't be added away from a ghat road",
    (await hillApi("POST", "/bends", { point: [11.0, 76.95] })).status === 400,
  );
  check(
    "only the admin can add a hairpin",
    (await hillApi("POST", "/bends", { point: first.apex }, null)).status ===
      401,
  );

  const code =
    simulator.exitCode ??
    (await new Promise((resolve) => simulator.on("exit", resolve)));
  check("every alert in the simulator was right", code === 0);
};
