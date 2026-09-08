const { pool } = require("../config/database");

async function registerUser(username, email, passwordHash) {
  const result = await pool.query(
    `
    INSERT INTO users (username, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, username, email, created_at;
    `,
    [username, email, passwordHash]
  );

  return result.rows[0];
}

async function findUserByUsername(username) {
  const result = await pool.query(
    `
    SELECT id, username, email, password_hash
    FROM users
    WHERE username = $1;
    `,
    [username]
  );

  return result.rows[0] || null;
}

module.exports = {
  registerUser,
  findUserByUsername,
};