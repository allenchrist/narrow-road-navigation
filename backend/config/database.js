const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Neon can take a few seconds to wake after being idle
  connectionTimeoutMillis: 15000,

  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  console.error("[Database] Unexpected PostgreSQL error:", err);
});

async function testDatabaseConnection() {
  try {
    const result = await pool.query("SELECT NOW()");

    console.log(
      `[Database] PostgreSQL connected successfully at ${result.rows[0].now}`
    );

    return true;
  } catch (error) {
    console.error(
      "[Database] PostgreSQL connection failed:",
      error.message
    );

    return false;
  }
}

module.exports = {
  pool,
  testDatabaseConnection,
};