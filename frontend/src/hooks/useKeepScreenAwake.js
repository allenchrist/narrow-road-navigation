import { useEffect } from "react";

/**
 * Stops the screen dimming or locking during a drive, so alerts stay visible.
 * The browser drops this whenever the page is hidden, so it's requested again
 * on return. Browsers that can't do this, or sites without https, carry on
 * as normal with the screen's usual timeout.
 */
export function useKeepScreenAwake() {
  useEffect(() => {
    if (!navigator.wakeLock) {
      return;
    }

    let wakeLock = null;
    let stopped = false;

    async function keepAwake() {
      if (document.visibilityState !== "visible" || wakeLock) {
        return;
      }

      try {
        const lock = await navigator.wakeLock.request("screen");

        if (stopped) {
          lock.release();
          return;
        }

        wakeLock = lock;

        lock.addEventListener("release", () => {
          wakeLock = null;
        });
      } catch {
        // Refused, for example on low battery. Tried again on return.
      }
    }

    keepAwake();

    document.addEventListener("visibilitychange", keepAwake);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", keepAwake);
      wakeLock?.release();
    };
  }, []);
}
