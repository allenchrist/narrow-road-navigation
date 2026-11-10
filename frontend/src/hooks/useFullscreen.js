import { useEffect, useState } from "react";

/**
 * Full screen for as long as the dashboard is open. Pressing Esc also leaves
 * it, so the state comes from the browser. `supported` is false on phones
 * that don't allow it, such as iPhones.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() =>
    Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", onChange);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  function toggleFullscreen() {
    const change = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();

    // The browser refused, so the button stays as it was
    change.catch(() => {});
  }

  return {
    supported: Boolean(document.fullscreenEnabled),
    isFullscreen,
    toggleFullscreen,
  };
}
