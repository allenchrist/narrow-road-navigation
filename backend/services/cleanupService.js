const { pool } = require("../config/database");

// Rejected suggestions stay this long, in case the admin wants to look back
const REJECTED_KEEP_DAYS = 30;

/**
 * Deletes records nobody needs any more, so the database stays small on a
 * free plan: email codes that have expired, and suggestions rejected more
 * than a month ago. Approved suggestions are kept, as they record where each
 * road came from. Returns how many of each were deleted.
 */
async function cleanUpOldRecords() {
  const codes = await pool.query(
    "DELETE FROM email_codes WHERE expires_at < NOW();",
  );

  const rejected = await pool.query(
    `
    DELETE FROM narrow_road_suggestions
    WHERE status = 'REJECTED' AND reviewed_at < NOW() - $1 * INTERVAL '1 day';
    `,
    [REJECTED_KEEP_DAYS],
  );

  return {
    emailCodes: codes.rowCount,
    rejectedSuggestions: rejected.rowCount,
  };
}

module.exports = { cleanUpOldRecords, REJECTED_KEEP_DAYS };
