# Narrow Road Navigation

A connected-vehicle system that helps drivers pass safely through narrow roads. When two cars meet head on in a road too narrow to share, each driver is told who should keep going and who should give way.

This is a college project. We can't modify a real car, so two pieces stand in for its hardware:

| Part | Stands in for | Where it lives |
|---|---|---|
| **Web dashboard** | The car's infotainment screen | This repository |
| **Android app** | The car's connectivity module | [VehicleSensorModule](https://github.com/allenchrist/VehicleSensorModule) |

> **Advice only.** GPS can be wrong, and the app can't see parked cars, people or animals. Alerts are suggestions, and drivers must still watch the road.

## How it works

```
 Phone (app)                 Server                    Car screen (website)
 GPS, sensors  --- live --->  checks road areas  --- live --->  map and alerts
                              decides who gives way
                                    |
                              Postgres database
                              (accounts, roads, suggestions)
```

1. The driver logs in on the phone and taps **Connect**. The app sends the car's position about once a second, even with the screen locked, and its compass heading as soon as it turns.
2. The server checks each position against the saved narrow roads and compares nearby cars.
3. The driver logs in to the dashboard with the same account. The map shows their car and other cars within 2 km. Inside a narrow road, the panel lists the vehicles in that road.

Inside a narrow road, the map outlines it softly, tinted to match the alert. Other road shapes aren't shown to drivers. Alerts only appear once a car is inside a narrow road.

If a car's position is more than 5 seconds old, the top bar shows **Weak signal**. After 15 seconds, the car stops counting.

## Alerts

| Alert | When it shows | Colour |
|---|---|---|
| **Narrow road** | You're inside a narrow road and no other car matters | Yellow |
| **Vehicle about to enter** | Another car is heading for this road | Orange |
| **You have right of way** | Another car in this road entered after you | Green, with an arrow |
| **Give way** | Another car in this road entered before you | Red, with a give-way sign |
| **Road clear** | The car you gave way to has passed | Green, with a tick |

The right of way, give way and road clear alerts show the narrow road from the side, with both vehicles, which of them goes, and where to wait. Giving way has three steps, **Stop**, **Let it pass** and **Continue**, and the current one is highlighted.

### Vehicle types

Each driver chooses a car, truck, lorry, bus or auto when signing up in the app, and can change it later. Older accounts count as cars. The type sets the vehicle's image on the map and how the panel and alerts name it, and it doesn't affect who gives way.

### Who gives way

The car that entered the road first keeps going, and the car that entered last gives way, whether it's moving or stopped. The server makes this decision, so the two screens can't disagree.

- The decision stays fixed if the car giving way stops or reverses.
- Once the first car has passed, the car that gave way is told the road is clear.
- It ends when a car leaves the road or stops sending updates.
- Cars clearly travelling the same way, or already driving apart, aren't a conflict.
- With three or more cars, every car has one place in the order, so they can't all be told to give way.

## What's in this repository

```
backend/    Node.js server: login, live connections, road checks, alert rules
  services/narrowRoadAlert.js   who gets which alert, and who gives way
  services/geofenceService.js   is this car inside a road?
  services/vehicleState.js      the live state of every car
  test/                         tests and the two-car simulator
  data/                         the narrow roads of Coimbatore, see below
  tools/findNarrowRoads.js      finds those roads from map data
frontend/   React website: dashboard, login, road suggestions, admin page
e2e/        browser tests of the whole system
.github/    automatic checks that run on every push
```

**Built with:** Node.js, Express, WebSockets, Socket.IO, PostgreSQL, React, Vite and Leaflet with OpenStreetMap.

## Set it up on a laptop

