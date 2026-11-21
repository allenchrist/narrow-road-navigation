/**
 * Where vehicles can drive into each narrow road, and the roads leading to
 * those places.
 *
 * An entrance is where a real road from OpenStreetMap leaves the narrow road
 * shape. Its approach lanes are the last stretch of each road leading to it,
 * followed back through junctions. Only vehicles on an approach lane count as
 * arriving, so a car on a parallel street or a road that passes close by
 * without joining is never mistaken for one.
 *
 * Where no connecting road is known, the two ends of the shape are used
 * instead, with no lanes.
 */

const EARTH_RADIUS_M = 6371000;
const METRES_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_M;

// A road this close to the shape counts as on it. OpenStreetMap lines can be
// a few metres from the middle of the lane the shape was measured from.
const ON_ROAD_M = 6;

// How far back from an entrance its approach lanes go
const LANE_LENGTH_M = 60;

// Crossings this close together are one entrance, such as two roads that
// meet just outside the shape, or a cross street at the end of the lane,
// which leaves the shape on both sides
const MERGE_M = 15;

// Steps when looking along a road for where it leaves the shape
const SAMPLE_STEP_M = 1;

// A road that leaves the shape and comes straight back is the map line
// wandering off the lane, not a way in. Lanes back to the shape shorter than
// this are dropped, and so are lanes too short to arrive on.
const MIN_LOOP_M = 15;
const MIN_LANE_M = 3;

// Paths only for people, which cars can't arrive on
const NOT_FOR_VEHICLES = new Set([
  "footway",
  "path",
  "steps",
  "pedestrian",
  "cycleway",
  "bridleway",
  "corridor",
  "platform",
  "elevator",
  "construction",
  "proposed",
  "abandoned",
  "razed",
  "bus_stop",
]);

// ── Flat projection around a point, in metres ───────────────────────────

function projector([originLat, originLon]) {
  const lonScale = Math.cos((originLat * Math.PI) / 180);

  return {
    toXY: ([lat, lon]) => [
      (lon - originLon) * lonScale * METRES_PER_DEGREE,
      (lat - originLat) * METRES_PER_DEGREE,
    ],
    toLatLon: ([x, y]) => [
      round(originLat + y / METRES_PER_DEGREE),
      round(originLon + x / (lonScale * METRES_PER_DEGREE)),
    ],
  };
}

const round = (value) => Math.round(value * 1e7) / 1e7;

function ringOf(polygon) {
  const ring = polygon.slice();
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    ring.pop();
  }

  return ring;
}

function centroid(points) {
  const sum = points.reduce(
    (total, [a, b]) => [total[0] + a, total[1] + b],
    [0, 0],
  );

  return [sum[0] / points.length, sum[1] / points.length];
}

function insideRing([x, y], ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
        );

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToRing(point, ring) {
  let nearest = Infinity;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    nearest = Math.min(nearest, distanceToSegment(point, ring[j], ring[i]));
  }

  return nearest;
}

const onShape = (point, ring) =>
  insideRing(point, ring) || distanceToRing(point, ring) <= ON_ROAD_M;

const lerp = ([ax, ay], [bx, by], t) => [
  ax + (bx - ax) * t,
  ay + (by - ay) * t,
];

const length = ([ax, ay], [bx, by]) => Math.hypot(bx - ax, by - ay);

const lineLength = (points) =>
  points
    .slice(1)
    .reduce((total, point, i) => total + length(points[i], point), 0);

// ── The road network around a narrow road ───────────────────────────────

/**
 * Joins the roads into a network of points and the links between them, from
 * Overpass "out body geom" ways, which list each way's node IDs and positions.
 */
function buildNetwork(ways, toXY) {
  const nodes = new Map();

  for (const way of ways) {
    if (
      !way.tags?.highway ||
      NOT_FOR_VEHICLES.has(way.tags.highway) ||
      !Array.isArray(way.nodes) ||
      !Array.isArray(way.geometry) ||
      way.nodes.length !== way.geometry.length
    ) {
      continue;
    }

    way.nodes.forEach((id, index) => {
      const point = way.geometry[index];

      if (!point) return;

      if (!nodes.has(id)) {
        nodes.set(id, { xy: toXY([point.lat, point.lon]), links: new Set() });
      }

      if (index > 0) {
        const previous = way.nodes[index - 1];

        if (nodes.has(previous)) {
          nodes.get(id).links.add(previous);
          nodes.get(previous).links.add(id);
        }
      }
    });
  }

  return nodes;
}

