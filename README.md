# Narrow Road Navigation

A connected-vehicle system that helps drivers on two kinds of dangerous road:

- **Narrow roads**, too narrow for two vehicles to pass. Drivers are told at the entrance whether to go or wait, and inside, who keeps going and who gives way.
- **Ghat roads**, with blind hairpin bends. In **Mountain Mode**, vehicles meeting at a bend are told to keep left, and a car is told to wait before the bend while a bus or lorry, which needs the whole road, turns.

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

**Dark or light:** the website and the app both start dark. The account menu (the person icon on the car screen, or the car icon in the app) switches to light mode, which shows the map in its normal colours. Each device remembers its choice.

Inside a narrow road, the map outlines it softly, tinted to match the alert. Other road shapes aren't shown to drivers. Alerts start at a narrow road's entrance, or on a ghat road.

If a car's position is more than 5 seconds old, the top bar shows **Weak signal**. After 15 seconds, the car stops counting.

## Alerts

**At the entrance**, before going in:

| Alert | When it shows | Colour |
|---|---|---|
| **Go ahead** | The road is clear and has been given to you, or the vehicle ahead in it is going your way | Green, with an arrow |
| **Wait at the entrance** | Someone is in the road, or about to enter from another end and goes first | Red, with a give-way sign |
| **Vehicle in the road** | You're a priority vehicle, so you aren't told to wait. Those inside are told you're coming | Orange |

**Inside a narrow road:**

| Alert | When it shows | Colour |
|---|---|---|
| **Narrow road** | You're inside a narrow road and no other car matters | Yellow |
| **Vehicle waiting** | A car at an entrance is waiting for you to pass | Yellow |
| **Vehicle about to enter** | A priority vehicle is coming in | Orange |
| **You have right of way** | Another car in this road entered after you | Green, with an arrow |
| **Give way** | Another car in this road entered before you | Red, with a give-way sign |
| **Road clear** | The car you gave way to has passed | Green, with a tick |

The right of way, give way and road clear alerts show the narrow road from the side, with both vehicles, which of them goes, and where to wait. Giving way has three steps, **Stop**, **Let it pass** and **Continue**, and the current one is highlighted.

### Vehicle types

Each driver chooses a car, truck, lorry, bus, auto or priority vehicle when signing up in the app, and can change it later. Older accounts count as cars. The type sets the vehicle's image on the map and how the panel and alerts name it.

A **priority vehicle** is any emergency vehicle, such as an ambulance, fire engine or police car. It always has right of way, even if it entered last, and the other driver is told to pull over and let it pass. Between two priority vehicles, the usual rule applies. Anyone can choose this type, so in real use it would need checking. Accounts saved as the earlier ambulance type become priority vehicles when the server starts.

### Who gives way

The car that entered the road first keeps going, and the car that entered last gives way, whether it's moving or stopped. The server makes this decision, so the two screens can't disagree.

- The decision stays fixed if the car giving way stops or reverses.
- Once the first car has passed, the car that gave way is told the road is clear.
- It ends when a car leaves the road or stops sending updates.
- Cars clearly travelling the same way, or already driving apart, aren't a conflict.
- With three or more cars, every car has one place in the order, so they can't all be told to give way.

These rules are the safety net. Most meetings are avoided before anyone goes in, by the road's occupancy.

### Road occupancy

Every narrow road is **available**, **reserved** or **occupied**, worked out from the phones' positions about once a second. Cars are stopped at the entrance rather than meeting in the middle of the road, where backing out is hardest.

| Status | Meaning |
|---|---|
| Available | Nobody is inside or waiting |
| Reserved | Nobody is inside, and one car at an entrance has been given the road |
| Occupied | One or more cars are inside |

