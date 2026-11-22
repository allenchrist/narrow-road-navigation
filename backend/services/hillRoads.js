/**
 * Ghat roads as lines measured in metres from the bottom, the hairpin bends
 * along them, and where a vehicle is on one.
 *
 * Each road is one line of [latitude, longitude] points from the bottom of
 * the ghat to the top. A point's "metre" is how far along the road it is, so
 * a vehicle's direction and its distance to a bend are measured along the
 * road. On a hairpin, two arms of the road can be 20 m apart in a straight
 * line but 150 m apart by road.
 */

const EARTH_RADIUS_M = 6371000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

// ── Finding hairpins ────────────────────────────────────────────────────

// The road is looked at every few metres
const SAMPLE_STEP_M = 5;

// A hairpin turns the road nearly right round within a short distance
const HAIRPIN_TURN_DEGREES = 165;
const HAIRPIN_MAX_LENGTH_M = 120;

// Where a car waits for a bus to take the bend, before the turning zone
const WAIT_BEFORE_M = 30;

// A bus needs at least this much road to turn, however tight the hairpin
const MIN_ZONE_M = 40;

function distance([latA, lonA], [latB, lonB]) {
  const x = toRadians(lonB - lonA) * Math.cos(toRadians((latA + latB) / 2));
  const y = toRadians(latB - latA);

  return Math.hypot(x, y) * EARTH_RADIUS_M;
}

