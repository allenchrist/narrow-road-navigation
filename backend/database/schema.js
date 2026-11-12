const { pool } = require("../config/database");

/**
 * Creates any missing tables and columns. Safe to run on every server
 * start: nothing here changes or removes existing data.
 */
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(128);
  `);

  // Accounts from before vehicle types become cars
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS vehicle_type TEXT NOT NULL DEFAULT 'car';
  `);

  // The ambulance type was widened to every priority vehicle
  await pool.query(`
    UPDATE users SET vehicle_type = 'priority' WHERE vehicle_type = 'ambulance';
  `);

  // Raised when a password changes, which ends every older login
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_codes (
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      last_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (email, purpose)
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_device_id_unique
    ON users(device_id)
    WHERE device_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS narrow_roads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      polygon JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS narrow_road_suggestions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      polygon JSONB NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP WITH TIME ZONE
    );
  `);

  // Empty for suggestions sent before this was recorded
  await pool.query(`
    ALTER TABLE narrow_road_suggestions
    ADD COLUMN IF NOT EXISTS submitted_by TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id VARCHAR(128) PRIMARY KEY,
      vehicle_id TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { ensureSchema };
