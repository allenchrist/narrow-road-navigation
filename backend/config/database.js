const { Pool } = require("pg");

/**
 * sslmode in the address would override the ssl setting below, and the
 * pg library warns that its meaning is changing, so it's removed here.
 */
function withoutSslMode(connectionString) {
  if (!connectionString) {
    return connectionString;
  }

  const url = new URL(connectionString);

  url.searchParams.delete("sslmode");

  return url.toString();
}

const pool = new Pool({
  connectionString: withoutSslMode(process.env.DATABASE_URL),

  // Neon can take a few seconds to wake after being idle
  connectionTimeoutMillis: 15000,

  // Encrypted, and checks the server really is who it claims to be
  ssl: {
    rejectUnauthorized: true,
  },
});

pool.on("error", (err) => {
  console.error("[Database] Unexpected PostgreSQL error:", err);
});

module.exports = {
  pool,
};