function bearing([latA, lonA], [latB, lonB]) {
  const x = (lonB - lonA) * Math.cos(toRadians(latA));
  const y = latB - latA;

  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

const signedTurn = (from, to) => ((to - from + 540) % 360) - 180;

/** How far along the line each point is, in metres. */
function measureLine(line) {
  const metres = [0];

  for (let i = 1; i < line.length; i++) {
    metres.push(metres[i - 1] + distance(line[i - 1], line[i]));
  }

  return metres;
}

/** The point a given number of metres along the line. */
function pointAt(line, metres, metre) {
  const along = Math.min(Math.max(metre, 0), metres[metres.length - 1]);
  let i = 1;

  while (i < metres.length - 1 && metres[i] < along) i++;

  const span = metres[i] - metres[i - 1];
  const t = span > 0 ? (along - metres[i - 1]) / span : 0;
  const [latA, lonA] = line[i - 1];
  const [latB, lonB] = line[i];

  const round = (value) => Math.round(value * 1e7) / 1e7;

  return [round(latA + (latB - latA) * t), round(lonA + (lonB - lonA) * t)];
}

/** The part of the line between two metres, such as a bend's turning zone. */
function lineBetween(line, metres, fromM, toM) {
  const inside = line.filter((_, i) => metres[i] > fromM && metres[i] < toM);

  return [pointAt(line, metres, fromM), ...inside, pointAt(line, metres, toM)];
}

/**
 * Hairpin bends along a line, as { startM, endM }: the turning zone of each,
 * where the road turns nearly right round. Sharp bends next to each other
 * stay separate; one long sweep counts once.
 */
function findHairpins(line) {
  const metres = measureLine(line);
  const length = metres[metres.length - 1];
  const samples = [];

  for (let m = 0; m <= length; m += SAMPLE_STEP_M) {
    samples.push(pointAt(line, metres, m));
  }

  const headings = samples
    .slice(1)
    .map((point, i) => bearing(samples[i], point));
  const turns = headings
    .slice(1)
    .map((heading, i) => signedTurn(headings[i], heading));

  const window = Math.round(HAIRPIN_MAX_LENGTH_M / SAMPLE_STEP_M);
  const found = [];

  // The shortest stretch from each point that turns far enough
  for (let i = 0; i < turns.length; i++) {
    let total = 0;

    for (let j = i; j < Math.min(turns.length, i + window); j++) {
      total += turns[j];

      if (Math.abs(total) >= HAIRPIN_TURN_DEGREES) {
        found.push([i, j]);
        break;
      }
    }
  }

  // Overlapping stretches are the same bend. Its zone is the tightest one.
  const bends = [];

  for (const [i, j] of found) {
    const last = bends[bends.length - 1];

    if (last && i <= last.end) {
      last.end = Math.max(last.end, j);

      if (j - i < last.tightest[1] - last.tightest[0]) last.tightest = [i, j];
    } else {
      bends.push({ end: j, tightest: [i, j] });
    }
  }

  return bends.map(({ tightest: [i, j] }) => {
    const startM = i * SAMPLE_STEP_M;
    const endM = (j + 2) * SAMPLE_STEP_M;
    const extra = Math.max(0, MIN_ZONE_M - (endM - startM)) / 2;

    return {
      startM: Math.max(0, startM - extra),
      endM: Math.min(length, endM + extra),
    };
  });
}

/**
 * Numbers the bends from the bottom and adds what drivers need: the middle
 * of each bend, its turning zone, and a waiting point before it on each side.
 */
function describeBends(line, hairpins) {
  const metres = measureLine(line);
  const length = metres[metres.length - 1];

  return hairpins.map(({ startM, endM }, index) => {
    const waitBelowM = Math.max(0, startM - WAIT_BEFORE_M);
    const waitAboveM = Math.min(length, endM + WAIT_BEFORE_M);

    return {
      number: index + 1,
      startM: Math.round(startM),
      endM: Math.round(endM),
      apex: pointAt(line, metres, (startM + endM) / 2),
      waitBelowM: Math.round(waitBelowM),
      waitAboveM: Math.round(waitAboveM),
      waitBelow: pointAt(line, metres, waitBelowM),
      waitAbove: pointAt(line, metres, waitAboveM),
    };
  });
}

// ── Adding a hairpin by hand ────────────────────────────────────────────

// Looked at either side of the point the admin chose
const ADD_LOOK_M = 60;

// Less than this much turning, the road there is nearly straight
const NEARLY_STRAIGHT_DEGREES = 45;

/**
 * The turning zone of a hairpin at a point the admin chose, a number of
 * metres along the road: the stretch through that point, within 60 m either
 * way, where the road turns most sharply. On a nearly straight stretch, 40 m
 * centred on the point.
 */
function zoneAround(line, metres, metre) {
  const length = metres[metres.length - 1];
  const from = Math.max(0, metre - ADD_LOOK_M);
  const to = Math.min(length, metre + ADD_LOOK_M);

  const marks = [];
  for (let m = from; m <= to; m += SAMPLE_STEP_M) marks.push(m);

  const points = marks.map((m) => pointAt(line, metres, m));
  const headings = points.slice(1).map((p, i) => bearing(points[i], p));

  // turnBefore[k]: total turning at the points before sample k
  const turnBefore = [0, 0];
  for (let i = 1; i < headings.length; i++) {
    turnBefore.push(turnBefore[i] + signedTurn(headings[i - 1], headings[i]));
  }

  let best = null;

  for (let i = 0; i < marks.length; i++) {
    for (let j = i + 1; j < marks.length; j++) {
      const startM = marks[i];
      const endM = marks[j];

      if (endM - startM < MIN_ZONE_M || endM - startM > HAIRPIN_MAX_LENGTH_M) {
        continue;
      }
      if (metre < startM || metre > endM) continue;

      // The turning at the points between i and j
      const turn = Math.abs(turnBefore[j] - turnBefore[i + 1]);

      if (
        !best ||
        turn > best.turn + 1 ||
        (Math.abs(turn - best.turn) <= 1 &&
          endM - startM < best.endM - best.startM)
      ) {
        best = { startM, endM, turn };
      }
    }
  }

  if (!best || best.turn < NEARLY_STRAIGHT_DEGREES) {
    const startM = Math.max(
      0,
      Math.min(metre - MIN_ZONE_M / 2, length - MIN_ZONE_M),
    );
    return { startM, endM: Math.min(length, startM + MIN_ZONE_M) };
  }

  return { startM: best.startM, endM: best.endM };
}

/**
 * The road's bends with a new one added at a point along the road, numbered
 * again from the bottom, or an error if a hairpin is already there.
 */
function addBendAt(line, bends, metre) {
  const metres = measureLine(line);

  const already = bends.find(
    (bend) => metre >= bend.startM && metre <= bend.endM,
  );
  if (already) {
    return {
      error: `There's already a hairpin here (Hairpin ${already.number}).`,
    };
  }

  const zone = zoneAround(line, metres, metre);
  const overlapping = bends.find(
    (bend) => zone.startM < bend.endM && zone.endM > bend.startM,
  );
  if (overlapping) {
    return {
      error: `That's too close to Hairpin ${overlapping.number} to be another hairpin.`,
    };
  }

  const [added] = describeBends(line, [zone]);
  const all = [...bends, { ...added, addedByAdmin: true }]
    .sort((a, b) => a.startM - b.startM)
    .map((bend, index) => ({ ...bend, number: index + 1 }));

  return {
    bends: all,
    added: all.find((bend) => bend.startM === added.startM),
  };
}

// ── Where a vehicle is on a road ────────────────────────────────────────

/**
 * A ghat road ready for locating vehicles: its line, the metre of each
 * point, and a box around it so far-away vehicles are skipped quickly.
 */
function prepareRoad(road) {
  const metres = measureLine(road.line);
  const lats = road.line.map(([lat]) => lat);
  const lons = road.line.map(([, lon]) => lon);

  return {
    ...road,
    metres,
    lengthM: metres[metres.length - 1],
    box: {
      south: Math.min(...lats) - 0.001,
      north: Math.max(...lats) + 0.001,
      west: Math.min(...lons) - 0.001,
      east: Math.max(...lons) + 0.001,
    },
  };
}

/**
 * Where a position is along a road: { metre, distanceM } to the nearest
 * point within `tolerance` metres, or null if it's not on the road.
 *
 * Where two arms of a hairpin are both close, the one nearest where the
 * vehicle was expected to be (`expectedMetre`) is chosen, so a few metres
 * of GPS error can't jump it to the other arm.
 */
function locateOnRoad(lat, lon, road, tolerance, expectedMetre = null) {
  const { box } = road;

  if (lat < box.south || lat > box.north || lon < box.west || lon > box.east) {
    return null;
  }

  const metresPerDegree = toRadians(1) * EARTH_RADIUS_M;
  const lonScale = Math.cos(toRadians(lat));
  const project = ([pointLat, pointLon]) => ({
    x: (pointLon - lon) * lonScale * metresPerDegree,
    y: (pointLat - lat) * metresPerDegree,
  });

  const candidates = [];

  for (let i = 0; i < road.line.length - 1; i++) {
    const a = project(road.line[i]);
    const b = project(road.line[i + 1]);

    // Quick skip for far segments
    if (
      Math.min(a.x, b.x) > tolerance ||
      Math.max(a.x, b.x) < -tolerance ||
      Math.min(a.y, b.y) > tolerance ||
      Math.max(a.y, b.y) < -tolerance
    ) {
      continue;
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lengthSquared));
    const distanceM = Math.hypot(a.x + t * dx, a.y + t * dy);

    if (distanceM <= tolerance) {
      candidates.push({
        distanceM,
        metre: road.metres[i] + t * (road.metres[i + 1] - road.metres[i]),
      });
    }
  }

  if (candidates.length === 0) return null;

  // Nearby pieces of road far apart by road, such as the two arms of a
  // hairpin, are separate stretches. Each stretch's nearest point is where
  // the vehicle would be on it.
  const stretches = [];

  for (const candidate of candidates) {
    const last = stretches[stretches.length - 1];

    if (last && candidate.metre - last.lastMetre <= tolerance * 2 + 10) {
      last.lastMetre = candidate.metre;
      if (candidate.distanceM < last.best.distanceM) last.best = candidate;
    } else {
      stretches.push({ lastMetre: candidate.metre, best: candidate });
    }
  }

  // The stretch nearest where it was expected, or else the nearest one
  const score =
    expectedMetre === null
      ? ({ best }) => best.distanceM
      : ({ best }) => Math.abs(best.metre - expectedMetre);

  return stretches.reduce((chosen, stretch) =>
    score(stretch) < score(chosen) ? stretch : chosen,
  ).best;
}

module.exports = {
  measureLine,
  pointAt,
  lineBetween,
  findHairpins,
  describeBends,
  prepareRoad,
  locateOnRoad,
  zoneAround,
  addBendAt,
  WAIT_BEFORE_M,
};
