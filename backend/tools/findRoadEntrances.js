/**
 * Works out where vehicles can drive into each road in data/narrowRoads.json,
 * and the roads leading there, from OpenStreetMap, and saves them in the
 * same file.
 *
 * The server uses these for roads that don't have entrances yet, so it
 * doesn't have to ask OpenStreetMap for every road when it starts. Run it
 * again after the roads change.
 *
 * Usage: npm run roads:entrances
 *
 * Downloads the roads around every narrow road in one request, trying again
 * for a few minutes if OpenStreetMap is busy.
 */
const fs = require("fs");
const path = require("path");

const {
  downloadWaysAround,
  findEntrances,
  waysNear,
} = require("../services/roadEntrances");

const ROADS_FILE = path.join(__dirname, "..", "data", "narrowRoads.json");

const ATTEMPTS = 6;
const RETRY_MS = 30000;

async function download(polygons) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await downloadWaysAround(polygons, { timeoutMs: 180000 });
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;

      console.log(`${error.message}. Trying again in ${RETRY_MS / 1000}s.`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

async function main() {
  const roads = JSON.parse(fs.readFileSync(ROADS_FILE, "utf8"));

  console.log(`Downloading the roads around ${roads.length} narrow roads...`);

  const ways = await download(roads.map((road) => road.polygon));

  console.log(`Got ${ways.length} roads from OpenStreetMap.`);

  const counts = {};

  for (const road of roads) {
    road.entrances = findEntrances(road.polygon, waysNear(road.polygon, ways));

    const count = road.entrances.length;
    counts[count] = (counts[count] ?? 0) + 1;
  }

  fs.writeFileSync(ROADS_FILE, `${JSON.stringify(roads, null, 2)}\n`);

  console.log("Roads by number of entrances:", counts);
  console.log(`Saved in ${path.basename(ROADS_FILE)}.`);
}

main().catch((error) => {
  console.error("Couldn't find the entrances:", error.message);
  process.exitCode = 1;
});