**Entrances.** An entrance is where a real road from OpenStreetMap joins the narrow road, at its ends or where a side lane comes in. Its **approach lanes** are the last 60 m of each road leading there. A car only counts as arriving if it's on one of those, within 12 m allowing for GPS error, so a car on a parallel street, or on a road that passes close by without joining, is never counted. Where no connecting road is known, the middles of the shape's two ends are used.

**Arriving.** A moving car counts once it's within 50 m of an entrance and has got closer over its last 3 readings, heading towards it. A stopped car counts within 20 m. Once counted, it keeps counting while it slows and waits up to 55 m back, and stops counting when it drives away, leaves the approach lane or goes in. A car that has just driven out and stops nearby isn't treated as waiting to go back in.

**Who gets the road.** When the road is free, one car at its entrances is given it: a priority vehicle first, otherwise whoever arrived first, and the vehicle ID on an exact tie, so two cars are never both told to go. A priority vehicle can take the road from a car that hasn't gone in yet.

- A car told to go that stays stopped for 15 seconds, such as one parked near the entrance, or hasn't gone in after 60 seconds, loses its turn and goes to the back of the line.
- A car whose phone stops sending updates loses its turn.
- A car behind one that's clearly going the same way is told to follow it. If the one ahead is stopped, it waits.
- When the last car leaves, the road goes to the next car waiting, who is told to go.

**The queue.** Every car waiting for a road has a place in line, shown on its card, such as **You're 3rd in line · 2 cars ahead of you, at the other end**, and as numbered badges on the map, with your own in blue. Cars waiting at the same end as the car given the road go through after it as a group, each told **Go ahead, follow the car ahead**, so the road doesn't switch direction for every car.

- A group is at most **3 cars**, and stops taking more after **30 seconds**. A car left out is told the other end goes next.
- After one end's group, the **other end goes next**, even if a car left out at the first end arrived earlier, so one busy end can't keep the other waiting.
- A priority vehicle goes to the front, and those behind it are told an emergency vehicle is ahead of them.
- If a car from the other end goes in anyway, the rest of the group waits.
- If the road stands empty for 15 seconds while group members don't go in, such as a car parked at the entrance, the group ends and they go to the back of the line.

The admin's live list shows each waiting car's place in line.

The dashboard shows the road ahead in green, amber or red, with a dot at your entrance. The admin's live map colours every road by its status and shows each entrance and its approach lanes.

## Mountain Mode

On the **Ooty, Valparai, Yercaud, Kallatti, Kotagiri, Kodaikanal and Anaikatti ghat roads**, the dashboard switches to Mountain Mode by itself. The panel shows the ghat road, which way you're going, and the next hairpin, such as **Hairpin 5 of 18 in 90 m**, and the map highlights that bend.

**Where a vehicle is.** Each ghat road is one line from the bottom of the ghat to the top, measured in metres. Each position is placed on it, within 15 m allowing for GPS error. On a hairpin, two arms of the road can be 20 to 30 m apart, so a vehicle stays on the arm it was on unless it clearly moves. Its direction, up or down, comes from its last 3 readings along the road, which follows the road round bends where a compass would spin. Its speed is averaged over the last 3 seconds.

**Meeting at a bend.** Each vehicle's time to reach the next bend is its distance along the road divided by its speed. Two vehicles from opposite directions are warned when both would reach the same bend within 20 seconds and be in its turning zone at the same time, allowing 3 seconds either way. A vehicle stopped or crawling within 50 m of a bend counts as being at it.

| Who meets | What each is told |
|---|---|
| Car and car | Both: **Vehicle round the bend**, keep left. Nobody stops |
| Bus, lorry or truck, and a car | Car: **Stop before the bend**, with a waiting point 30 m before the bend on the map. The bus: **Take the bend** |
| Two buses, lorries or trucks | The one going **uphill** goes first, as the hill road rule says |
| A car already in the bend | It finishes the bend, and the bus waits |
| A priority vehicle | It goes first |
| A car behind a bus near a bend | **Don't overtake** |

