const crypto = require("crypto");

const { pool } = require("../config/database");

const CODE_LIFETIME_MINUTES = 10;
const RESEND_WAIT_SECONDS = 60;

// Six digits can be guessed given enough tries, so a code only allows a few
const MAX_ATTEMPTS = 5;

function hashCode(email, purpose, code) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${purpose}:${email}:${code}`)
    .digest("hex");
}

const cleanEmail = (email) => email.trim().toLowerCase();

/**
 * Makes a new code, replacing any older one. Returns the code, or
 * waitSeconds if one was sent too recently.
 */
async function createCode(email, purpose, payload = {}) {
  const key = cleanEmail(email);

  await pool.query("DELETE FROM email_codes WHERE expires_at < NOW();");

  const recent = await pool.query(
    `
    SELECT CEIL(EXTRACT(EPOCH FROM (last_sent_at + $3 * INTERVAL '1 second' - NOW()))) AS wait
    FROM email_codes
    WHERE email = $1 AND purpose = $2 AND last_sent_at > NOW() - $3 * INTERVAL '1 second';
    `,
    [key, purpose, RESEND_WAIT_SECONDS]
  );

  if (recent.rows[0]) {
    return { waitSeconds: Number(recent.rows[0].wait) };
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");

  await pool.query(
    `
    INSERT INTO email_codes (email, purpose, code_hash, payload, attempts, expires_at, last_sent_at)
    VALUES ($1, $2, $3, $4, 0, NOW() + $5 * INTERVAL '1 minute', NOW())
    ON CONFLICT (email, purpose) DO UPDATE SET
      code_hash = EXCLUDED.code_hash,
      payload = EXCLUDED.payload,
      attempts = 0,
      expires_at = EXCLUDED.expires_at,
      last_sent_at = EXCLUDED.last_sent_at;
    `,
    [key, purpose, hashCode(key, purpose, code), JSON.stringify(payload), CODE_LIFETIME_MINUTES]
  );

  return { code };
}

/**
 * Returns { payload } for the right code, or { error } with a message to show.
 * The attempt is counted first, so requests sent together can't get extra tries.
 */
async function checkCode(email, purpose, code) {
  const key = cleanEmail(email);

  const result = await pool.query(
    `
    UPDATE email_codes
    SET attempts = attempts + 1
    WHERE email = $1 AND purpose = $2 AND attempts < $3 AND expires_at > NOW()
    RETURNING code_hash, payload;
    `,
    [key, purpose, MAX_ATTEMPTS]
  );

  const row = result.rows[0];

  if (!row) {
    return { error: "That code has expired. Ask for a new one." };
  }

  const expected = Buffer.from(row.code_hash);
  const actual = Buffer.from(hashCode(key, purpose, String(code)));

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { error: "That code isn't right. Check it and try again." };
  }

  return { payload: row.payload };
}

async function deleteCode(email, purpose) {
  await pool.query(
    "DELETE FROM email_codes WHERE email = $1 AND purpose = $2;",
    [cleanEmail(email), purpose]
  );
}

module.exports = {
  CODE_LIFETIME_MINUTES,
  createCode,
  checkCode,
  deleteCode,
};
