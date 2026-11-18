/**
 * Cleaning up old records. Needs a test database, set up with db:init, in
 * DATABASE_URL. It adds its own rows and deletes them again.
 *
 * Usage:
 *   npm run test:cleanup
 */

require("dotenv").config();

const assert = require("assert");
const { pool } = require("../config/database");
const {
  cleanUpOldRecords,
  REJECTED_KEEP_DAYS,
} = require("../services/cleanupService");

const POLYGON = JSON.stringify([
  [11, 77],
  [11, 77.001],
  [11.001, 77.001],
]);

async function addSuggestion(id, status, reviewedDaysAgo) {
  await pool.query(
    `
    INSERT INTO narrow_road_suggestions (id, name, polygon, reason, status, reviewed_at)
    VALUES ($1, 'Cleanup test', $2, '', $3, NOW() - $4 * INTERVAL '1 day');
    `,
    [id, POLYGON, status, reviewedDaysAgo],
  );
}

async function exists(table, column, value) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM ${table} WHERE ${column} = $1;`,
    [value],
  );

  return rowCount > 0;
}

async function main() {
  // It adds and deletes rows, so it never runs against a real database such
  // as Neon, only one on this machine
  const host = new URL(process.env.DATABASE_URL ?? "postgres://none").hostname;

  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    throw new Error(
      "This test only runs against a database on this machine, not the real one.",
    );
  }

  const old = REJECTED_KEEP_DAYS + 5;

  await addSuggestion("CLEANUP_OLD_REJECTED", "REJECTED", old);
  await addSuggestion("CLEANUP_NEW_REJECTED", "REJECTED", 2);
  await addSuggestion("CLEANUP_OLD_APPROVED", "APPROVED", old);

  await pool.query(
    `
    INSERT INTO email_codes (email, purpose, code_hash, payload, attempts, expires_at, last_sent_at)
    VALUES
      ('cleanup-expired@example.com', 'signup', 'x', '{}', 0, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours'),
      ('cleanup-current@example.com', 'signup', 'x', '{}', 0, NOW() + INTERVAL '5 minutes', NOW());
    `,
  );

  const { emailCodes, rejectedSuggestions } = await cleanUpOldRecords();

  const checks = {
    "an expired email code is deleted": !(await exists(
      "email_codes",
      "email",
      "cleanup-expired@example.com",
    )),
    "a code still in use is kept": await exists(
      "email_codes",
      "email",
      "cleanup-current@example.com",
    ),
    "a suggestion rejected long ago is deleted": !(await exists(
      "narrow_road_suggestions",
      "id",
      "CLEANUP_OLD_REJECTED",
    )),
    "a recently rejected suggestion is kept": await exists(
      "narrow_road_suggestions",
      "id",
      "CLEANUP_NEW_REJECTED",
    ),
    "approved suggestions are always kept": await exists(
      "narrow_road_suggestions",
      "id",
      "CLEANUP_OLD_APPROVED",
    ),
    "it says what it deleted": emailCodes >= 1 && rejectedSuggestions >= 1,
  };

  // Leaves the database as it was
  await pool.query(
    "DELETE FROM narrow_road_suggestions WHERE id LIKE 'CLEANUP_%';",
  );
  await pool.query("DELETE FROM email_codes WHERE email LIKE 'cleanup-%';");

  let failed = 0;

  for (const [name, passed] of Object.entries(checks)) {
    console.log(`  ${passed ? "✓" : "✗"} ${name}`);
    if (!passed) failed++;
  }

  console.log(
    `\n  ${Object.keys(checks).length - failed} passed, ${failed} failed`,
  );

  assert.strictEqual(failed, 0);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
