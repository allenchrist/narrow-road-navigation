require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { pool } = require("../config/database");

const ROADS_FILE = path.join(__dirname, "..", "data", "narrowRoads.json");

// Roads imported from map data. Roads added on the admin page have other
// IDs, so they are never touched.
const IMPORTED_PREFIX = "NR_OSM_";

/**
 * Replaces the imported roads in the database with those in
 * data/narrowRoads.json. Run it after the file changes, then restart the
 * server, which keeps the roads in memory.
 *
 * Shows what would change, and only changes it with --apply.
 */
async function replaceNarrowRoads(apply) {
  const roads = JSON.parse(fs.readFileSync(ROADS_FILE, "utf8"));

  if (!roads.every((road) => road.id.startsWith(IMPORTED_PREFIX))) {
    throw new Error(`Every road in the file must have an ID starting ${IMPORTED_PREFIX}`);
  }

  const { rows } = await pool.query(
    "SELECT id FROM narrow_roads WHERE id LIKE $1;",
    [`${IMPORTED_PREFIX}%`]
  );

  const { rows: [{ count: ownRoads }] } = await pool.query(
    "SELECT COUNT(*) FROM narrow_roads WHERE id NOT LIKE $1;",
    [`${IMPORTED_PREFIX}%`]
  );

  console.log(`Imported roads in the database now: ${rows.length}`);
  console.log(`Roads in ${path.basename(ROADS_FILE)}: ${roads.length}`);
  console.log(`Roads added on the admin page, kept as they are: ${ownRoads}`);

  if (!apply) {
    console.log("\nNothing changed. Run again with --apply to replace them.");
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM narrow_roads WHERE id LIKE $1;", [`${IMPORTED_PREFIX}%`]);

    for (const road of roads) {
      await client.query(
        `
        INSERT INTO narrow_roads (id, name, polygon, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5);
        `,
        [road.id, road.name, JSON.stringify(road.polygon), road.createdAt, road.updatedAt]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log(`\nReplaced ${rows.length} imported roads with ${roads.length}. Restart the server to use them.`);
}

replaceNarrowRoads(process.argv.includes("--apply"))
  .catch((error) => {
    console.error("[Database] Couldn't replace the roads:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
