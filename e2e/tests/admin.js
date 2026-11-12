// Every action on the admin page. Named so it runs first, before other tests add roads.

const POLYGON = [
  [10.958, 76.956],
  [10.958, 76.957],
  [10.959, 76.957],
];

module.exports = async ({
  SITE,
  ADMIN_PASSWORD,
  check,
  sleep,
  post,
  createDriver,
  newPage,
}) => {
  const driver = await createDriver("admin_test_driver");

  for (const name of ["Approve Me", "Reject Me", "Leave Me"]) {
    await post(
      "/api/narrow-road-suggestions",
      { name, polygon: POLYGON, reason: `Reason for ${name}` },
      driver,
    );
  }

  const page = await newPage();

  let confirmAnswer = true;
  const confirmations = [];

  page.on("dialog", (dialog) => {
    confirmations.push(dialog.message());
    return confirmAnswer ? dialog.accept() : dialog.dismiss();
  });

  let searchReply = [
    { lat: "10.958", lon: "76.956", display_name: "Somewhere" },
  ];
  let refuseWrites = false;

  await page.setRequestInterception(true);

  page.on("request", (request) => {
    if (request.url().includes("nominatim.openstreetmap.org")) {
      request.respond({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(searchReply),
      });
    } else if (
      refuseWrites &&
      !["GET", "OPTIONS"].includes(request.method()) &&
      request.url().includes("/api/narrow-road")
    ) {
      request.respond({
        status: 400,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ message: "Refused for testing" }),
      });
    } else {
      request.continue();
    }
  });

  const text = () => page.evaluate(() => document.body.innerText);

  const counts = () =>
    page.$$eval(".admin-count", (items) =>
      items.map((item) => Number(item.innerText)),
    );

  // The tabs are Live, Suggestions and Saved roads, in that order
  const roads = async () => (await counts())[2];
  const pending = async () => (await counts())[1];

  const clickText = async (label) => {
    const clicked = await page.evaluate((target) => {
      const button = [...document.querySelectorAll("button")].find(
        (item) => item.innerText.trim() === target,
      );
      button?.click();
      return Boolean(button);
    }, label);

    if (!clicked) {
      throw new Error(`No button: ${label}`);
    }
  };

  const showTab = async (label) => {
    await page.evaluate((target) => {
      [...document.querySelectorAll(".admin-tabs button")]
        .find((tab) => tab.innerText.includes(target))
        .click();
    }, label);

    await sleep(200);
  };

  const showRoads = () => showTab("Saved roads");
  const showSuggestions = () => showTab("Suggestions");

  const clickInItem = async (itemName, label) => {
    const clicked = await page.evaluate(
      (name, target) => {
        const item = [...document.querySelectorAll(".admin-road-item")].find(
          (row) => row.querySelector("strong").innerText.trim() === name,
        );
        const button =
          item &&
          [...item.querySelectorAll("button")].find(
            (candidate) => candidate.innerText.trim() === target,
          );
        button?.click();
        return Boolean(button);
      },
      itemName,
      label,
    );

    if (!clicked) {
      throw new Error(`No ${label} on ${itemName}`);
    }

    await sleep(600);
  };

  const setInput = async (selector, value) => {
    await page.focus(selector);
    await page.$eval(selector, (input) => input.select());
    await page.keyboard.press("Backspace");

    if (value) {
      await page.type(selector, value);
    }

    await sleep(200);
  };

  const clickMap = async (x, y) => {
    const box = await (await page.$(".admin-leaflet-map")).boundingBox();
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await sleep(150);
  };

  const hasError = async (message) =>
    (
      await page.$$eval(".admin-error", (items) =>
        items.map((item) => item.innerText),
      )
    ).includes(message);

  await page.goto(`${SITE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="password"]');
  await page.type('input[type="password"]', ADMIN_PASSWORD);
  await clickText("Sign in");
  await page.waitForSelector(".admin-road-list");
  await sleep(1500);

  const startRoads = await roads();
  check(`the saved roads load (${startRoads})`, startRoads === 88);
  check("the pending suggestions load", (await pending()) === 3);

  // ---------- Filter ----------
  check(
    "suggestions show first",
    (await text()).includes("Sent by admin_test_driver"),
  );
  await showRoads();
  check(
    "the other tab shows the roads",
    Boolean(await page.$(".admin-road-filter")),
  );
  await setInput(".admin-road-filter", "zzzz");
  check(
    "a filter with no match says so",
    (await text()).includes("No roads match that name."),
  );
  await setInput(".admin-road-filter", "");

  // ---------- Search ----------
  await clickText("Search");
  await sleep(200);
  check(
    "an empty search says so",
    (await text()).includes("Enter a location to search"),
  );
  await setInput(".admin-header-search input", "Some Place");
  await page.keyboard.press("Enter");
  await sleep(1500);
  check(
    "a search with a result shows no error",
    !(await page.$(".admin-search-error")),
  );

  searchReply = [];
  await clickText("Search");
  await sleep(500);
  check("no result says so", (await text()).includes("Location not found"));

  searchReply = [{ lat: "not", lon: "numbers" }];
  await clickText("Search");
  await sleep(500);
  check(
    "a bad reply says so",
    (await text()).includes("Invalid location returned"),
  );

  searchReply = [
    { lat: "10.958", lon: "76.956", display_name: "First" },
    { lat: "10.97", lon: "76.97", display_name: "Second" },
  ];
  await clickText("Search");
  await sleep(1800);
  check(
    "other matches are offered here too",
    Boolean(await page.$(".search-matches")),
  );

  // ---------- Marking a road ----------
  await clickText("Mark narrow road");
  await sleep(200);
  check("marking closes the list", !(await page.$(".search-matches")));

  await clickMap(0.35, 0.4);
  await clickMap(0.5, 0.4);
  await clickMap(0.5, 0.55);

  // This point lands on a suggestion's shape
  await clickMap(0.545, 0.47);
  check("points are counted", (await text()).includes("Points: 4"));
  await showSuggestions();
  check(
    "marking over a suggestion doesn't select it",
    !(await text()).includes("Selected"),
  );
  await showRoads();
  await clickText("Undo");
  await sleep(200);
  check("undo removes a point", (await text()).includes("Points: 3"));

  await clickText("Save road");
  await sleep(200);
  check(
    "a road needs a name",
    await hasError("Enter a name for the narrow road"),
  );

  await clickText("Cancel");
  await sleep(200);
  check("cancel stops marking", !(await page.$(".admin-drawing-panel")));

  await clickText("Mark narrow road");
  await clickMap(0.35, 0.4);
  await clickMap(0.5, 0.4);
  await clickMap(0.5, 0.55);
  await setInput(".admin-drawing-panel input", "New Test Road");
  await clickText("Save road");
  await sleep(800);
  check("a new road is saved", (await roads()) === startRoads + 1);

  // ---------- View, edit, delete ----------
  await setInput(".admin-road-filter", "New Test");
  await clickInItem("New Test Road", "View");
  await clickInItem("New Test Road", "Edit");
  await setInput(".admin-drawing-panel input", "Renamed Road");
  await clickText("Update road");
  await sleep(800);
  await setInput(".admin-road-filter", "Renamed");
  check("a road can be renamed", (await text()).includes("Renamed Road"));

  await clickInItem("Renamed Road", "Edit");
  await setInput(".admin-drawing-panel input", "Refused Name");
  refuseWrites = true;
  await clickText("Update road");
  await sleep(600);
  check("a refused save shows why", await hasError("Refused for testing"));
  await clickText("Cancel");
  await sleep(200);

  await clickInItem("Renamed Road", "Delete");
  check("a refused delete shows why", await hasError("Refused for testing"));
  refuseWrites = false;

  confirmAnswer = false;
  await clickInItem("Renamed Road", "Delete");
  check("declining keeps the road", (await roads()) === startRoads + 1);

  confirmAnswer = true;
  await clickInItem("Renamed Road", "Delete");
  check("a road can be deleted", (await roads()) === startRoads);
  await setInput(".admin-road-filter", "");

  // ---------- Suggestions ----------
  await showSuggestions();
  await clickInItem("Leave Me", "View");
  check("a suggestion can be selected", (await text()).includes("Selected"));
  await clickText("Mark narrow road");
  await sleep(200);
  check("marking clears the selection", !(await text()).includes("Selected"));
  await clickText("Cancel");

  refuseWrites = true;
  await clickInItem("Reject Me", "Reject");
  check("a refused review shows why", await hasError("Refused for testing"));
  refuseWrites = false;

  confirmAnswer = false;
  await clickInItem("Reject Me", "Reject");
  check("declining keeps the suggestion", (await pending()) === 3);

  confirmAnswer = true;
  await clickInItem("Reject Me", "Reject");
  await sleep(600);
  check("rejecting removes the suggestion", (await pending()) === 2);
  check("rejecting adds no road", (await roads()) === startRoads);

  await clickInItem("Approve Me", "Approve");
  await sleep(800);
  check("approving removes the suggestion", (await pending()) === 1);
  check("approving adds the road", (await roads()) === startRoads + 1);

  await showRoads();
  await setInput(".admin-road-filter", "Approve Me");
  check(
    "the approved road is in the saved list",
    (await page.$$(".admin-road-item")).length === 1,
  );

  // ---------- Staying and leaving ----------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".admin-road-list");
  await sleep(1200);
  check("a refresh stays signed in", (await roads()) === startRoads + 1);

  await clickText("Sign out");
  await sleep(600);
  check(
    "signing out returns to the password",
    Boolean(await page.$('input[type="password"]')),
  );
  check("every confirmation was shown", confirmations.length === 7);
};
