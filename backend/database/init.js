require("dotenv").config();

const { pool } = require("../config/database");

async function initializeDatabase() {
  try {
    console.log("[Database] Initializing database...");

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

    console.log("[Database] Users table is ready.");
  } catch (error) {
    console.error(
      "[Database] Failed to initialize database:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initializeDatabase();