/**
 * Follows the network away from the shape, from a point on the link towards
 * `next`, until the lane is long enough. Splits at junctions, so a lane is
 * kept for each road leading in. Stops at the shape, should a road come back.
 */
function walkLanes(nodes, ring, start, from, next, remaining, path, lanes) {
  const target = nodes.get(next).xy;
  const step = length(start, target);

  // Stops where the road meets the shape again
  for (
    let d = SAMPLE_STEP_M;
    d < Math.min(step, remaining);
    d += SAMPLE_STEP_M
  ) {
    const point = lerp(start, target, d / step);

    if (onShape(point, ring)) {
      lanes.push({ points: [...path, point], back: true });
      return;
    }
  }

  if (step >= remaining) {
    lanes.push({ points: [...path, lerp(start, target, remaining / step)] });
    return;
  }

  const onward = [...nodes.get(next).links].filter(
    (id) => id !== from && !onShape(nodes.get(id).xy, ring),
  );

  if (onward.length === 0) {
    lanes.push({ points: [...path, target] });
    return;
  }

  for (const id of onward) {
    walkLanes(
      nodes,
      ring,
      target,
      next,
      id,
      remaining - step,
      [...path, target],
      lanes,
    );
  }
}

/**
 * Every place a road leaves the shape, with the lanes leading back from it.
 */
function findCrossings(nodes, ring) {
  const crossings = [];
  const seen = new Set();

  for (const [id, node] of nodes) {
    for (const otherId of node.links) {
      const key = id < otherId ? `${id}|${otherId}` : `${otherId}|${id}`;

      if (seen.has(key)) continue;
      seen.add(key);

      // Each direction along the link, looking for on → off the shape
      for (const [fromId, toId] of [
        [id, otherId],
        [otherId, id],
      ]) {
        const a = nodes.get(fromId).xy;
        const b = nodes.get(toId).xy;
        const linkLength = length(a, b);
        const steps = Math.max(1, Math.ceil(linkLength / SAMPLE_STEP_M));

        let wasOn = onShape(a, ring);

        for (let i = 1; i <= steps; i++) {
          const point = lerp(a, b, i / steps);
          const isOn = onShape(point, ring);

          if (wasOn && !isOn) {
            const lanes = [];
            const entrance = lerp(a, b, (i - 1) / steps);

            walkLanes(
              nodes,
              ring,
              entrance,
              fromId,
              toId,
              LANE_LENGTH_M,
              [entrance],
              lanes,
            );

            const kept = lanes
              .filter(({ points, back }) => {
                const laneLength = lineLength(points);

                return laneLength >= (back ? MIN_LOOP_M : MIN_LANE_M);
              })
              .map(({ points }) => points);

            if (kept.length > 0) {
              crossings.push({ point: entrance, lanes: kept });
            }
          }

          wasOn = isOn;
        }
      }
    }
  }

  return crossings;
}

function mergeCrossings(crossings) {
  const groups = [];

  for (const crossing of crossings) {
    const group = groups.find((existing) =>
      existing.points.some((point) => length(point, crossing.point) <= MERGE_M),
    );

    if (group) {
      group.points.push(crossing.point);
      group.lanes.push(...crossing.lanes);
    } else {
      groups.push({ points: [crossing.point], lanes: [...crossing.lanes] });
    }
  }

  return groups.map((group) => ({
    point: centroid(group.points),
    lanes: group.lanes,
  }));
}

// ── The ends of a shape, when no roads are known ────────────────────────

/**
 * The two ends of a long, thin shape: the points furthest apart, each moved
 * to the middle of its end, so a rectangle's ends are the middles of its
 * short sides rather than two opposite corners.
 */
