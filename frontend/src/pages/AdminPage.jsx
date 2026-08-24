import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  CircleMarker,
  useMapEvents,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

const BACKEND_URL = "http://localhost:5000";

// --------------------------------------------------
// Map click handler
// --------------------------------------------------

function DrawingLayer({ drawing, onPointAdded }) {
  useMapEvents({
    click(event) {
      if (!drawing) return;

      const { lat, lng } = event.latlng;

      onPointAdded([lat, lng]);
    },
  });

  return null;
}

// --------------------------------------------------
// Admin Page
// --------------------------------------------------

function AdminPage() {
  const [roads, setRoads] = useState([]);

  const [drawing, setDrawing] = useState(false);
  const [currentPolygon, setCurrentPolygon] = useState([]);

  const [roadName, setRoadName] = useState("");

  // ID of the road currently being edited
  const [editingRoadId, setEditingRoadId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  // --------------------------------------------------
  // Load saved narrow roads
  // --------------------------------------------------

  useEffect(() => {
    loadRoads();
  }, []);

  async function loadRoads() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${BACKEND_URL}/api/narrow-roads`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load narrow roads"
        );
      }

      const data = await response.json();

      setRoads(
        Array.isArray(data.roads)
          ? data.roads
          : []
      );
    } catch (err) {
      console.error(
        "[Admin] Failed to load roads:",
        err
      );

      setError(
        "Unable to load narrow roads"
      );
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Start drawing
  // --------------------------------------------------

  function startDrawing() {
    setCurrentPolygon([]);
    setRoadName("");
    setError("");
    setDrawing(true);
  }

  // --------------------------------------------------
  // Add point
  // --------------------------------------------------

  function addPoint(point) {
    setCurrentPolygon((prev) => [
      ...prev,
      point,
    ]);
  }

  // --------------------------------------------------
  // Cancel drawing
  // --------------------------------------------------

  function cancelDrawing() {
    setDrawing(false);
    setCurrentPolygon([]);
    setRoadName("");
    setEditingRoadId(null);
    setError("");
  }

  // --------------------------------------------------
  // Edit existing narrow road
  // --------------------------------------------------

  function startEditingRoad(road) {
    setEditingRoadId(road.id);
    setRoadName(road.name);
    setCurrentPolygon(
      road.polygon.map((point) => [point[0], point[1]])
    );
    setError("");
    setDrawing(true);
  }

  // --------------------------------------------------
  // Save polygon
  // --------------------------------------------------

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
        ? `${BACKEND_URL}/api/narrow-roads/${editingRoadId}`
        : `${BACKEND_URL}/api/narrow-roads`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
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
        setRoads((prev) =>
          prev.map((road) =>
            road.id === editingRoadId ? data.road : road
          )
        );
      } else {
        setRoads((prev) => [...prev, data.road]);
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

  // --------------------------------------------------
  // Delete road
  // --------------------------------------------------

  async function deleteRoad(id) {
    const confirmed =
      window.confirm(
        "Delete this narrow-road geofence?"
      );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/narrow-roads/${id}`,
        {
          method: "DELETE",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to delete road"
        );
      }

      setRoads((prev) =>
        prev.filter(
          (road) => road.id !== id
        )
      );
    } catch (err) {
      console.error(
        "[Admin] Failed to delete road:",
        err
      );

      setError(
        err.message ||
          "Failed to delete road"
      );
    }
  }

  return (
    <div className="admin-page">

      {/* ------------------------------------------------ */}
      {/* HEADER */}
      {/* ------------------------------------------------ */}

      <header className="admin-header">

        <div>
          <div className="admin-title">
            NARROW ROAD MANAGEMENT
          </div>

          <div className="admin-subtitle">
            ADMIN GEOFENCE CONTROL
          </div>
        </div>

        <div className="admin-actions">

          {!drawing ? (
            <button
              type="button"
              onClick={startDrawing}
              className="admin-primary-button"
            >
              + MARK NARROW ROAD
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={cancelDrawing}
                className="admin-secondary-button"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={saveRoad}
                disabled={
                  saving ||
                  currentPolygon.length < 3
                }
                className="admin-primary-button"
              >
                {saving
                  ? "SAVING..."
                  : editingRoadId
                  ? "UPDATE ROAD"
                  : "SAVE ROAD"}
              </button>
            </>
          )}

        </div>

      </header>

      {/* ------------------------------------------------ */}
      {/* CONTENT */}
      {/* ------------------------------------------------ */}

      <div className="admin-content">

        {/* MAP */}

        <div className="admin-map">

          <MapContainer
            center={[10.958, 76.956]}
            zoom={15}
            zoomControl={true}
            className="admin-leaflet-map"
          >

            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            <DrawingLayer
              drawing={drawing}
              onPointAdded={addPoint}
            />

            {/* Existing roads */}

            {roads.map((road) => (
              <Polygon
                key={road.id}
                positions={road.polygon}
                pathOptions={{
                  color: "#ff5c63",
                  weight: 3,
                  fillColor: "#ff5c63",
                  fillOpacity: 0.18,
                }}
              />
            ))}

            {/* Current drawing */}

            {currentPolygon.length >= 2 && (
              <Polyline
                positions={currentPolygon}
                pathOptions={{
                  color: "#56c7ff",
                  weight: 3,
                  dashArray: "8 6",
                }}
              />
            )}

            {/* Drawing points */}

            {currentPolygon.map(
              (point, index) => (
                <CircleMarker
                  key={index}
                  center={point}
                  radius={5}
                  pathOptions={{
                    color: "#56c7ff",
                    fillColor: "#56c7ff",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                />
              )
            )}

          </MapContainer>

          {/* Drawing instruction */}

          {drawing && (
            <div className="admin-drawing-help">

              <strong>
                MARKING NARROW ROAD
              </strong>

              <span>
                Click around the entire road
                boundary.
              </span>

              <span>
                Points:{" "}
                {currentPolygon.length}
              </span>

            </div>
          )}

        </div>

        {/* ------------------------------------------------ */}
        {/* SIDE PANEL */}
        {/* ------------------------------------------------ */}

        <aside className="admin-sidebar">

          <div className="admin-section-title">
            SAVED NARROW ROADS
          </div>

          {drawing && (
            <div className="admin-drawing-panel">

              <label>
                ROAD NAME
              </label>

              <input
                type="text"
                value={roadName}
                onChange={(event) =>
                  setRoadName(
                    event.target.value
                  )
                }
                placeholder="Example: College Road"
              />

              <div className="admin-point-count">
                {currentPolygon.length} points
              </div>

            </div>
          )}

          {error && (
            <div className="admin-error">
              {error}
            </div>
          )}

          {loading ? (
            <div className="admin-empty">
              Loading...
            </div>
          ) : roads.length === 0 ? (
            <div className="admin-empty">
              No narrow roads marked yet.
            </div>
          ) : (
            <div className="admin-road-list">

              {roads.map((road) => (
                <div
                  key={road.id}
                  className="admin-road-item"
                >

                  <div>
                    <strong>
                      {road.name}
                    </strong>

                    <span>
                      {road.polygon.length} boundary
                      points
                    </span>
                  </div>

                  <div className="admin-road-buttons">

                    <button
                      type="button"
                      onClick={() => startEditingRoad(road)}
                      className="admin-edit-button"
                    >
                      EDIT
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteRoad(road.id)}
                      className="admin-delete-button"
                    >
                      DELETE
                    </button>

                  </div>

                </div>
              ))}

            </div>
          )}

        </aside>

      </div>

    </div>
  );
}

export default AdminPage;