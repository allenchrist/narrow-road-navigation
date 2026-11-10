const { pool } = require("../config/database");

async function registerUser(username, email, passwordHash, vehicleType) {
  const result = await pool.query(
    `
    INSERT INTO users (username, email, password_hash, vehicle_type)
    VALUES ($1, $2, $3, $4)
    RETURNING id, username, email, vehicle_type, created_at;
    `,
    [username, email, passwordHash, vehicleType],
  );

  return result.rows[0];
}

async function findUserByUsername(username) {
  const result = await pool.query(
    `
    SELECT id, username, email, password_hash, device_id, vehicle_type, session_version
    FROM users
    WHERE username = $1;
    `,
    [username],
  );

  return result.rows[0] || null;
}

/**
 * Phone keyboards often capitalise the first letter, so a login ignores
 * capitals. Older accounts might differ only by capitals, so an exact match wins.
 */
async function findUserForLogin(username) {
  const result = await pool.query(
    `
    SELECT id, username, email, password_hash, device_id, vehicle_type, session_version
    FROM users
    WHERE LOWER(username) = LOWER($1)
    ORDER BY id;
    `,
    [username],
  );

  return (
    result.rows.find((user) => user.username === username) ??
    result.rows[0] ??
    null
  );
}

// Accounts that differ only by capital letters would be easy to confuse
async function isUsernameTaken(username) {
  const result = await pool.query(
    "SELECT 1 FROM users WHERE LOWER(username) = LOWER($1);",
    [username],
  );

  return result.rowCount > 0;
}

async function isEmailTaken(email) {
  const result = await pool.query(
    "SELECT 1 FROM users WHERE LOWER(email) = LOWER($1);",
    [email],
  );

  return result.rowCount > 0;
}

// Find a user using the Android device UUID
async function findUserByDeviceId(deviceId) {
  const result = await pool.query(
    `
    SELECT id, username, email, device_id, vehicle_type
    FROM users
    WHERE device_id = $1;
    `,
    [deviceId],
  );

  return result.rows[0] || null;
}

/**
 * Makes this the account's phone, replacing any phone it had. If another
 * account was using this phone, it loses the link. Both changes are saved
 * together. Returns the updated user and the other account's username, if any.
 */
async function linkDeviceToUser(userId, deviceId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const previousOwner = await client.query(
      `
      UPDATE users
      SET device_id = NULL
      WHERE device_id = $1 AND id <> $2
      RETURNING username;
      `,
      [deviceId, userId],
    );

    const updated = await client.query(
      `
      UPDATE users
      SET device_id = $1
      WHERE id = $2
      RETURNING id, username, email, device_id;
      `,
      [deviceId, userId],
    );

    await client.query("COMMIT");

    return {
      user: updated.rows[0],
      previousOwner: previousOwner.rows[0]?.username ?? null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Only removes the link if this is still the account's phone, so a phone
 * that was already replaced can't unlink the new one. Returns whether it did.
 */
async function unlinkDeviceFromUser(userId, deviceId) {
  const result = await pool.query(
    `
    UPDATE users
    SET device_id = NULL
    WHERE id = $1 AND device_id = $2;
    `,
    [userId, deviceId],
  );

  return result.rowCount > 0;
}

async function findUserByEmail(email) {
  const result = await pool.query(
    `
    SELECT id, username, email, device_id
    FROM users
    WHERE LOWER(email) = LOWER($1);
    `,
    [email.trim()],
  );

  return result.rows[0] || null;
}

/**
 * Whether a login token is still valid for its account. False if the
 * account was deleted, or its password has changed since the token was made.
 */
async function isSessionCurrent({ username, sv = 0 }) {
  const result = await pool.query(
    "SELECT session_version FROM users WHERE username = $1;",
    [username],
  );

  return result.rows[0]?.session_version === sv;
}

async function updatePassword(userId, passwordHash) {
  await pool.query(
    `
    UPDATE users
    SET password_hash = $1, session_version = session_version + 1
    WHERE id = $2;
    `,
    [passwordHash, userId],
  );
}

// The driver's name also comes off any suggestions they sent
async function deleteUser(user) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "UPDATE narrow_road_suggestions SET submitted_by = NULL WHERE submitted_by = $1;",
      [user.username],
    );

    await client.query("DELETE FROM users WHERE id = $1;", [user.id]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateVehicleType(userId, vehicleType) {
  await pool.query("UPDATE users SET vehicle_type = $1 WHERE id = $2;", [
    vehicleType,
    userId,
  ]);
}

module.exports = {
  registerUser,
  updateVehicleType,
  findUserByUsername,
  findUserByEmail,
  isSessionCurrent,
  updatePassword,
  deleteUser,
  findUserForLogin,
  isUsernameTaken,
  isEmailTaken,
  findUserByDeviceId,
  linkDeviceToUser,
  unlinkDeviceFromUser,
};
