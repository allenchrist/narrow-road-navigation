/**
 * Finds very narrow roads in Coimbatore from map data.
 *
 * OpenStreetMap rarely records how wide a road is, so the width is measured
 * instead: every 2 m along each small road, it looks left and right for the
 * nearest building. Where the buildings on both sides are 4 m apart or less,
 * two vehicles can't pass, so that stretch is a narrow road.
 *
 * The shapes follow the middle of the gap between the buildings, not the
 * OpenStreetMap line, which can be a few metres off. Each is as wide as the
 * gap it measured, and pieces of one lane split at a junction are joined.
 *
 * Input, in the download folder (not kept in git, see README):
 *   osm_roads.json       small roads, from the Overpass API with "out tags geom"
 *   osm_buildings.json   buildings, from the Overpass API with "out geom"
 *   ms_buildings.csv.gz  Microsoft Global ML Building Footprints, tile 123321101
 *
 * Usage: node tools/findNarrowRoads.js [downloadFolder] [outputFile]
 * The output has the same shape as data/narrowRoads.json.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");

const DOWNLOAD = process.argv[2] || path.join(__dirname, "download");
const OUTPUT =
  process.argv[3] || path.join(__dirname, "narrowRoads.found.json");

// Coimbatore and its suburbs
const BBOX = { south: 10.9, west: 76.85, north: 11.1, east: 77.1 };

// Building to building, in metres. Narrower than this, two vehicles can't pass.
const MAX_GAP_M = 4;

// How far each side to look for a building
const MAX_RAY_M = 6;

// A building closer than this means the road line runs through it
const MIN_SIDE_M = 0.5;

// Distance between measurements along a road
const STEP_M = 2;

// A stretch may include short wide spots, such as a gap between two houses
const MAX_BREAK_M = 8;

// Narrow stretches of one road this close are joined into one. Otherwise the
// lane would have two road IDs, and cars on either side of the wide spot
// between them wouldn't be told to give way to each other.
const JOIN_GAP_M = 20;

// Shorter stretches are left out
const MIN_LENGTH_M = 25;

// Share of a stretch's measurements that must be narrow
const MIN_NARROW_SHARE = 0.7;

// Half the width of each shape, in metres
const MIN_HALF_WIDTH_M = 1.25;
const MAX_HALF_WIDTH_M = 2;

// Ends of two stretches this close, pointing the same way, are one lane
const JOIN_DISTANCE_M = 4;
const JOIN_ANGLE_DEGREES = 35;

// Measurements averaged together to smooth the middle line
const SMOOTHING_SAMPLES = 5;

// Corners that change the line by less than this are removed
const SIMPLIFY_M = 0.4;

const ROAD_TYPES = new Set([
  "residential",
  "unclassified",
  "living_street",
  "service",
  "tertiary",
  "track",
]);
const SKIP_SERVICE = new Set(["parking_aisle", "driveway", "drive-through"]);
const SKIP_ACCESS = new Set(["no", "private"]);

// ── Metres on a flat local map ─────────────────────────────────────────
const LAT0 = (BBOX.south + BBOX.north) / 2;
const M_PER_LAT = 110574;
const M_PER_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

const toXY = (lat, lon) => [
  (lon - BBOX.west) * M_PER_LON,
  (lat - BBOX.south) * M_PER_LAT,
];
const toLatLon = ([x, y]) => [
  Math.round((y / M_PER_LAT + BBOX.south) * 1e7) / 1e7,
  Math.round((x / M_PER_LON + BBOX.west) * 1e7) / 1e7,
];
const inBox = (lat, lon, margin) =>
  lat > BBOX.south - margin &&
  lat < BBOX.north + margin &&
  lon > BBOX.west - margin &&
  lon < BBOX.east + margin;

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ── Building edges, in a grid for quick lookup ─────────────────────────
const CELL_M = 10;
const grid = new Map();

const cellKey = (cx, cy) => cx * 100000 + cy;

function addRing(points) {
  for (let i = 0; i + 1 < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const edge = [x1, y1, x2, y2];

    for (
      let cx = Math.floor(Math.min(x1, x2) / CELL_M);
      cx <= Math.floor(Math.max(x1, x2) / CELL_M);
      cx++
    ) {
      for (
        let cy = Math.floor(Math.min(y1, y2) / CELL_M);
        cy <= Math.floor(Math.max(y1, y2) / CELL_M);
        cy++
      ) {
        const key = cellKey(cx, cy);

        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(edge);
      }
    }
  }
}

async function loadMicrosoftBuildings() {
  const lines = readline.createInterface({
    input: fs
      .createReadStream(path.join(DOWNLOAD, "ms_buildings.csv.gz"))
      .pipe(zlib.createGunzip()),
  });

  let count = 0;

  for await (const line of lines) {
    // Checks the first point before parsing the whole line
    const first = /\[\[\[([\d.]+), ([\d.]+)\]/.exec(line);

    if (!first || !inBox(Number(first[2]), Number(first[1]), 0.001)) continue;

    for (const ring of JSON.parse(line).geometry.coordinates) {
      addRing(ring.map(([lon, lat]) => toXY(lat, lon)));
    }

    count++;
  }

  return count;
}

function loadOsmBuildings() {
  const { elements } = JSON.parse(
    fs.readFileSync(path.join(DOWNLOAD, "osm_buildings.json"), "utf8"),
  );

  let count = 0;

  for (const way of elements) {
    if (way.geometry?.length >= 4) {
      addRing(way.geometry.map((p) => toXY(p.lat, p.lon)));
      count++;
    }
  }

  return count;
}

// ── Measuring ──────────────────────────────────────────────────────────

// Distance to the nearest building edge along a ray, or Infinity
function castRay([px, py], [dx, dy]) {
  const ex = px + dx * MAX_RAY_M;
  const ey = py + dy * MAX_RAY_M;
  const checked = new Set();
  let nearest = Infinity;

  for (
    let cx = Math.floor(Math.min(px, ex) / CELL_M);
    cx <= Math.floor(Math.max(px, ex) / CELL_M);
    cx++
  ) {
    for (
      let cy = Math.floor(Math.min(py, ey) / CELL_M);
      cy <= Math.floor(Math.max(py, ey) / CELL_M);
      cy++
    ) {
      for (const edge of grid.get(cellKey(cx, cy)) ?? []) {
        if (checked.has(edge)) continue;
        checked.add(edge);

        const [x1, y1, x2, y2] = edge;
        const sx = x2 - x1;
        const sy = y2 - y1;
        const denominator = dx * sy - dy * sx;

        if (Math.abs(denominator) < 1e-9) continue;

        const along = ((x1 - px) * sy - (y1 - py) * sx) / denominator;
        const onEdge = ((x1 - px) * dy - (y1 - py) * dx) / denominator;

        if (along >= 0 && onEdge >= 0 && onEdge <= 1 && along < nearest)
          nearest = along;
      }
    }
  }

  return nearest;
}

// Points every STEP_M along a line, each with the direction to its left
function sampleLine(points) {
  const samples = [];
  let offset = 0;

  for (let i = 0; i + 1 < points.length; i++) {
    const length = distance(points[i], points[i + 1]);

    if (length === 0) continue;

    const tx = (points[i + 1][0] - points[i][0]) / length;
    const ty = (points[i + 1][1] - points[i][1]) / length;

    for (let d = offset; d <= length; d += STEP_M) {
      samples.push({
        point: [points[i][0] + tx * d, points[i][1] + ty * d],
        left: [-ty, tx],
      });
    }

    offset = (offset - length) % STEP_M;
    if (offset < 0) offset += STEP_M;
  }

  return samples;
}

function measure(sample) {
  const toLeft = castRay(sample.point, sample.left);
  const toRight = castRay(sample.point, [-sample.left[0], -sample.left[1]]);

  if (toLeft < MIN_SIDE_M || toRight < MIN_SIDE_M) {
    return { narrow: false };
  }

  const gap = toLeft + toRight;

  return {
    narrow: gap <= MAX_GAP_M,
    gap,
    // How far left the middle of the gap is from the OpenStreetMap line
    shift: (toLeft - toRight) / 2,
  };
}

// Runs of narrow measurements, allowing short wide spots
function findStretches(samples) {
  const stretches = [];
  let current = null;
  let breakM = 0;

  samples.forEach((sample, index) => {
    if (sample.narrow) {
      current ??= { start: index, narrowCount: 0 };
      current.end = index;
      current.narrowCount++;
      breakM = 0;
    } else if (current && (breakM += STEP_M) > MAX_BREAK_M) {
      stretches.push(current);
      current = null;
      breakM = 0;
    }
  });

  if (current) stretches.push(current);

  const kept = stretches.filter(
    (s) =>
      (s.end - s.start) * STEP_M >= MIN_LENGTH_M &&
      s.narrowCount / (s.end - s.start + 1) >= MIN_NARROW_SHARE,
  );

  const joined = [];

  for (const stretch of kept) {
    const previous = joined[joined.length - 1];

    if (previous && (stretch.start - previous.end) * STEP_M <= JOIN_GAP_M) {
      previous.end = stretch.end;
    } else {
      joined.push({ ...stretch });
    }
  }

  return joined.map(({ start, end }) => samples.slice(start, end + 1));
}

// The middle of the gap along the stretch, smoothed
function middleLine(samples) {
  // Wide spots inside the stretch take the shift of the nearest measurement
  const shifts = samples.map((s) => (s.narrow ? s.shift : null));

  shifts.forEach((shift, i) => {
    if (shift !== null) return;

    for (let d = 1; d < shifts.length; d++) {
      const near = shifts[i - d] ?? shifts[i + d];

      if (typeof near === "number") {
        shifts[i] = near;
        return;
      }
    }
  });

  const half = Math.floor(SMOOTHING_SAMPLES / 2);

  return samples.map((s, i) => {
    const window = shifts.slice(Math.max(0, i - half), i + half + 1);
    const shift = window.reduce((sum, v) => sum + v, 0) / window.length;

    return [s.point[0] + s.left[0] * shift, s.point[1] + s.left[1] * shift];
  });
}

// Douglas-Peucker: keeps the corners that matter
function simplify(points, tolerance) {
  if (points.length < 3) return points;

  const [a, b] = [points[0], points[points.length - 1]];
  const length = distance(a, b) || 1;
  let farthest = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const offLine =
      Math.abs(
        (b[0] - a[0]) * (a[1] - points[i][1]) -
          (a[0] - points[i][0]) * (b[1] - a[1]),
      ) / length;

    if (offLine > farthest) {
      farthest = offLine;
      index = i;
    }
  }

  if (farthest <= tolerance) return [a, b];

  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

// An outline at an even distance either side of the line
function outline(line, halfWidth) {
  const sides = line.map((point, i) => {
    const before = line[Math.max(0, i - 1)];
    const after = line[Math.min(line.length - 1, i + 1)];
    const length = distance(before, after) || 1;
    const left = [
      -(after[1] - before[1]) / length,
      (after[0] - before[0]) / length,
    ];

    // At a bend the corner sits further out, so the width stays even
    let scale = 1;

    if (i > 0 && i < line.length - 1) {
      const inLength = distance(before, point) || 1;
      const inLeft = [
        -(point[1] - before[1]) / inLength,
        (point[0] - before[0]) / inLength,
      ];
      scale = Math.min(
        2,
        1 / Math.max(0.5, left[0] * inLeft[0] + left[1] * inLeft[1]),
      );
    }

    const d = halfWidth * scale;

    return {
      left: [point[0] + left[0] * d, point[1] + left[1] * d],
      right: [point[0] - left[0] * d, point[1] - left[1] * d],
    };
  });

  const ring = [
    ...sides.map((s) => s.left),
    ...sides.map((s) => s.right).reverse(),
  ];

  return [...ring, ring[0]];
}

function segmentsCross(a, b, c, d) {
  const turn = (p, q, r) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);

  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

function crossesItself(ring) {
  for (let i = 0; i + 1 < ring.length; i++) {
    for (let j = i + 2; j + 1 < ring.length; j++) {
      if (i === 0 && j + 2 === ring.length) continue;
      if (segmentsCross(ring[i], ring[i + 1], ring[j], ring[j + 1]))
        return true;
    }
  }

  return false;
}

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const direction = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]);

function angleBetween(a, b) {
  const difference = Math.abs(a - b) % (2 * Math.PI);

  return (
    ((difference > Math.PI ? 2 * Math.PI - difference : difference) * 180) /
    Math.PI
  );
}

// Joins stretches that continue each other, such as one lane split in two
// at a junction in OpenStreetMap
function joinStretches(stretches) {
  let joined = true;

  while (joined) {
    joined = false;

    outer: for (const a of stretches) {
      for (const b of stretches) {
        if (a === b) continue;

        // Either end of a against either end of b
        for (const [aLine, line] of [
          [a.line, b.line],
          [a.line, [...b.line].reverse()],
          [[...a.line].reverse(), b.line],
          [[...a.line].reverse(), [...b.line].reverse()],
        ]) {
          const aEnd = aLine[aLine.length - 1];
          const aDirection = direction(aLine[aLine.length - 2], aEnd);
          const bDirection = direction(line[0], line[1]);

          if (
            distance(aEnd, line[0]) <= JOIN_DISTANCE_M &&
            angleBetween(aDirection, bDirection) <= JOIN_ANGLE_DEGREES
          ) {
            a.line = [
              ...aLine,
              ...line.slice(distance(aEnd, line[0]) < 0.5 ? 1 : 0),
            ];
            a.gaps.push(...b.gaps);
            a.ways.push(...b.ways);
            a.name ??= b.name;
            stretches.splice(stretches.indexOf(b), 1);
            joined = true;
            break outer;
          }
        }
      }
    }
  }

  return stretches;
}

function lineLength(line) {
  return line
    .slice(1)
    .reduce((sum, point, i) => sum + distance(line[i], point), 0);
}

(async () => {
  const microsoft = await loadMicrosoftBuildings();
  const openStreetMap = loadOsmBuildings();

  console.log(
    `Buildings: ${microsoft} from Microsoft, ${openStreetMap} from OpenStreetMap`,
  );

  const { elements: roads } = JSON.parse(
    fs.readFileSync(path.join(DOWNLOAD, "osm_roads.json"), "utf8"),
  );

  let stretches = [];

  for (const way of roads) {
    const tags = way.tags ?? {};

    if (
      !ROAD_TYPES.has(tags.highway) ||
      SKIP_SERVICE.has(tags.service) ||
      SKIP_ACCESS.has(tags.access) ||
      tags.area === "yes" ||
      !way.geometry
    ) {
      continue;
    }

    const points = way.geometry
      .filter((p) => inBox(p.lat, p.lon, 0))
      .map((p) => toXY(p.lat, p.lon));

    if (points.length < 2) continue;

    const samples = sampleLine(points).map((s) => ({ ...s, ...measure(s) }));

    for (const stretch of findStretches(samples)) {
      stretches.push({
        line: middleLine(stretch),
        gaps: stretch.filter((s) => s.narrow).map((s) => s.gap),
        ways: [way.id],
        name: tags.name ?? null,
      });
    }
  }

  const measured = stretches.length;

  stretches = joinStretches(stretches);

  const now = new Date().toISOString();
  const used = new Set();
  let selfCrossing = 0;

  const found = stretches.flatMap((stretch) => {
    const gap = median(stretch.gaps);
    const halfWidth = Math.min(
      MAX_HALF_WIDTH_M,
      Math.max(MIN_HALF_WIDTH_M, gap / 2),
    );

    // A tight bend can fold the outline over itself, which would confuse the
    // inside check. Smoothing the line more usually fixes it, else it's left out.
    const ring = [SIMPLIFY_M, 1, 2]
      .map((tolerance) => outline(simplify(stretch.line, tolerance), halfWidth))
      .find((candidate) => !crossesItself(candidate));

    if (!ring) {
      selfCrossing++;
      return [];
    }

    const wayId = stretch.ways[0];
    let id = `NR_OSM_${wayId}`;

    for (let part = 2; used.has(id); part++) id = `NR_OSM_${wayId}_${part}`;
    used.add(id);

    return [
      {
        id,
        name: stretch.name ?? `Narrow Road ${wayId}`,
        polygon: ring.map(toLatLon),
        createdAt: now,
        updatedAt: now,
        widthM: Math.round(gap * 10) / 10,
        lengthM: Math.round(lineLength(stretch.line)),
      },
    ];
  });

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      found.map(({ widthM: _w, lengthM: _l, ...road }) => road),
      null,
      2,
    ) + "\n",
  );

  const totalKm = found.reduce((sum, r) => sum + r.lengthM, 0) / 1000;

  console.log(
    `Narrow stretches measured: ${measured}, after joining: ${stretches.length}`,
  );
  console.log(`Left out because a bend folded the outline: ${selfCrossing}`);
  console.log(
    `Narrow roads written: ${found.length}, ${totalKm.toFixed(1)} km, to ${OUTPUT}`,
  );
  console.log(
    `With a street name: ${found.filter((r) => !/^Narrow Road \d+$/.test(r.name)).length}`,
  );

  // For review, alongside the output
  fs.writeFileSync(
    OUTPUT.replace(/\.json$/, ".review.json"),
    JSON.stringify(
      found.map(({ id, name, widthM, lengthM }) => ({
        id,
        name,
        widthM,
        lengthM,
      })),
      null,
      1,
    ),
  );
})();
