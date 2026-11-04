const MAX_TRACKED_KEYS = 10000;

/**
 * Counts events per key (such as an IP address) over a rolling window.
 * Kept in memory, so counts reset when the server restarts.
 */
function createRateLimiter({ max, windowMs }) {
  const events = new Map();

  function recentEvents(key, now) {
    const recent = (events.get(key) || []).filter(
      (time) => now - time < windowMs
    );

    if (recent.length === 0) {
      events.delete(key);
    } else {
      events.set(key, recent);
    }

    return recent;
  }

  return {
    isBlocked(key) {
      return recentEvents(key, Date.now()).length >= max;
    },

    record(key) {
      const now = Date.now();
      const recent = recentEvents(key, now);

      // Stops a flood of different keys from using up memory
      if (events.size >= MAX_TRACKED_KEYS && recent.length === 0) {
        events.clear();
      }

      events.set(key, [...recent, now]);
    },
  };
}

/**
 * The client's address, behind Render's proxy. A client can fake this header
 * to dodge a per-address limit, so risky actions also have an overall limit.
 */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  return forwarded
    ? forwarded.split(",")[0].trim()
    : req.socket.remoteAddress;
}

module.exports = { createRateLimiter, getClientIp };
