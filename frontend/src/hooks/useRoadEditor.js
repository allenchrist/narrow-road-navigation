import { useEffect, useState } from "react";

import { adminFetch } from "../services/adminApi";

/**
 * The saved narrow roads, and marking or editing one on the map.
 */
export function useRoadEditor(map) {
  const [roads, setRoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [drawing, setDrawing] = useState(false);
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [roadName, setRoadName] = useState("");

  // ID of the saved road being edited
  const [editingRoadId, setEditingRoadId] = useState(null);

  useEffect(() => {
    loadRoads();
  }, []);

  async function loadRoads() {
    try {
      setLoading(true);
      setError("");

      const response = await adminFetch("/api/narrow-roads");

      // The login expired, and this page is about to close
      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load narrow roads");
      }

      const data = await response.json();

      setRoads(Array.isArray(data.roads) ? data.roads : []);
    } catch (err) {
      console.error("[Admin] Failed to load roads:", err);

      setError("Unable to load narrow roads");
    } finally {
      setLoading(false);
    }
  }

  function startDrawing() {
    setCurrentPolygon([]);
    setRoadName("");
    setEditingRoadId(null);
    setError("");
    setDrawing(true);
  }

  function addPoint(point) {
    setCurrentPolygon((previous) => [...previous, point]);
  }

  function undoLastPoint() {
    setCurrentPolygon((previous) => previous.slice(0, -1));
  }

  function cancelDrawing() {
    setDrawing(false);
    setCurrentPolygon([]);
    setRoadName("");
    setEditingRoadId(null);
    setError("");
  }

  function viewRoad(road) {
    map?.fitBounds(road.polygon, {
      padding: [80, 80],
      maxZoom: 18,
    });
  }

  function startEditingRoad(road) {
    setEditingRoadId(road.id);
    setRoadName(road.name);
    setCurrentPolygon(road.polygon.map((point) => [point[0], point[1]]));
    setError("");
    setDrawing(true);

    if (map && Array.isArray(road.polygon) && road.polygon.length > 0) {
      map.fitBounds(road.polygon, {
        padding: [50, 50],
      });
    }
  }

  async function saveRoad() {
    if (!roadName.trim()) {
      setError("Enter a name for the narrow road");
      return;
    }

    if (currentPolygon.length < 3) {
      setError("Mark at least 3 points to create the road boundary");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const isEditing = editingRoadId !== null;

      const url = isEditing
        ? `/api/narrow-roads/${editingRoadId}`
        : "/api/narrow-roads";

      const response = await adminFetch(url, {
        method: isEditing ? "PUT" : "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          name: roadName.trim(),
          polygon: currentPolygon,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to save narrow road");
      }

      if (isEditing) {
        setRoads((previous) =>
          previous.map((road) =>
            road.id === editingRoadId ? data.road : road
          )
        );
      } else {
        setRoads((previous) => [...previous, data.road]);
      }

      setDrawing(false);
      setCurrentPolygon([]);
      setRoadName("");
      setEditingRoadId(null);
    } catch (err) {
      console.error("[Admin] Failed to save road:", err);

      setError(err.message || "Failed to save narrow road");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoad(id) {
    const confirmed = window.confirm("Delete this narrow-road geofence?");

    if (!confirmed) return;

    try {
      const response = await adminFetch(`/api/narrow-roads/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete road");
      }

      setRoads((previous) => previous.filter((road) => road.id !== id));
    } catch (err) {
      console.error("[Admin] Failed to delete road:", err);

      setError(err.message || "Failed to delete road");
    }
  }

  return {
    roads,
    loading,
    saving,
    error,
    drawing,
    currentPolygon,
    roadName,
    setRoadName,
    editingRoadId,
    loadRoads,
    startDrawing,
    addPoint,
    undoLastPoint,
    cancelDrawing,
    viewRoad,
    startEditingRoad,
    saveRoad,
    deleteRoad,
  };
}
