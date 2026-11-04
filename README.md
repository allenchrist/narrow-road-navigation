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

1. The driver logs in on the phone. The app sends the car's position about once a second, even with the screen locked.
2. The server checks each position against the saved narrow roads and compares nearby cars.
3. The driver logs in to the dashboard with the same account and sees their car, nearby cars within 1 km, and any alert.

Road shapes are never shown to drivers. Alerts only appear once a car is inside a narrow road.

## Alerts

| Alert | When it shows | Colour |
|---|---|---|
| **Narrow road** | You're inside a narrow road and no other car matters | Caution |
| **Vehicle about to enter** | Another car is heading for this road | Warning |
| **You have right of way** | A car coming towards you entered after you | Warning |
| **Give way** | A car coming towards you entered first | Danger |
| **Vehicle in this road** | Another car is here, but its direction isn't clear, for example it's stopped | Danger |

### Who gives way

The car that entered the road first keeps going, and the later car gives way. The server makes this decision, so the two screens can't disagree.

- The decision stays fixed if the car giving way stops or reverses.
- It ends once the first car has passed, or when a car leaves the road or stops sending updates.
- Cars travelling the same way aren't a conflict, because they can follow each other.
- With three or more cars, every car has one place in the order, so they can't all be told to give way.

## What's in this repository

```
backend/    Node.js server: login, live connections, road checks, alert rules
  services/narrowRoadAlert.js   who gets which alert, and who gives way
  services/geofenceService.js   is this car inside a road?
  services/vehicleState.js      the live state of every car
  test/                         tests and the two-car simulator
  data/                         the first set of roads for a new database
frontend/   React website: dashboard, login, road suggestions, admin page
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

Copy `backend/.env.example` to `backend/.env` and fill it in. See [Settings](#settings) for what each value means. Then:

```
npm run db:init
npm run dev
```

`db:init` creates the tables and imports the first set of roads. **Run it only once for each database**, because a road you later delete would be imported again. Starting the server is always safe, and it adds any tables or columns that are missing.

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

The simulator drives two cars through a real road and checks every alert. It needs the server from the steps above, and it creates two accounts, `sim_car_a` and `sim_car_b`, the first time it runs.

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
| Car A passes Car B | Narrow road | Narrow road |
| Car A leaves | Nothing | |

## Demo with phones

The app only makes encrypted connections, so phones need the server hosted online rather than running on a laptop. See the [app's README](https://github.com/allenchrist/VehicleSensorModule) to install it.

1. Create a different account in the app on each phone.
2. Log in to the dashboard with each account, using two browsers or devices.
3. Drive or walk both phones into the same narrow road from opposite ends.

For the most reliable updates with the screen locked, turn Battery Saver off and allow the app to run without battery limits. The app offers both.

## Host it online

**Server, for example on Render:** set the root folder to `backend`, the build command to `npm install` and the start command to `npm start`, then add the [settings](#settings). The address is set in the app's `ServerConfig.kt` and the website's `frontend/src/config.js`, so update both if yours is different.

**Website:** set `VITE_BACKEND_URL` to your server's address, run `npm run build` in `frontend`, and host the `dist` folder. Send unknown addresses to `index.html`, because pages such as `/your-username` are handled by the website. Add the website's address to `CORS_ORIGIN` on the server.

## Settings

These go in `backend/.env`, or in the host's environment settings.

| Setting | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | The Postgres connection address. The connection must use verified SSL, unless the database is on the same machine |
| `JWT_SECRET` | Yes | Signs login tokens. Use a long random value and keep it private |
| `ADMIN_PASSWORD` | For the admin page | The password for `/admin`. The admin page can't be used without it |
| `CORS_ORIGIN` | If the website is hosted | Website addresses allowed to connect, separated by commas |
| `REQUIRE_VEHICLE_TOKEN` | Recommended | Set to `true` so only logged-in phones can send positions. Every phone must be on a current app first |
| `PORT` | No | Server port. Defaults to 5000 |
| `STALE_THRESHOLD_MS` | No | How long without an update before a car stops counting. Defaults to 5000 |
| `VEHICLE_WS_PATH` | No | The path phones connect to. Defaults to `/vehicle` |

## Pages

| Address | What it is |
|---|---|
| `/` | Driver login. Accounts are created in the phone app |
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
| `npm run lint` | `frontend` | Common code mistakes | Nothing else |
| `npm run build` | `frontend` | That the website builds | Nothing else |

GitHub runs all of these on every push, using a temporary database. Results are in the repository's **Actions** tab.

## Limits

- **GPS accuracy:** many narrow roads are about 3 m wide, which is close to GPS error, so a car counts as inside when it's within 8 to 15 m of a road's edge. A car on a parallel road can trigger an alert.
- **Short reversing:** alerts start inside the road, so the later car may need to reverse a short way.
- **Only cars using the system count:** other vehicles are invisible to it.
- **No slope data:** it can't apply the usual rule that favours the car going uphill.
- **Live state is in memory:** if the server restarts, cars reappear as their next updates arrive and right-of-way decisions start again.
- **Faked positions:** a logged-in user who fakes their GPS could see cars within 1 km of the faked position.

## Common problems

| Problem | What to check |
|---|---|
| Server exits on start | `DATABASE_URL` or `JWT_SECRET` is missing from `backend/.env` |
| First load is slow on a hosted server | Free hosts and databases can take a little while to wake up |
| Dashboard says "Log in on your phone" | The app isn't logged in with this account or can't reach the server |
| Website can't reach the server | Check `VITE_BACKEND_URL`, and that the website's address is in `CORS_ORIGIN` |
| Admin page won't log in | `ADMIN_PASSWORD` isn't set on the server |
| Roads you deleted came back | `npm run db:init` was run again. Delete them again, and don't re-run it |
| Car updates lag with the phone locked | Turn Battery Saver off, and allow the app to run without battery limits |
| Phones are refused after turning on `REQUIRE_VEHICLE_TOKEN` | Install the current app on every phone, or set it back to `false` |
