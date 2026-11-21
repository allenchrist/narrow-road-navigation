const fs = require("fs");
const path = require("path");

const { pool } = require("../config/database");
const { locateOnRoad, pointAt, prepareRoad } = require("./hillRoads");

const SAVED_FILE = path.join(__dirname, "..", "data", "hillRoads.json");

// A waiting point the admin moves must stay on the road, this close to it
const SNAP_M = 30;

// Ghat roads, kept in memory as every GPS position is checked against them
let roads = [];

const rowToRoad = (row) =>
  prepareRoad({ id: row.id, name: row.name, line: row.line, bends: row.bends });

/**
 * Copies ghat roads from data/hillRoads.json that aren't in the database
 * yet, then loads them all. Roads already there are left alone, so bends the
 * admin has changed are kept.
 */
async function loadHillRoads() {
  let saved = [];

  try {
    saved = JSON.parse(fs.readFileSync(SAVED_FILE, "utf8"));
  } catch (error) {
    console.error("[Mountain] Couldn't read the ghat roads:", error.message);
  }

  for (const road of saved) {
    await pool.query(
      `
      INSERT INTO hill_roads (id, name, line, bends)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING;
      `,
      [
        road.id,
        road.name,
        JSON.stringify(road.line),
        JSON.stringify(road.bends),
      ],
    );
  }

  const { rows } = await pool.query("SELECT * FROM hill_roads ORDER BY id;");

  roads = rows.map(rowToRoad);

  return roads;
}

function getHillRoads() {
  return roads;
}

function getHillRoadById(id) {
  return roads.find((road) => road.id === id) ?? null;
}

async function saveBends(road, bends) {
  const result = await pool.query(
    `
    UPDATE hill_roads SET bends = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
    `,
    [road.id, JSON.stringify(bends)],
  );

  const updated = rowToRoad(result.rows[0]);

  roads = roads.map((existing) =>
    existing.id === road.id ? updated : existing,
  );

  return updated;
}

/**
 * Moves one of a bend's waiting points, on the side given ("below" or
 * "above"), to the nearest point on the road. It has to stay on its own side
 * of the bend. Returns the road, or an error message.
 */
async function moveWaitingPoint(roadId, number, side, [lat, lon]) {
  const road = getHillRoadById(roadId);
  const bend = road?.bends.find((existing) => existing.number === number);

  if (!bend) return { error: "Bend not found." };

  const onRoad = locateOnRoad(lat, lon, road, SNAP_M, bend.startM);

  if (!onRoad) return { error: "A waiting point has to be on the road." };

  const metre = Math.round(onRoad.metre);

  if (side === "below" ? metre >= bend.startM : metre <= bend.endM) {
    return { error: "A waiting point has to be before the bend, on its side." };
  }

  const point = pointAt(road.line, road.metres, metre);

  const bends = road.bends.map((existing) =>
    existing === bend
      ? {
          ...existing,
          ...(side === "below"
            ? { waitBelowM: metre, waitBelow: point }
            : { waitAboveM: metre, waitAbove: point }),
        }
      : existing,
  );

  return { road: await saveBends(road, bends) };
}

/**
 * Deletes a bend the map got wrong. The bends above it move down a number,
 * so they stay numbered from the bottom.
 */
async function deleteBend(roadId, number) {
  const road = getHillRoadById(roadId);

  if (!road?.bends.some((bend) => bend.number === number)) {
    return { error: "Bend not found." };
  }

  const bends = road.bends
    .filter((bend) => bend.number !== number)
    .map((bend, index) => ({ ...bend, number: index + 1 }));

  return { road: await saveBends(road, bends) };
}

module.exports = {
  loadHillRoads,
  getHillRoads,
  getHillRoadById,
  moveWaitingPoint,
  deleteBend,
};