function shapeEnds(ring) {
  let best = [ring[0], ring[0]];
  let bestLength = -1;

  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const d = length(ring[i], ring[j]);

      if (d > bestLength) {
        bestLength = d;
        best = [ring[i], ring[j]];
      }
    }
  }

  // Shoelace area, for the shape's average width
  let area = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }

  const width = bestLength > 0 ? Math.abs(area) / 2 / bestLength : 0;
  const reach = Math.max(6, width * 2);

  return best.map((end) =>
    centroid(ring.filter((point) => length(point, end) <= reach)),
  );
}

// ── Putting it together ─────────────────────────────────────────────────

/**
 * Entrances for a road shape, as [{ point: [lat, lon], lanes: [[[lat, lon],
 * ...]] }]. Each lane runs from its entrance outwards. With no ways, or none
 * leaving the shape, the shape's two ends are used, with no lanes.
 */
function findEntrances(polygon, ways = []) {
  const ring = ringOf(polygon);

  if (ring.length < 3) return [];

  const { toXY, toLatLon } = projector(centroid(ring));
  const ringXY = ring.map(toXY);

  const found = mergeCrossings(findCrossings(buildNetwork(ways, toXY), ringXY));

  const entrances =
    found.length > 0
      ? found
      : shapeEnds(ringXY).map((point) => ({ point, lanes: [] }));

  return entrances.map(({ point, lanes }) => ({
    point: toLatLon(point),
    lanes: lanes.map((lane) => lane.map(toLatLon)),
  }));
}

/** The ends of the shape, for a road whose connecting roads aren't known yet. */
function shapeEndEntrances(polygon) {
  return findEntrances(polygon, []);
}

// ── Downloading the roads from OpenStreetMap ────────────────────────────

// The main server first, then another public copy for when it's busy
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Roads within this distance of the shape are downloaded
const DOWNLOAD_MARGIN_M = LANE_LENGTH_M + 40;

/** The box around a shape, with room for its lanes, as [south, west, north, east]. */
function boxAround(polygon) {
  const ring = ringOf(polygon);
  const lats = ring.map(([lat]) => lat);
  const lons = ring.map(([, lon]) => lon);
  const latMargin = DOWNLOAD_MARGIN_M / METRES_PER_DEGREE;
  const lonMargin =
    latMargin /
    Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);

  return [
    Math.min(...lats) - latMargin,
    Math.min(...lons) - lonMargin,
    Math.max(...lats) + latMargin,
    Math.max(...lons) + lonMargin,
  ];
}

/** The roads that pass through a shape's box, from a larger download. */
function waysNear(polygon, ways) {
  const [south, west, north, east] = boxAround(polygon);

  return ways.filter((way) =>
    way.geometry?.some(
      (point) =>
        point &&
        point.lat >= south &&
        point.lat <= north &&
        point.lon >= west &&
        point.lon <= east,
    ),
  );
}

/**
 * The roads around one or more shapes, in one request to OpenStreetMap's
 * Overpass service. Throws if it can't be reached, so the caller can keep
 * the shapes' ends for now.
 */
async function downloadWaysAround(polygons, { timeoutMs = 30000 } = {}) {
  const boxes = polygons
    .map((polygon) =>
      boxAround(polygon)
        .map((value) => value.toFixed(6))
        .join(","),
    )
    .map((bbox) => `way["highway"](${bbox});`)
    .join("");

  const query = `[out:json][timeout:${Math.ceil(timeoutMs / 1000)}];(${boxes});out body geom;`;

  const problems = [];

  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "ConnectedVehicle/1.0 (+https://narrow-road-navigation.vercel.app)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`answered ${response.status}`);
      }

      const { elements } = await response.json();

      if (!Array.isArray(elements)) {
        throw new Error("sent no roads");
      }

      return elements.filter((element) => element.type === "way");
    } catch (error) {
      problems.push(`${new URL(url).hostname} ${error.message}`);
    }
  }

  throw new Error(`OpenStreetMap couldn't be reached: ${problems.join("; ")}`);
}

/** The roads around a shape. */
function downloadWays(polygon, options) {
  return downloadWaysAround([polygon], options);
}

module.exports = {
  findEntrances,
  shapeEndEntrances,
  downloadWays,
  downloadWaysAround,
  waysNear,
  LANE_LENGTH_M,
};
