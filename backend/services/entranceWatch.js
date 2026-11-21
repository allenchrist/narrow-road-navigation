/**
 * Decides, over several GPS readings, whether a vehicle is at the entrance
 * of a narrow road: arriving on a road that leads to it, or waiting there.
 *
 * One reading can be off by several metres, so a moving vehicle has to get
 * closer over its last three readings to count. Once it counts, it keeps
 * counting while it slows down, waits or edges forward, and only stops
 * counting when it clearly drives away, leaves the road leading in, or
 * enters the narrow road.
 */

// A moving vehicle on a road leading in counts from this close
const ARRIVE_MOVING_M = 50;

// A stopped vehicle counts from this close, as waiting at the entrance
const ARRIVE_STOPPED_M = 20;

// Once counted, it keeps counting this close, so slowing to a stop a little
// further back doesn't drop it
const STAY_M = 55;

// At the end of a road whose connecting roads aren't known
const END_ARRIVE_M = 20;
const END_STAY_M = 25;

// Readings that must show it getting closer, how much closer overall, and
// how much any one reading may go back, as GPS wobbles
const READINGS = 3;
const CLOSER_BY_M = 2;
const WOBBLE_M = 0.5;

// Moving away by this much from its closest point means it's leaving
const AWAY_BY_M = 3;

// A vehicle that has just driven out of a road and stops nearby is leaving,
// not waiting to go in. It has to drive back towards the entrance to count.
const AFTER_LEAVING_MS = 30000;

function isClosing(distances) {
  if (distances.length < READINGS) return false;

  const recent = distances.slice(-READINGS);

  return (
    recent.every((d, i) => i === 0 || d <= recent[i - 1] + WOBBLE_M) &&
    recent[recent.length - 1] <= recent[0] - CLOSER_BY_M
  );
}

/**
 * The vehicle's entrance state after a new reading.
 *
 * previous: the vehicle's last { entranceHistory, atEntrances, leftRoadAt,
 * insideRoadIds }. candidates: entrances it's near now, from the geofence
 * check. insideRoadIds: roads it's inside now, whose entrances don't apply.
 */
function updateEntrances(previous, candidates, insideRoadIds, now) {
  const leftRoadAt = { ...(previous.leftRoadAt ?? {}) };

  for (const roadId of previous.insideRoadIds ?? []) {
    if (!insideRoadIds.includes(roadId)) {
      leftRoadAt[roadId] = now;
    }
  }

  // Old entries aren't needed once they can't matter
  for (const [roadId, time] of Object.entries(leftRoadAt)) {
    if (now - time >= AFTER_LEAVING_MS) delete leftRoadAt[roadId];
  }

  const entranceHistory = {};
  const atEntrances = {};

  for (const candidate of candidates) {
    const { roadId } = candidate;

    if (insideRoadIds.includes(roadId)) continue;

    const history = previous.entranceHistory?.[roadId];
    const distances = [
      ...(history?.entrance === candidate.entrance ? history.distances : []),
      candidate.distanceM,
    ].slice(-READINGS);

    entranceHistory[roadId] = { entrance: candidate.entrance, distances };

    const arriveM = candidate.onLane ? ARRIVE_MOVING_M : END_ARRIVE_M;
    const stayM = candidate.onLane ? STAY_M : END_STAY_M;
    const stopped = candidate.heading === null;
    const was = previous.atEntrances?.[roadId];

    if (was) {
      const closestM = Math.min(was.closestM, candidate.distanceM);
      const drivingAway =
        candidate.heading === "away" &&
        candidate.distanceM >= closestM + AWAY_BY_M;

      if (candidate.distanceM <= stayM && !drivingAway) {
        atEntrances[roadId] = { ...candidate, since: was.since, closestM };
      }

      continue;
    }

    const justLeft = leftRoadAt[roadId] !== undefined;

    const waiting =
      stopped && candidate.distanceM <= ARRIVE_STOPPED_M && !justLeft;

    const arriving =
      candidate.heading === "towards" &&
      candidate.distanceM <= arriveM &&
      isClosing(distances);

    if (waiting || arriving) {
      atEntrances[roadId] = {
        ...candidate,
        since: now,
        closestM: candidate.distanceM,
      };
    }
  }

  return { entranceHistory, atEntrances, leftRoadAt };
}

module.exports = {
  updateEntrances,
  ARRIVE_MOVING_M,
  ARRIVE_STOPPED_M,
  AFTER_LEAVING_MS,
};
