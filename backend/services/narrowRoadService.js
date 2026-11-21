const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const config = require("../config/config");
const { pool } = require("../config/database");
const {
  downloadWays,
  findEntrances,
  shapeEndEntrances,
} = require("./roadEntrances");

// OpenStreetMap is a free service, so roads are looked up one at a time
const LOOKUP_GAP_MS = 3000;

// When it can't be reached, it's tried again this much later
const LOOKUP_RETRY_MS = 30 * 60 * 1000;

const SAVED_ROADS_FILE = path.join(__dirname, "..", "data", "narrowRoads.json");

// Telemetry checks every road on each GPS packet, so all roads are kept
// in memory. PostgreSQL is the permanent copy: every change is written
// there first, then applied here.
let cachedRoads = [];

// Until a road's entrances are looked up, the two ends of its shape are used
function rowToRoad(row) {
  return {
    id: row.id,
    name: row.name,
    polygon: row.polygon,
    entrances: row.entrances ?? shapeEndEntrances(row.polygon),
    entrancesFound: Boolean(row.entrances),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const replaceCachedRoad = (road) => {
  cachedRoads = cachedRoads.map((existing) =>
    existing.id === road.id ? road : existing,
  );
};

// ── Looking up entrances ────────────────────────────────────────────────

let lookingUp = false;
let retryTimer = null;

// Entrances worked out ahead of time by tools/findRoadEntrances.js, as
// roadId → { polygon, entrances }
let savedEntrances = null;

/**
 * A road's entrances from data/narrowRoads.json, if they were worked out for
 * this exact shape. Saves asking OpenStreetMap for every imported road.
 */
function savedEntrancesFor(road) {
  if (!savedEntrances) {
    savedEntrances = new Map();

    try {
      const saved = JSON.parse(fs.readFileSync(SAVED_ROADS_FILE, "utf8"));

      for (const { id, polygon, entrances } of saved) {
        if (Array.isArray(entrances)) {
          savedEntrances.set(id, {
            polygon: JSON.stringify(polygon),
            entrances,
          });
        }
      }
    } catch (error) {
      console.error(
        "[Narrow Road] Couldn't read saved entrances:",
        error.message,
      );
    }
  }

  const saved = savedEntrances.get(road.id);

  return saved && saved.polygon === JSON.stringify(road.polygon)
    ? saved.entrances
    : null;
}

/**
 * Finds the entrances of every road that doesn't have them yet, such as a
 * road just added, one at a time: from those saved with the imported roads,
 * or else from OpenStreetMap. If OpenStreetMap can't be reached, the shape's
 * ends are kept and it tries again later.
 */
async function findMissingEntrances() {
  if (lookingUp) return;

  lookingUp = true;
  clearTimeout(retryTimer);

  // Roads that changed in the database while being looked up, or can't be
  // looked up now, left for the next run rather than tried again and again
  const skipped = new Set();

  try {
    let road;

    while (
      (road = cachedRoads.find(
        (existing) => !existing.entrancesFound && !skipped.has(existing.id),
      ))
    ) {
      let entrances = savedEntrancesFor(road);
      const fromMap = !entrances;

      if (fromMap && !config.findEntrancesOnline) {
        skipped.add(road.id);
        continue;
      }

      if (fromMap) {
        entrances = findEntrances(
          road.polygon,
          await downloadWays(road.polygon),
        );
      }

      // Only if the shape hasn't changed while it was being looked up
      const result = await pool.query(
        `
        UPDATE narrow_roads SET entrances = $2
        WHERE id = $1 AND polygon = $3::jsonb
        RETURNING *;
        `,
        [road.id, JSON.stringify(entrances), JSON.stringify(road.polygon)],
      );

      if (result.rowCount > 0) {
        replaceCachedRoad(rowToRoad(result.rows[0]));

        if (fromMap) {
          console.log(
            `[Narrow Road] Found ${entrances.length} entrances for ${road.id}`,
          );
        }
      } else if (getNarrowRoadById(road.id) === road) {
        // Changed somewhere else. A road changed or deleted on the admin page
        // has already been replaced here, and is looked up in its turn.
        skipped.add(road.id);
      }

      if (fromMap) {
        await new Promise((resolve) => setTimeout(resolve, LOOKUP_GAP_MS));
      }
    }
  } catch (error) {
    console.error(
      "[Narrow Road] Couldn't look up entrances, trying again later:",
      error.message,
    );

    retryTimer = setTimeout(findMissingEntrances, LOOKUP_RETRY_MS);
    retryTimer.unref?.();
  } finally {
    lookingUp = false;
  }
}

// --------------------------------------------------
// Load all narrow roads into memory
// --------------------------------------------------

async function loadNarrowRoads() {
  const result = await pool.query(
    "SELECT * FROM narrow_roads ORDER BY created_at, id;",
  );

  cachedRoads = result.rows.map(rowToRoad);

  return cachedRoads;
}

// --------------------------------------------------
// Read narrow roads
// --------------------------------------------------

function getAllNarrowRoads() {
  return cachedRoads;
}

function getNarrowRoadById(id) {
  return cachedRoads.find((road) => road.id === id) || null;
}

// --------------------------------------------------
// Create narrow road
//
// db lets a caller include this in its own transaction.
// --------------------------------------------------

async function createNarrowRoad({ name, polygon }, db = pool) {
  const result = await db.query(
    `
    INSERT INTO narrow_roads (id, name, polygon)
    VALUES ($1, $2, $3)
    RETURNING *;
    `,
    [`NR_${crypto.randomUUID()}`, String(name).trim(), JSON.stringify(polygon)],
  );

  const road = rowToRoad(result.rows[0]);

  cachedRoads = [...cachedRoads, road];

  console.log(`[Narrow Road] Created ${road.id}: ${road.name}`);

  // After any transaction it's part of has finished
  setTimeout(findMissingEntrances, LOOKUP_GAP_MS).unref?.();

  return road;
}

// --------------------------------------------------
// Update narrow road
// --------------------------------------------------

async function updateNarrowRoad(id, { name, polygon }) {
  const result = await pool.query(
    `
    UPDATE narrow_roads
    SET
      name = COALESCE($2, name),
      polygon = COALESCE($3::jsonb, polygon),
      entrances = CASE WHEN $3::jsonb IS NULL THEN entrances ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
    `,
    [
      id,
      name === undefined ? null : String(name).trim(),
      polygon === undefined ? null : JSON.stringify(polygon),
    ],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const road = rowToRoad(result.rows[0]);

  replaceCachedRoad(road);

  console.log(`[Narrow Road] Updated ${id}`);

  // A new shape has new entrances
  if (!road.entrancesFound) {
    setTimeout(findMissingEntrances, LOOKUP_GAP_MS).unref?.();
  }

  return road;
}

// --------------------------------------------------
// Delete narrow road
// --------------------------------------------------

async function deleteNarrowRoad(id) {
  const result = await pool.query("DELETE FROM narrow_roads WHERE id = $1;", [
    id,
  ]);

  if (result.rowCount === 0) {
    return false;
  }

  cachedRoads = cachedRoads.filter((road) => road.id !== id);

  console.log(`[Narrow Road] Deleted ${id}`);

  return true;
}

module.exports = {
  loadNarrowRoads,
  getAllNarrowRoads,
  getNarrowRoadById,
  createNarrowRoad,
  updateNarrowRoad,
  deleteNarrowRoad,
  findMissingEntrances,
};