The vehicle that waited is told **Bend clear** once the other has come out of the bend on its side. Each decision stays fixed until then, so a driver who stops isn't told something different.

| Alert | Colour |
|---|---|
| **Stop before the bend** | Red |
| **Take the bend** | Green |
| **Bend clear** | Green |
| **Vehicle round the bend** | Yellow |
| **Don't overtake** | Yellow |

On the admin page, **Ghat roads** lists the roads. The map shows each road in purple, its hairpins numbered from the bottom, and the waiting points. Drag a waiting point to move it along the road, or click a hairpin's number to delete a bend the map got wrong. The bends above it are numbered one lower.

To **add a hairpin** the map data missed, click **Add a hairpin**, then click on the road at the middle of the bend. The click must be within 30 m of a ghat road. The server finds the turning zone itself: the stretch through that point, within 60 m either way, where the road turns most sharply, at least 40 m long, or 40 m around the point if the road is nearly straight there. It adds waiting points 30 m before it on each side and numbers the bends again from the bottom, so the ones above move up a number. A hairpin can't be added inside or overlapping another. Its popup says **Added by the admin**, it can be deleted like any other, and it's kept when the ghat-road tool is run again. Press **Done** or Esc to stop adding.

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
| Car A reaches the entrance of the empty road | Go ahead | |
| Car A enters | Narrow road | |
| Car B reaches the far entrance | Vehicle waiting | Wait at the entrance |
| Car B waits there | Vehicle waiting | Wait at the entrance |
| Car B enters, coming towards Car A | You have right of way | Give way |
| Car B's phone goes silent | Narrow road | |
| Car B comes back | You have right of way | Give way |
| Car B stops to let Car A through | You have right of way | Give way |
| Car A passes Car B | Narrow road | Road clear |
| Car A leaves | Nothing | |

**To watch a demo with one command**, without setting anything up, run one of these in `e2e` after `npm install` in `backend`, `frontend` and `e2e`. Each starts a temporary database, the server and the website on this computer, and opens Chrome with the two vehicles' car screens side by side, already logged in, repeating until you press Ctrl+C or close Chrome. The temporary database is then deleted, and nothing touches the real server or database. Add `-- --no-browser` to only print the links and the password.

| Command | What it shows |
|---|---|
| `npm run demo:entrance` | Narrow road: Car B waits at the entrance while Car A is inside, then is told to go |
| `npm run demo:giveway` | Narrow road: every alert, including a car that goes in anyway and has to give way |
| `npm run demo:ambulance` | Narrow road: an ambulance goes in, and the car inside pulls over |
| `npm run demo:queue` | Narrow road: three cars queue. The two at one end go through together, then it's the other end's turn. Opens three screens |
| `npm run demo:mountain` | Mountain Mode: a car waits before the bend while a bus turns |
| `npm run demo:buses` | Mountain Mode: of two buses, the uphill one goes first |
| `npm run demo:keepleft` | Mountain Mode: two cars both keep left, and nobody stops |
| `npm run demo:inbend` | Mountain Mode: a car already in the bend finishes it, and the bus waits |
| `npm run demo:ambulance-bend` | Mountain Mode: an ambulance goes before a bus |
| `npm run demo:overtake` | Mountain Mode: a car behind a bus at a bend is told not to overtake |

**Mountain Mode** has its own simulator. It drives `sim_car_a` up the Yercaud ghat road as a car and `sim_car_b` down it as a bus, to the same hairpin. It works with either database, as the ghat roads are added when the server starts:

```
npm run simulate:mountain
```

| Step | The car sees | The bus sees |
|---|---|---|
| Both head for the same hairpin | Stop before the bend | Take the bend |
| The car stops at the waiting point | Stop before the bend | Take the bend |
| The bus takes the bend | Stop before the bend | Take the bend |
| The bus is out of the bend | Bend clear | |
| The car takes the bend | Nothing | |

## Demo with phones

