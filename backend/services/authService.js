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
    SELECT id, username, email, password_hash, device_id
    FROM users
    WHERE username = $1;
    `,
    [username]
  );

  return result.rows[0] || null;
}

// NEW: Find a user using the Android device UUID
async function findUserByDeviceId(deviceId) {
  const result = await pool.query(
    `
    SELECT id, username, email, device_id
    FROM users
    WHERE device_id = $1;
    `,
    [deviceId]
  );

  return result.rows[0] || null;
}

// NEW: Associate a device UUID with a user
async function associateDeviceWithUser(userId, deviceId) {
  const result = await pool.query(
    `
    UPDATE users
    SET device_id = $1
    WHERE id = $2
    RETURNING id, username, email, device_id;
    `,
    [deviceId, userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  registerUser,
  findUserByUsername,
  findUserByDeviceId,
  associateDeviceWithUser,
};