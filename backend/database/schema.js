const { pool } = require("../config/database");

/**
 * Creates any missing tables. Safe to run on every server start:
 * nothing here changes or removes existing data.
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id VARCHAR(128) PRIMARY KEY,
      vehicle_id TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { ensureSchema };
