/**
 * Finds the ghat roads for Mountain Mode, and the hairpin bends on them,
 * from OpenStreetMap, and saves them in data/hillRoads.json.
 *
 * For each road it follows the main road from the bottom of the ghat to the
 * top, measures it in metres, finds the hairpins from its shape, numbers them
 * from the bottom, and marks where vehicles wait before each one.
 *
 * Usage: npm run roads:hills
 *
 * The server copies new roads into the database when it starts. Bends
 * changed on the admin page are kept.
 */
const fs = require("fs");
const path = require("path");

const { downloadFromOverpass } = require("../services/roadEntrances");
const {
  describeBends,
  findHairpins,
  measureLine,
} = require("../services/hillRoads");

const OUTPUT = path.join(__dirname, "..", "data", "hillRoads.json");

// Each ghat, from the bottom to the top, with a box around it for the download
const GHATS = [
  {
    id: "HILL_VALPARAI",
    name: "Valparai ghat road",
    from: [10.4827, 76.9659], // Aliyar Dam
    to: [10.328, 76.9557], // Valparai
    box: [10.3, 76.9, 10.5, 77.0],
  },
  {
    id: "HILL_OOTY",
    name: "Ooty ghat road",
    from: [11.3378, 76.8825], // Kallar
    to: [11.4127, 76.7031], // Ooty, through Coonoor
    box: [11.32, 76.68, 11.43, 76.9],
  },
  {
    id: "HILL_YERCAUD",
    name: "Yercaud ghat road",
    from: [11.7093, 78.1765], // Kondappanaickenpatti, Salem
    to: [11.7852, 78.2075], // Yercaud
    box: [11.69, 78.15, 11.8, 78.23],
  },
];

// Main roads are preferred, so the route stays on the ghat road rather than
// taking a short cut through village lanes
const ROAD_COST = {
  motorway: 1,
  trunk: 1,
  primary: 1,
  secondary: 1.1,
  tertiary: 1.6,
  unclassified: 3,
  residential: 5,
};

const ROAD_TYPES = Object.keys(ROAD_COST).flatMap((type) => [
  type,
  `${type}_link`,
]);

// A "bend" this far from any other is a turn in a town, not on the ghat
const LONE_BEND_M = 5000;

// A sharp turn this close to where the route changes road is a junction
const JUNCTION_M = 40;

const ATTEMPTS = 6;
const RETRY_MS = 30000;

const EARTH_RADIUS_M = 6371000;

function distance([latA, lonA], [latB, lonB]) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const x = toRadians(lonB - lonA) * Math.cos(toRadians((latA + latB) / 2));
  const y = toRadians(latB - latA);

  return Math.hypot(x, y) * EARTH_RADIUS_M;
}

async function download(box) {
  const query = `[out:json][timeout:180];way["highway"~"^(${ROAD_TYPES.join("|")})$"](${box.join(",")});out body geom;`;

  for (let attempt = 1; ; attempt++) {
    try {
      return await downloadFromOverpass(query, 180000);
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;

      console.log(`${error.message}. Trying again in ${RETRY_MS / 1000}s.`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

/**
 * The cheapest route through the road network from one point to another,
 * as a line, and the points where it turns from one road onto another.
 */
function route(ways, from, to) {
  const nodes = new Map();

  for (const way of ways) {
    if (!Array.isArray(way.nodes) || !Array.isArray(way.geometry)) continue;

    const cost = ROAD_COST[way.tags.highway.replace("_link", "")] ?? 5;

    way.nodes.forEach((id, i) => {
      const point = way.geometry[i];

      if (!point) return;

      if (!nodes.has(id)) {
        nodes.set(id, {
          point: [point.lat, point.lon],
          links: [],
          main: false,
        });
      }

      if (cost <= ROAD_COST.tertiary) nodes.get(id).main = true;

      const previous = way.nodes[i - 1];

      if (i > 0 && nodes.has(previous)) {
        const length = distance(nodes.get(previous).point, nodes.get(id).point);

        nodes.get(previous).links.push({ id, cost: length * cost, way });
        nodes.get(id).links.push({ id: previous, cost: length * cost, way });
      }
    });
  }

  const nearest = (point) => {
    let best = null;

    for (const [id, node] of nodes) {
      if (!node.main) continue;

      const d = distance(point, node.point);

      if (!best || d < best.d) best = { id, d };
    }

    return best.id;
  };

  const start = nearest(from);
  const end = nearest(to);

  // Dijkstra's shortest path
  const cost = new Map([[start, 0]]);
  const previous = new Map();
  const done = new Set();
  const queue = [[0, start]];

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]);

    const [soFar, id] = queue.shift();

    if (done.has(id)) continue;
    done.add(id);

    if (id === end) break;

    for (const link of nodes.get(id).links) {
      const next = soFar + link.cost;

      if (next < (cost.get(link.id) ?? Infinity)) {
        cost.set(link.id, next);
        previous.set(link.id, { id, way: link.way });
        queue.push([next, link.id]);
      }
    }
  }

  if (!previous.has(end)) {
    throw new Error("No route found between the ends of the ghat");
  }

  const ids = [];
  const viaWays = [];

  for (let id = end; id !== undefined; id = previous.get(id)?.id) {
    ids.unshift(id);
    viaWays.unshift(previous.get(id)?.way);
  }

  const label = (way) => way && (way.tags.ref || way.tags.name || way.id);
  const junctions = [];

  for (let i = 1; i < ids.length - 1; i++) {
    if (
      nodes.get(ids[i]).links.length >= 3 &&
      label(viaWays[i]) !== label(viaWays[i + 1])
    ) {
      junctions.push(nodes.get(ids[i]).point);
    }
  }

  return {
    line: ids.map((id) => nodes.get(id).point),
    junctions,
    roads: [...new Set(viaWays.slice(1).map(label))],
  };
}

async function main() {
  const roads = [];

  for (const ghat of GHATS) {
    console.log(`\n${ghat.name}: downloading...`);

    const ways = await download(ghat.box);
    const { line, junctions, roads: names } = route(ways, ghat.from, ghat.to);
    const metres = measureLine(line);

    const hairpins = findHairpins(line).filter((bend, i, all) => {
      const middle =
        line[metres.findIndex((m) => m >= (bend.startM + bend.endM) / 2)];
      const atJunction = junctions.some(
        (j) => distance(j, middle) < JUNCTION_M,
      );
      const alone = !all.some(
        (other, j) =>
          j !== i && Math.abs(other.startM - bend.startM) < LONE_BEND_M,
      );

      return !atJunction && !alone;
    });

    const bends = describeBends(line, hairpins);

    console.log(
      `${(metres[metres.length - 1] / 1000).toFixed(1)} km on ${names.slice(0, 3).join(", ")}, ${bends.length} hairpin bends`,
    );

    roads.push({
      id: ghat.id,
      name: ghat.name,
      line,
      bends,
    });
  }

  fs.writeFileSync(OUTPUT, `${JSON.stringify(roads, null, 2)}\n`);

  console.log(`\nSaved in ${path.basename(OUTPUT)}.`);
}

main().catch((error) => {
  console.error("Couldn't find the ghat roads:", error.message);
  process.exitCode = 1;
});
