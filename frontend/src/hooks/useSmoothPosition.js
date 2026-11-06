import { useEffect, useRef, useState } from "react";

// A stopped phone's GPS wanders by a few metres. Within its reported
// accuracy, between these limits, a stopped vehicle stays where it is.
const MIN_HOLD_M = 3;
const MAX_HOLD_M = 12;
const DEFAULT_HOLD_M = 8;

// Each move lasts about as long as the gap since the last position, so a
// vehicle glides steadily instead of jumping and then waiting
const MIN_GLIDE_MS = 300;
const MAX_GLIDE_MS = 1200;

// After a longer gap, gliding would show an old route, so it jumps instead
const MAX_GAP_TO_GLIDE_MS = 5000;

const METRES_PER_DEGREE = 111320;

function metresBetween([latA, lonA], [latB, lonB]) {
  const north = (latB - latA) * METRES_PER_DEGREE;
  const east =
    (lonB - lonA) * METRES_PER_DEGREE * Math.cos((latA * Math.PI) / 180);

  return Math.hypot(north, east);
}

/**
 * The position to show: it follows every update while moving, but a
 * stopped vehicle only moves if its position changes by more than GPS
 * error. The same array is returned until it moves, so it can be a
 * dependency.
 */
export function useSteadyTarget(lat, lon, moving, accuracy) {
  const target = useRef(null);

  if (lat !== null && lon !== null) {
    const next = [lat, lon];
    const hold = Math.min(
      MAX_HOLD_M,
      Math.max(MIN_HOLD_M, accuracy ?? DEFAULT_HOLD_M)
    );

    if (
      !target.current ||
      moving ||
      metresBetween(target.current, next) > hold
    ) {
      target.current = next;
    }
  }

  return target.current;
}

/**
 * Glides from where the vehicle is shown to each new target, at a steady
 * speed, so it moves continuously between GPS updates.
 */
export function useSmoothPosition(target) {
  const [shown, setShown] = useState(target);

  const shownRef = useRef(target);
  const lastTargetAt = useRef(null);

  useEffect(() => {
    if (!target) {
      return;
    }

    const startedAt = performance.now();
    const gap = lastTargetAt.current === null ? null : startedAt - lastTargetAt.current;
    const from = shownRef.current;

    lastTargetAt.current = startedAt;

    const jump = !from || gap === null || gap > MAX_GAP_TO_GLIDE_MS;
    const duration = Math.min(MAX_GLIDE_MS, Math.max(MIN_GLIDE_MS, gap ?? 0));

    let frame;

    function step(now) {
      const progress = jump ? 1 : Math.min((now - startedAt) / duration, 1);

      const position = [
        from?.[0] + (target[0] - from?.[0]) * progress,
        from?.[1] + (target[1] - from?.[1]) * progress,
      ];

      shownRef.current = jump ? target : position;
      setShown(shownRef.current);

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    }

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

/**
 * An angle that turns the short way, so 350° to 10° doesn't spin all the
 * way round. Stays where it was while there is no angle.
 */
export function useTurnAngle(degrees) {
  const angle = useRef(degrees ?? 0);

  if (degrees !== null && degrees !== undefined) {
    const change = ((((degrees - angle.current) % 360) + 540) % 360) - 180;

    angle.current += change;
  }

  return angle.current;
}
