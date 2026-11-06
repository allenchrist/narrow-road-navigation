// Choosing a vehicle type, and seeing it on the dashboard
const WebSocket = require("../../backend/node_modules/ws");

module.exports = async ({ API, check, sleep, post, createDriver, openDashboard }) => {
  const put = async (urlPath, body, token) => {
    const response = await fetch(API + urlPath, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });

    return { status: response.status, body: await response.json() };
  };

  const profile = async (token) =>
    (
      await (
        await fetch(`${API}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json()
    ).user;

  // ---------- Accounts ----------
  const refused = await post("/api/auth/register", {
    username: "plane_driver",
    email: "plane_driver@example.com",
    password: "plane-driver-password",
    vehicleType: "plane",
  });
  check("an unknown vehicle type is refused at signup", refused.status === 400);

  const truckToken = await createDriver("truck_driver", "truck");
  const defaultToken = await createDriver("no_choice_driver");

  check("the chosen type is saved", (await profile(truckToken)).vehicleType === "truck");
  check("no choice means a car", (await profile(defaultToken)).vehicleType === "car");

  const login = await post("/api/auth/login", { username: "truck_driver", password: "truck_driver-password" });
  check("logging in gives the type", login.body.user.vehicleType === "truck");

  check("changing needs a login", (await put("/api/auth/vehicle-type", { vehicleType: "bus" })).status === 401);
  check("changing to an unknown type is refused", (await put("/api/auth/vehicle-type", { vehicleType: "plane" }, defaultToken)).status === 400);
  check("the type can be changed", (await put("/api/auth/vehicle-type", { vehicleType: "auto" }, defaultToken)).status === 200);
  check("the change is saved", (await profile(defaultToken)).vehicleType === "auto");

  // ---------- Two phones in the same narrow road ----------
  const { roads } = await (
    await fetch(`${API}/api/narrow-roads`, {
      headers: { Authorization: `Bearer ${truckToken}` },
    })
  ).json();

  // The two ends of a road, so the phones meet head on. Phones parked at the
  // same end would be going the same way, and nobody would give way.
  const outline = roads[10].polygon;
  const [startEnd, farEnd] = outline
    .flatMap((a) => outline.map((b) => [a, b]))
    .reduce((best, pair) =>
      Math.hypot(pair[0][0] - pair[1][0], pair[0][1] - pair[1][1]) >
      Math.hypot(best[0][0] - best[1][0], best[0][1] - best[1][1])
        ? pair
        : best
    );

  async function connectPhone(token, deviceId, [lat, lon]) {
    await post("/api/auth/device", { deviceId }, token);

    const phone = new WebSocket(`${API.replace("http", "ws")}/vehicle`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await new Promise((resolve, reject) => {
      phone.on("open", resolve);
      phone.on("error", reject);
    });

    phone.send(JSON.stringify({ type: "register", deviceId }));
    await sleep(300);

    const send = () =>
      phone.send(
        JSON.stringify({
          lat,
          lon,
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

    send();

    return { phone, timer: setInterval(send, 1000) };
  }

  const first = await connectPhone(truckToken, "truck-driver-phone", startEnd);
  await sleep(1200);
  const second = await connectPhone(defaultToken, "auto-driver-phone", farEnd);

  try {
    const truckScreen = await openDashboard("truck_driver", truckToken);
    await sleep(2500);

    check("your own vehicle shows as your type", Boolean(await truckScreen.$(".cv-marker-ego[data-vehicle='truck'] img")));
    check("another driver shows as their type", Boolean(await truckScreen.$(".cv-marker-other[data-vehicle='auto'] img")));

    const listed = await truckScreen.$eval(".cv-nearby li strong", (name) => name.innerText);
    check(`the list names the type (${listed})`, listed.startsWith("Auto "));

    const note = await truckScreen.$eval(".cv-alert small", (line) => line.innerText);
    check("the alert names the other vehicle", note.includes("The auto should give way"));

    // A change shows without reconnecting the phone
    await put("/api/auth/vehicle-type", { vehicleType: "bus" }, defaultToken);
    await sleep(2500);
    check("a change shows on other screens straight away", Boolean(await truckScreen.$(".cv-marker-other[data-vehicle='bus'] img")));

    const autoScreen = await openDashboard("no_choice_driver", defaultToken);
    await sleep(2500);
    const giveWay = await autoScreen.$eval(".cv-alert strong", (title) => title.innerText);
    check("a truck that entered first keeps right of way", giveWay === "Give way");
  } finally {
    for (const { phone, timer } of [first, second]) {
      clearInterval(timer);
      phone.close();
    }
  }
};
