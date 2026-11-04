// Suggesting a road: login rules, search near the car, the sender, and limits

const POLYGON = [[11, 77], [11, 77.001], [11.001, 77.001]];

const CAR = [13.0827, 80.2707];

const MATCHES = [
  { lat: "13.08", lon: "80.27", display_name: "Gandhi Road, Chennai" },
  { lat: "11.01", lon: "76.96", display_name: "Gandhi Road, Coimbatore" },
  { lat: "28.61", lon: "77.2", display_name: "Gandhi Road, New Delhi, a very long address that has to be shortened to fit" },
];

module.exports = async ({ SITE, API, ADMIN_PASSWORD, check, sleep, post, createDriver, newPage, logIn }) => {
  const username = "road_suggester";
  const token = await createDriver(username);

  const url = "/api/narrow-road-suggestions";

  const noLogin = await post(url, { name: "Anonymous", polygon: POLYGON, reason: "" });
  check("a suggestion without a login is refused", noLogin.status === 401);

  const faked = await post(url, { name: "Faked", polygon: POLYGON, reason: "", submittedBy: "someone_else" }, token);
  check("nobody can send under another name", faked.body.suggestion?.submittedBy === username);

  const driverRead = await fetch(API + url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check("a driver can't read the suggestion list", driverRead.status === 403);

  // This account's phone, parked at a known position
  const deviceId = "suggester-phone";
  await post("/api/auth/device", { deviceId }, token);

  const { WebSocket: Socket } = require("../../backend/node_modules/ws");
  const phone = new Socket(`${API.replace("http", "ws")}/vehicle`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await new Promise((resolve, reject) => {
    phone.on("open", resolve);
    phone.on("error", reject);
  });

  phone.send(JSON.stringify({ type: "register", deviceId }));
  await sleep(300);

  const sendPosition = () =>
    phone.send(
      JSON.stringify({
        lat: CAR[0],
        lon: CAR[1],
        heading: 0,
        accelX: 0,
        accelY: 0,
        accelZ: 0,
        gyroX: 0,
        gyroY: 0,
        gyroZ: 0,
        speed: 0,
        accuracy: 5,
      })
    );

  sendPosition();
  const heartbeat = setInterval(sendPosition, 1000);

  try {
    const page = await newPage();
    const searches = [];
    let reply = MATCHES;

    await page.setRequestInterception(true);

    page.on("request", (request) => {
      if (request.url().includes("nominatim.openstreetmap.org")) {
        searches.push(new URL(request.url()));

        request.respond({
          status: 200,
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(reply),
        });
      } else {
        request.continue();
      }
    });

    await logIn(page, username, token);

    await page.goto(`${SITE}/${username}/suggest-narrow-road`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".suggest-road-map");
    await sleep(2500);

    const tile = () =>
      page.evaluate(() => document.querySelector(".leaflet-tile")?.src ?? "");

    const opened = await tile();
    check("the map opens at the car", /\/16\/47\d{3}\//.test(opened));

    await page.type(".suggest-header-search input", "Gandhi Road");
    await page.keyboard.press("Enter");
    await sleep(1800);

    const search = searches.at(-1);
    const area = (search.searchParams.get("viewbox") ?? "").split(",").map(Number);
    check(
      "the search prefers the car's area",
      area[0] < CAR[1] && CAR[1] < area[2] && area[3] < CAR[0] && CAR[0] < area[1]
    );
    check("the search isn't limited to that area", !search.searchParams.has("bounded"));

    const matches = () =>
      page.$$eval(".search-matches > button", (buttons) =>
        buttons.map((button) => button.innerText)
      );

    const offered = await matches();
    check(
      "other matches are offered",
      offered.length === 2 && offered[0].includes("Coimbatore")
    );

    const oneLine = await page.$eval(
      ".search-matches > button:last-child",
      (button) => button.getBoundingClientRect().height < 50
    );
    check("a long address stays on one line", oneLine);

    await page.click(".search-matches > button");
    await sleep(1800);
    check("picking one closes the list", !(await page.$(".search-matches")));
    check("picking one moves the map", (await tile()) !== opened);

    reply = [MATCHES[0]];
    await page.focus(".suggest-header-search input");
    await page.keyboard.press("Enter");
    await sleep(800);
    check("one match shows no list", !(await page.$(".search-matches")));

    reply = [];
    await page.keyboard.press("Enter");
    await sleep(800);
    check(
      "no match says so",
      (await page.$eval(".suggest-search-error", (box) => box.innerText)).includes("not found")
    );

    await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((button) => button.innerText.includes("Start marking"))
        .click()
    );

    const box = await (await page.$(".suggest-road-map")).boundingBox();

    for (const [x, y] of [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6]]) {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await sleep(150);
    }

    await page.type(".suggest-form input", "Tester Lane");
    await page.click(".suggest-submit-button");
    await sleep(1200);
    check(
      "the page sends a suggestion",
      (await page.evaluate(() => document.body.innerText)).includes("Suggestion sent")
    );
    await page.close();
  } finally {
    clearInterval(heartbeat);
    phone.close();
  }

  // ---------- As the administrator ----------
  const adminPage = await newPage();
  await adminPage.goto(`${SITE}/admin`, { waitUntil: "domcontentloaded" });
  await adminPage.waitForSelector('input[type="password"]');
  await adminPage.type('input[type="password"]', ADMIN_PASSWORD);
  await adminPage.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.innerText.trim() === "Sign in")
      .click()
  );
  await adminPage.waitForSelector(".admin-road-list");
  await sleep(1200);

  const adminText = await adminPage.evaluate(() => document.body.innerText);
  check(
    "the admin page shows who sent it",
    adminText.includes("Tester Lane") && adminText.includes(`Sent by ${username}`)
  );
  await adminPage.close();

  // ---------- The limit for one account ----------
  const flooder = await createDriver("road_flooder");
  const statuses = [];

  for (let count = 0; count < 11; count++) {
    statuses.push(
      (await post(url, { name: `Flood ${count}`, polygon: POLYGON, reason: "" }, flooder)).status
    );
  }

  check("10 suggestions an hour are allowed", statuses.slice(0, 10).every((status) => status === 201));
  check("the 11th is refused", statuses[10] === 429);

  const other = await post(url, { name: "Another Driver", polygon: POLYGON, reason: "" }, token);
  check("that doesn't block other drivers", other.status === 201);
};