You need [Node.js 22](https://nodejs.org) and a PostgreSQL database. A free [Neon](https://neon.tech) database works. Copy its connection address from the Neon dashboard.

### 1. Start the server

```
cd backend
npm install
```

Signing up and resetting passwords send emails through [Brevo](https://www.brevo.com), which has a free plan. Create an account, verify a sender address under **Senders**, and create an API key under **SMTP & API**. Render's free plan blocks normal mail ports, so the server uses Brevo's web API instead.

Copy `backend/.env.example` to `backend/.env` and fill it in. See [Settings](#settings) for what each value means. Then:

```
npm run db:init
npm run dev
```

`db:init` creates the tables and imports the narrow roads. **Run it only once for each database**, because a road you later delete would be imported again. Starting the server is always safe, and it adds any tables or columns that are missing.

For the [demo without phones](#demo-without-phones), use `npm run db:init-demo` on a test database instead. It imports longer test roads the simulator can drive through.

The server is ready when it prints `Listening on port 5000`.

### 2. Start the website

The website uses the hosted server unless told otherwise. To use your laptop's server, create `frontend/.env.simulate` containing:

```
VITE_BACKEND_URL=http://localhost:5000
```

Then, in a second terminal:

```
cd frontend
npm install
npm run dev:local
```

Open <http://localhost:5173>.

## Demo without phones

The simulator drives two cars through a road and checks every alert. It needs the server from the steps above, with a test database set up by `npm run db:init-demo`, because the real narrow roads are too short to drive through at speed. It creates two accounts, `sim_car_a` and `sim_car_b`, the first time it runs. To allow that, set `ALLOW_TEST_SIGNUP=true` in `backend/.env` on a test database only.

In a third terminal:

```
cd backend
npm run simulate
```

Log in to the dashboard as `sim_car_a` with the password `simulator-demo-only`. Open a private window and log in as `sim_car_b` to see both screens. Use `npm run simulate -- --loop` to keep it running.

The simulator's password is written in its code. If your database is one other people can reach, set `SIMULATOR_PASSWORD` to something private first, or delete the two accounts afterwards.

| Step | Car A sees | Car B sees |
|---|---|---|
| Car A drives towards the road | Nothing | |
| Car A enters | Narrow road | |
| Car B is about to enter the far end | Vehicle about to enter | |
| Car B enters, coming towards Car A | You have right of way | Give way |
| Car B's phone goes silent | Narrow road | |
| Car B comes back | You have right of way | Give way |
| Car B stops to let Car A through | You have right of way | Give way |
| Car A passes Car B | Narrow road | Road clear |
| Car A leaves | Nothing | |

## Demo with phones

The app only makes encrypted connections, so phones need the server hosted online rather than running on a laptop. See the [app's README](https://github.com/allenchrist/VehicleSensorModule) to install it.

1. Create a different account in the app on each phone, and tap **Connect**.
2. Log in to the dashboard with each account, using two browsers or devices.
3. Drive or walk both phones into the same narrow road from opposite ends.

For the most reliable updates with the screen locked, turn Battery Saver off and allow the app to run without battery limits. The app offers both.

## Narrow road data

`backend/data/narrowRoads.json` holds 168 very narrow roads in Coimbatore, about 6.4 km in all. No ready-made list of narrow roads exists, and OpenStreetMap records the width of very few roads here, so the widths were measured from map data.

`tools/findNarrowRoads.js` looks along every small road in OpenStreetMap, every 2 m, for the nearest building on each side. A road counts as very narrow where the buildings on both sides are **4 m apart or less**, too close for two vehicles to pass, along at least 25 m and 70% of its length. Each shape:

- follows the middle of the gap between the buildings, which corrects the few metres OpenStreetMap's lines can be off by;
- is as wide as the gap it measured, between 2.5 and 4 m;
- joins narrow parts of the same road less than 20 m apart, so cars in one lane always share a road.

It finds lanes between buildings. A narrow lane with a wall, field or open ground on one side isn't found, as walls aren't in the building data. Drivers can suggest those from the dashboard.

To find them again, for example with newer map data, download the files listed at the top of `tools/findNarrowRoads.js` into `backend/tools/download`, then:

```
cd backend
npm run roads:find
```

Check `tools/narrowRoads.found.json`, copy it over `data/narrowRoads.json`, then replace the imported roads in the database. Roads added on the admin page are kept:

```
npm run db:replace-roads            shows what would change
npm run db:replace-roads -- --apply replaces them
```

Restart the server afterwards, as it keeps the roads in memory.

**Map data:** roads and buildings © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License. Buildings also from [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints), available under the Open Database License.

## Before a demo

Render's free plan stops the server after about 15 minutes without visitors, and the next visitor waits up to a minute while it starts. The login page starts waking it as soon as it opens. To keep it awake all the time, add a free monitor at [UptimeRobot](https://uptimerobot.com) for `https://narrow-road-navigation.onrender.com/health`, checking every 5 minutes. The free plan's 750 hours a month cover one server running all month.

Phone GPS is often 10 to 20 m out between tall buildings. For a first test, pick a lane with open sky.

## Host it online

**Server, for example on Render:** set the root folder to `backend`, the build command to `npm install` and the start command to `npm start`, then add the [settings](#settings). The address is set in the app's `ServerConfig.kt` and the website's `frontend/src/config.js`, so update both if yours is different.

**Website, for example on Vercel:** set the root folder to `frontend`. Set `VITE_BACKEND_URL` if your server's address is different, and add the website's address to `CORS_ORIGIN` on the server. `frontend/vercel.json` sends every address to `index.html`, because pages such as `/your-username` are handled by the website. Other hosts need the same rule.

## Settings

These go in `backend/.env`, or in the host's environment settings.

| Setting | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | The Postgres connection address. The connection must use verified SSL, unless the database is on the same machine |
| `JWT_SECRET` | Yes | Signs login tokens. Use a long random value and keep it private |
| `ADMIN_PASSWORD` | For the admin page | The password for `/admin`. The admin page can't be used without it |
| `BREVO_API_KEY` | For signups | Sends the emailed codes. Without it, nobody can sign up or reset a password. Existing accounts can still log in |
| `MAIL_FROM_ADDRESS` | For signups | The sender address you verified in Brevo |
| `ALLOW_TEST_SIGNUP` | No | Set to `true` only on a test server, so the simulator and tests can create accounts without an emailed code. Leave it off everywhere else |
| `CORS_ORIGIN` | If the website is hosted | Website addresses allowed to connect, separated by commas |
| `REQUIRE_VEHICLE_TOKEN` | Recommended | Set to `true` so only logged-in phones can send positions. Every phone must be on a current app first |
| `PORT` | No | Server port. Defaults to 5000 |
| `STALE_THRESHOLD_MS` | No | How long without an update before a car stops counting. Defaults to 15000. Phones without a clear view of the sky can go about 7 seconds between positions, so a much lower value makes working cars drop out |
| `VEHICLE_WS_PATH` | No | The path phones connect to. Defaults to `/vehicle` |

## Pages

| Address | What it is |
|---|---|
| `/` | Driver login, with **Forgot password?** to change a password with an emailed code. Accounts are created and deleted in the phone app |
| `/your-username` | The dashboard. The full-screen button is in the top bar, and the menu has Suggest a narrow road and Log out |
| `/your-username/suggest-narrow-road` | Mark a narrow road on the map and send it for review |
| `/admin` | Mark, edit and delete roads, and approve or reject suggestions |

## Run the tests

| Command | Run in | What it checks | Needs |
|---|---|---|---|
| `npm run test:alerts` | `backend` | Alert and right-of-way rules | Nothing else |
| `npm run test:validation` | `backend` | Input checks | Nothing else |
| `npm test` | `backend` | Phone connections and server behaviour | The server running, `ADMIN_PASSWORD` set, and `REQUIRE_VEHICLE_TOKEN` off |
| `npm run simulate` | `backend` | Every alert, using two simulated cars | The server running, and `REQUIRE_VEHICLE_TOKEN` off or on |
| `npm run lint` | `backend` or `frontend` | Common code mistakes | Nothing else |
| `npm run build` | `frontend` | That the website builds | Nothing else |
| `npm test` | `e2e` | Every page in Chrome, using a temporary database. Takes a few minutes | Chrome, and `npm install` in `backend`, `frontend` and `e2e` |

GitHub runs all of these on every push, using a temporary database. Results are in the repository's **Actions** tab.

## Limits

- **GPS accuracy:** many narrow roads are about 3 m wide, which is close to GPS error, so a car counts as inside when it's within 8 to 15 m of a road's edge. A car on a parallel road can trigger an alert.
- **Short reversing:** alerts start inside the road, so the later car may need to reverse a short way.
- **Road data:** only lanes with buildings close on both sides are found, and building outlines can be a little out, so a few roads may be missing or slightly too wide or narrow. See [Narrow road data](#narrow-road-data).
- **Split roads:** a street can be saved as several road shapes that touch. Two cars in different shapes of the same street don't count as sharing a road, unless they're close enough to the join to count as inside both.
- **Only cars using the system count:** other vehicles are invisible to it.
- **No slope data:** it can't apply the usual rule that favours the car going uphill.
- **Live state is in memory:** if the server restarts, cars reappear as their next updates arrive and right-of-way decisions start again.
- **Faked positions:** a logged-in user who fakes their GPS could see cars within 2 km of the faked position.

## Common problems

| Problem | What to check |
|---|---|
| Server exits on start | `DATABASE_URL` or `JWT_SECRET` is missing from `backend/.env` |
| First load is slow on a hosted server | Free hosts and databases can take a little while to wake up |
| "Not Found" when opening or refreshing a page online | The host must send every address to `index.html`. See [Host it online](#host-it-online) |
| Dashboard says "Log in on your phone" | The app isn't logged in with this account or can't reach the server |
| Website can't reach the server | Check `VITE_BACKEND_URL`, and that the website's address is in `CORS_ORIGIN` |
| "Email isn't set up on the server" when signing up | Set `BREVO_API_KEY` and `MAIL_FROM_ADDRESS` on the server |
| Emailed codes don't arrive | Check the spam folder, and Brevo's logs. A Gmail sender address can be filtered as spam, so a sender on your own domain is more reliable |
| Admin page won't log in | `ADMIN_PASSWORD` isn't set on the server |
| A road edited directly in the database hasn't changed | The server keeps roads in memory, so restart it. Changes made on the admin page apply straight away |
| Roads you deleted came back | `npm run db:init` was run again. Delete them again, and don't re-run it |
| A car keeps dropping out for a second or two | Check `STALE_THRESHOLD_MS` isn't set too low on the server |
| Car updates lag with the phone locked | Turn Battery Saver off, and allow the app to run without battery limits |
| Phones are refused after turning on `REQUIRE_VEHICLE_TOKEN` | Install the current app on every phone, or set it back to `false` |
