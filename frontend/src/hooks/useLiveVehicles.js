import { useEffect, useState } from "react";

import { adminFetch } from "../services/adminApi";

// Often enough to follow a meeting, without loading the free server
const REFRESH_MS = 2000;

/**
 * Every connected vehicle, with its driver and alert, refreshed every two
 * seconds while the admin page is open.
 */
export function useLiveVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function refresh() {
      try {
        const response = await adminFetch("/api/admin/live");

        // The login expired, and this page is about to close
        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error(`Server replied ${response.status}`);
        }

        const data = await response.json();

        if (!cancelled) {
          setVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
          setError("");
        }
      } catch (err) {
        console.error("[Admin] Failed to load live vehicles:", err);

        if (!cancelled) {
          setError("Unable to load live vehicles");
        }
      }

      if (!cancelled) {
        timer = setTimeout(refresh, REFRESH_MS);
      }
    }

    refresh();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { vehicles, error };
}
