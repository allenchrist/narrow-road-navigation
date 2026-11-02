const { pool } = require("../config/database");

// Telemetry checks every road on each GPS packet, so all roads are kept
// in memory. PostgreSQL is the permanent copy: every change is written
// there first, then applied here.
let cachedRoads = [];

function rowToRoad(row) {
  return {
    id: row.id,
    name: row.name,
    polygon: row.polygon,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// --------------------------------------------------
// Load all narrow roads into memory
// --------------------------------------------------

async function loadNarrowRoads() {
  const result = await pool.query(
    "SELECT * FROM narrow_roads ORDER BY created_at, id;"
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
  return cachedRoads.find(
    (road) => road.id === id
  ) || null;
}

// --------------------------------------------------
// Create narrow road
//
// db lets a caller include this in its own transaction.
// --------------------------------------------------

async function createNarrowRoad(
  { name, polygon },
  db = pool
) {
  const result = await db.query(
    `
    INSERT INTO narrow_roads (id, name, polygon)
    VALUES ($1, $2, $3)
    RETURNING *;
    `,
    [
      `NR_${Date.now()}`,
      String(name).trim(),
      JSON.stringify(polygon),
    ]
  );

  const road = rowToRoad(result.rows[0]);

  cachedRoads = [...cachedRoads, road];

  console.log(
    `[Narrow Road] Created ${road.id}: ${road.name}`
  );

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
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
    `,
    [
      id,
      name === undefined ? null : String(name).trim(),
      polygon === undefined ? null : JSON.stringify(polygon),
    ]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const road = rowToRoad(result.rows[0]);

  cachedRoads = cachedRoads.map((existing) =>
    existing.id === id ? road : existing
  );

  console.log(
    `[Narrow Road] Updated ${id}`
  );

  return road;
}

// --------------------------------------------------
// Delete narrow road
// --------------------------------------------------

async function deleteNarrowRoad(id) {
  const result = await pool.query(
    "DELETE FROM narrow_roads WHERE id = $1;",
    [id]
  );

  if (result.rowCount === 0) {
    return false;
  }

  cachedRoads = cachedRoads.filter(
    (road) => road.id !== id
  );

  console.log(
    `[Narrow Road] Deleted ${id}`
  );

  return true;
}

module.exports = {
  loadNarrowRoads,
  getAllNarrowRoads,
  getNarrowRoadById,
  createNarrowRoad,
  updateNarrowRoad,
  deleteNarrowRoad,
};
