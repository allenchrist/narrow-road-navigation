const crypto = require("crypto");

const { pool } = require("../config/database");
const { loadNarrowRoads, createNarrowRoad } = require("./narrowRoadService");

function rowToSuggestion(row) {
  return {
    id: row.id,
    name: row.name,
    polygon: row.polygon,
    reason: row.reason,
    status: row.status,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at.toISOString(),
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
  };
}

// --------------------------------------------------
// Read suggestions
// --------------------------------------------------

async function getAllSuggestions() {
  const result = await pool.query(
    "SELECT * FROM narrow_road_suggestions ORDER BY submitted_at, id;",
  );

  return result.rows.map(rowToSuggestion);
}

async function getSuggestionById(id) {
  const result = await pool.query(
    "SELECT * FROM narrow_road_suggestions WHERE id = $1;",
    [id],
  );

  return result.rows[0] ? rowToSuggestion(result.rows[0]) : null;
}

// --------------------------------------------------
// Create suggestion
// --------------------------------------------------

async function createSuggestion({ name, polygon, reason, submittedBy }) {
  const result = await pool.query(
    `
    INSERT INTO narrow_road_suggestions (id, name, polygon, reason, submitted_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
    `,
    [
      `SUG_${crypto.randomUUID()}`,
      name.trim(),
      JSON.stringify(polygon),
      typeof reason === "string" ? reason.trim() : "",
      submittedBy,
    ],
  );

  const suggestion = rowToSuggestion(result.rows[0]);

  console.log(`[Suggestion Service] New suggestion created: ${suggestion.id}`);

  return suggestion;
}

// --------------------------------------------------
// Reject suggestion. Returns null if it was already reviewed.
// --------------------------------------------------

async function rejectSuggestion(id) {
  const result = await pool.query(
    `
    UPDATE narrow_road_suggestions
    SET status = 'REJECTED', reviewed_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status = 'PENDING'
    RETURNING *;
    `,
    [id],
  );

  return result.rows[0] ? rowToSuggestion(result.rows[0]) : null;
}

// --------------------------------------------------
// Approve suggestion and create its road together, so one
// cannot be saved without the other. Returns null if the
// suggestion was already reviewed.
// --------------------------------------------------

async function approveSuggestion(id) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updated = await client.query(
      `
      UPDATE narrow_road_suggestions
      SET status = 'APPROVED', reviewed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'PENDING'
      RETURNING *;
      `,
      [id],
    );

    if (updated.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const suggestion = rowToSuggestion(updated.rows[0]);

    const road = await createNarrowRoad(
      {
        name: suggestion.name,
        polygon: suggestion.polygon,
      },
      client,
    );

    await client.query("COMMIT");

    return { suggestion, road };
  } catch (error) {
    await client.query("ROLLBACK");

    // The road may already be in memory, so match it back to the database
    await loadNarrowRoads();

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getAllSuggestions,
  getSuggestionById,
  createSuggestion,
  rejectSuggestion,
  approveSuggestion,
};
