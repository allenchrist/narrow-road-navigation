import { useCallback, useEffect, useState } from "react";

import { adminFetch } from "../services/adminApi";

/**
 * The ghat roads for Mountain Mode and their hairpin bends, for the admin
 * page, with moving a waiting point and deleting a bend the map got wrong.
 */
export function useHillRoads() {
  const [roads, setRoads] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await adminFetch("/api/hill-roads");

      if (response.status === 401) return;
      if (!response.ok) throw new Error(`Server replied ${response.status}`);

      const data = await response.json();

      setRoads(Array.isArray(data.roads) ? data.roads : []);
      setError("");
    } catch (err) {
      console.error("[Admin] Failed to load ghat roads:", err);
      setError("Unable to load ghat roads");
    }
  }, []);

  useEffect(() => {
    // Loads once when the page opens
    load();
  }, [load]);

  async function change(path, options) {
    try {
      const response = await adminFetch(path, options);
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Couldn't save the change.");
        return;
      }

      setRoads((current) =>
        current.map((road) => (road.id === data.road.id ? data.road : road)),
      );
      setError("");
    } catch {
      setError("Can't reach the server. Try again in a moment.");
    }
  }

  function moveWaitingPoint(roadId, number, side, point) {
    return change(`/api/hill-roads/${roadId}/bends/${number}/wait`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side, point }),
    });
  }

  function deleteBend(roadId, number) {
    return change(`/api/hill-roads/${roadId}/bends/${number}`, {
      method: "DELETE",
    });
  }

  return { roads, error, moveWaitingPoint, deleteBend };
}
