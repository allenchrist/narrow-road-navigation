/**
 * Signup rules, road text rules and rate limits.
 * Needs no running server or database.
 *
 * Usage:
 *   npm run test:validation
 */

const assert = require("assert");
const { validateRegistration } = require("../utils/validateAccount");
const { isValidRoadName, isValidReason } = require("../utils/validateRoadText");
const { createRateLimiter, getClientIp } = require("../utils/rateLimit");

const good = {
  username: "allenchrist",
  email: "allen@example.com",
  password: "password1",
};

const errorFor = (changes) =>
  validateRegistration({ ...good, ...changes }).error;

const tests = {
  "a normal account is accepted and trimmed": () => {
    const account = validateRegistration({ ...good, username: " allen ", email: " a@b.co " });
    assert.strictEqual(account.error, undefined);
    assert.strictEqual(account.username, "allen");
    assert.strictEqual(account.email, "a@b.co");
  },
  "short or invalid passwords are refused": () => {
    assert.ok(errorFor({ password: "1234567" }));
    assert.ok(errorFor({ password: 12345678 }));
    assert.ok(errorFor({ password: "x".repeat(73) }));
  },
  "invalid emails are refused": () => {
    assert.ok(errorFor({ email: "not-an-email" }));
    assert.ok(errorFor({ email: "a@b" }));
    assert.ok(errorFor({ email: `${"x".repeat(250)}@b.com` }));
  },
  "usernames that would break the dashboard address are refused": () => {
    for (const username of ["a/b", "..", "ab", "has space", "x".repeat(51), ".hidden", "a?b"]) {
      assert.ok(errorFor({ username }), username);
    }
  },
  "reserved usernames are refused in any capitalisation": () => {
    assert.ok(errorFor({ username: "admin" }));
    assert.ok(errorFor({ username: "ADMIN" }));
    assert.ok(errorFor({ username: "Socket.io" }));
  },
  "the simulator's demo account is still allowed": () => {
    assert.strictEqual(errorFor({ username: "sim_car_a" }), undefined);
  },
  "road names and reasons have length limits": () => {
    assert.ok(isValidRoadName("Kumarapalayam Road"));
    assert.ok(!isValidRoadName("   "));
    assert.ok(!isValidRoadName(5));
    assert.ok(!isValidRoadName("x".repeat(101)));
    assert.ok(isValidReason(undefined));
    assert.ok(isValidReason("x".repeat(500)));
    assert.ok(!isValidReason("x".repeat(501)));
  },
  "the rate limiter blocks at the limit, per key": () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60000 });
    limiter.record("a");
    assert.ok(!limiter.isBlocked("a"));
    limiter.record("a");
    assert.ok(limiter.isBlocked("a"));
    assert.ok(!limiter.isBlocked("b"));
  },
  "the rate limiter allows again after the window": () => {
    const limiter = createRateLimiter({ max: 1, windowMs: -1 });
    limiter.record("a");
    assert.ok(!limiter.isBlocked("a"));
  },
  "the client address comes from the proxy header when present": () => {
    assert.strictEqual(
      getClientIp({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }, socket: {} }),
      "1.2.3.4"
    );
    assert.strictEqual(
      getClientIp({ headers: {}, socket: { remoteAddress: "9.9.9.9" } }),
      "9.9.9.9"
    );
  },
};

let failed = 0;

for (const [name, test] of Object.entries(tests)) {
  try {
    test();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}: ${error.message}`);
  }
}

console.log(`\n  ${Object.keys(tests).length - failed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
