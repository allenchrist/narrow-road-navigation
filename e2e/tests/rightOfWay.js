// Two simulated cars, with both dashboards open in Chrome
module.exports = async ({ SITE, API, check, sleep, post, newPage, logIn, runSimulator }) => {
  const simulator = runSimulator();

  const waitForPhase = async (text) => {
    while (!simulator.output.includes(text)) {
      if (simulator.exitCode !== null) {
        throw new Error(`The simulator stopped early:\n${simulator.output.slice(-800)}`);
      }

      await sleep(200);
    }
  };

  await waitForPhase("Car A drives towards");

  async function openCar(username) {
    const { token } = (
      await post("/api/auth/login", { username, password: "simulator-demo-only" })
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
      () => document.querySelector(".cv-alert strong")?.innerText ?? "none"
    );

  await waitForPhase("Car B enters after Car A");
  await sleep(5500);
  check("the first car in has right of way", (await alertOf(carA)) === "You have right of way");
  check("the later car is told to give way", (await alertOf(carB)) === "Give way");

  // The top bar says when a position is getting old
  const gpsOf = (page) =>
    page.evaluate(() => document.querySelector(".cv-topbar-chips").innerText);

  await waitForPhase("phone goes silent");
  await sleep(7000);
  check("an old position shows as a weak signal", (await gpsOf(carB)).includes("Weak signal"));

  await waitForPhase("Car B stops to give way");
  await sleep(4000);
  check("the instruction stays when the later car stops", (await alertOf(carB)) === "Give way");

  await waitForPhase("Car A passes Car B");
  await sleep(9000);
  check("passing ends the first car's instruction", (await alertOf(carA)) === "Narrow road");
  check("passing ends the later car's instruction", (await alertOf(carB)) === "Narrow road");

  const code =
    simulator.exitCode ??
    (await new Promise((resolve) => simulator.on("exit", resolve)));

  check("every alert in the simulator was right", code === 0);

  const health = await (await fetch(`${API}/health`)).json();
  check("the server is still healthy", health.status === "ok");
};