The app only makes encrypted connections, so phones need the server hosted online rather than running on a laptop. To install it, download [connected-vehicle.apk](https://github.com/allenchrist/VehicleSensorModule/releases/latest/download/connected-vehicle.apk) on the phone, also linked from the login page as **Get the Android app**. The [app's README](https://github.com/allenchrist/VehicleSensorModule) explains how to publish a new version.

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

**Entrances.** Each road in the file also lists its entrances and approach lanes, worked out from OpenStreetMap's road network. After changing the roads, work them out again:

```
npm run roads:entrances
```

It downloads the roads around every narrow road in one request, and tries again for a few minutes if OpenStreetMap is busy. When the server starts, any road without entrances gets them from this file if its shape matches, so the imported roads never need OpenStreetMap. Roads added or changed on the admin page are looked up on OpenStreetMap in the background, one at a time. Until then, and if OpenStreetMap can't be reached, the ends of the shape are used, and it tries again every 30 minutes.

### Ghat roads

`backend/data/hillRoads.json` holds seven ghat roads and their hairpins. `tools/findHillRoads.js` follows the main road from the bottom of each ghat to the top in OpenStreetMap, measures it, and finds the hairpins from its shape: where the road turns at least 165° within 120 m. A sharp turn at a junction, or one more than 5 km from any other, is a turn in a town and is left out. Each bend's turning zone is at least 40 m long, and its waiting points are 30 m before it on each side.

| Ghat road | From, to | Length | Hairpins found | Signposted |
|---|---|---|---|---|
| Valparai | Aliyar Dam to Valparai (SH78) | 41.3 km | 42 | 40 |
| Ooty | Kallar to Ooty, through Coonoor (NH181) | 42.5 km | 13 | 14 between Kallar and Coonoor |
| Yercaud | Salem to Yercaud (SH188) | 20.3 km | 18 | 20 |
| Kallatti | Masinagudi to Thalaikundha, near Ooty | 22.8 km | 18 | 36 |
| Kotagiri | Mettupalayam to Kotagiri (SH15) | 31.3 km | 7 | Not checked |
| Kodaikanal | Batlagundu to Kodaikanal | 59.9 km | 13 | Not checked |
| Anaikatti | Mannarkkad, through Attappadi, to Anaikatti | 54.1 km | 17 | Not checked |

The counts are close on most roads but not exact, because a few sharp curves look like hairpins on the map and a few gentle hairpins don't. The Kallatti road is far short, as OpenStreetMap draws it coarsely, with points about 26 m apart, so many of its tight hairpins don't show as hairpins in the data. On the admin page, wrong hairpins can be deleted and missing ones added. To find them again:

```
npm run roads:hills
npm run roads:hills -- --fresh   download every road again
```

Each road's download is kept in `tools/download/hills`, so a run that stops because OpenStreetMap is busy carries on where it left off.

The server copies roads into the database when it starts, if they aren't there yet. Roads already there are kept, so changes made on the admin page stay.

**Map data:** roads and buildings © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License. Buildings also from [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints), available under the Open Database License.

## Before a demo

Render's free plan stops the server after about 15 minutes without visitors, and the next visitor waits up to a minute while it starts. The login page starts waking it as soon as it opens. To keep it awake all the time, add a free monitor at [UptimeRobot](https://uptimerobot.com) for `https://narrow-road-navigation-ckml.onrender.com/health`, checking every 5 minutes. The free plan's 750 hours a month cover one server running all month.

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
| `ROAD_ENTRANCES_ONLINE` | No | Set to `false` to never ask OpenStreetMap for road entrances, as the tests do. Roads added on the admin page then use the ends of their shape |

## Pages

| Address | What it is |
|---|---|
| `/` | Driver login, with **Forgot password?** to change a password with an emailed code. Accounts are created and deleted in the phone app |
| `/your-username` | The dashboard. The full-screen button is in the top bar, and the menu has Suggest a narrow road and Log out |
| `/your-username/suggest-narrow-road` | Mark a narrow road on the map and send it for review |
| `/admin` | **Live** shows every connected vehicle on the map and in a list, with its driver and the alert its screen shows, refreshed every 2 seconds. The map colours each narrow road available, reserved or occupied, and shows its entrances. **Ghat roads** shows the Mountain Mode roads and their hairpins. Also mark, edit and delete roads, and approve or reject suggestions, including roads drivers recorded in the app |

## Run the tests

| Command | Run in | What it checks | Needs |
|---|---|---|---|
| `npm run test:alerts` | `backend` | Alert and right-of-way rules | Nothing else |
| `npm run test:occupancy` | `backend` | Finding entrances and approach lanes, cars arriving at them, and who is told to go or wait | Nothing else |
| `npm run test:mountain` | `backend` | Finding hairpins, placing vehicles on a ghat road, and what vehicles meeting at a bend are told | Nothing else |
| `npm run test:validation` | `backend` | Input checks | Nothing else |
| `npm run test:state` | `backend` | The live vehicle list, such as forgetting vehicles gone for over an hour | Nothing else |
| `npm run test:geofence` | `backend` | Road checks, which only look at roads near a vehicle, give the same answers as checking every road, and are faster | Nothing else |
| `npm run test:cleanup` | `backend` | Expired email codes and old rejected suggestions are deleted, and nothing else is | A test database in `DATABASE_URL`. It adds and deletes test rows |
| `npm test` | `backend` | Phone connections and server behaviour | The server running, `ADMIN_PASSWORD` set, and `REQUIRE_VEHICLE_TOKEN` off |
| `npm run simulate` | `backend` | Every alert, using two simulated cars. Add `-- --scenario` and `entrance`, `ambulance` or `queue` (three cars) for those alone | The server running, and `REQUIRE_VEHICLE_TOKEN` off or on |
| `npm run simulate:mountain` | `backend` | Mountain Mode, using two simulated vehicles at a Yercaud hairpin. Add `-- --scenario` and `buses`, `keep-left`, `in-bend`, `ambulance` or `no-overtake` for the others | The server running |
| `npm run lint` | `backend` or `frontend` | Common code mistakes | Nothing else |
| `npm run format:check` | `backend`, `frontend` or `e2e` | That the code follows the shared style. `npm run format` fixes it | Nothing else |
| `npm run build` | `frontend` | That the website builds | Nothing else |
| `npm test` | `e2e` | Every page in Chrome, using a temporary database. Takes a few minutes | Chrome, and `npm install` in `backend`, `frontend` and `e2e` |

GitHub runs all of these on every push, using a temporary database. Results are in the repository's **Actions** tab.

## Limits

- **GPS accuracy:** many narrow roads are about 3 m wide, which is close to GPS error, so a car counts as inside when it's within 8 to 15 m of a road's edge. A car on a parallel road can trigger an alert.
- **Short reversing:** a car that drives in after being told to wait, or arrives too fast to be noticed at the entrance, may need to reverse a short way.
- **Road data:** only lanes with buildings close on both sides are found, and building outlines can be a little out, so a few roads may be missing or slightly too wide or narrow. See [Narrow road data](#narrow-road-data).
- **Split roads:** a street can be saved as several road shapes that touch. Two cars in different shapes of the same street don't count as sharing a road, unless they're close enough to the join to count as inside both.
- **Only cars using the system count:** other vehicles are invisible to it.
- **Uphill rule only on ghat roads:** narrow roads have no slope data, so the rule that favours the vehicle going uphill only applies at hairpins in Mountain Mode, where the road is measured from the bottom.
- **Mountain Mode needs signal:** some stretches of ghat road have no mobile signal, and no warnings can be given there. Hairpin counts come from map data, so they can differ slightly from the signposts.
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
