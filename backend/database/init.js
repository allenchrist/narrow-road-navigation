require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { pool } = require("../config/database");
const { ensureSchema } = require("./schema");

const DATA_DIR = path.join(__dirname, "..", "data");

// The real roads are too short for the two-car simulator, so the tests and
// demos use their own, long and straight enough to drive through
const ROADS_FILE = process.argv.includes("--simulator-roads")
  ? "../test/fixtures/simulatorRoads.json"
  : "narrowRoads.json";

function readJsonFile(fileName) {
  const filePath = path.resolve(DATA_DIR, fileName);

  return fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : [];
}

/**
 * Copies roads and suggestions from the old JSON files. Rows that already
 * exist are left alone, so edits made on the admin page are kept. Run this
 * only once: a road deleted since the last run would be imported again.
 */
async function importJsonData() {
  let roadCount = 0;
  let suggestionCount = 0;

  for (const road of readJsonFile(ROADS_FILE)) {
    const result = await pool.query(
      `
      INSERT INTO narrow_roads (id, name, polygon, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING;
      `,
      [
        road.id,
        road.name,
        JSON.stringify(road.polygon),
        road.createdAt,
        road.updatedAt,
      ],
    );

    roadCount += result.rowCount;
  }

  for (const suggestion of readJsonFile("narrowRoadSuggestions.json")) {
    const result = await pool.query(
      `
      INSERT INTO narrow_road_suggestions
        (id, name, polygon, reason, status, submitted_at, reviewed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
      `,
      [
        suggestion.id,
        suggestion.name,
        JSON.stringify(suggestion.polygon),
        suggestion.reason || "",
        suggestion.status,
        suggestion.submittedAt,
        suggestion.reviewedAt,
      ],
    );

    suggestionCount += result.rowCount;
  }

  console.log(
    `[Database] Imported ${roadCount} roads and ${suggestionCount} suggestions.`,
  );
}

async function initializeDatabase() {
  try {
    console.log("[Database] Initializing database...");

    await ensureSchema();
    await importJsonData();

    console.log("[Database] Tables are ready.");
  } catch (error) {
    console.error("[Database] Failed to initialize database:", error.message);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initializeDatabase();
