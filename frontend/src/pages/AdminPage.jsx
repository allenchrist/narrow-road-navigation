import { useEffect, useRef, useState } from "react";

import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

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
// Search controller
// --------------------------------------------------

function SearchController({ searchLocation }) {
  const map = useMap();

  useEffect(() => {
    if (!searchLocation) return;

    map.flyTo(
      [searchLocation.lat, searchLocation.lon],
      17,
      {
        duration: 1.2,
      }
    );
  }, [searchLocation, map]);

  return null;
}

// --------------------------------------------------
// Map controller
// --------------------------------------------------

function MapController({ onReady }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

// --------------------------------------------------
// Admin Page
// --------------------------------------------------

function AdminPage() {
  // --------------------------------------------------
  // Saved official narrow roads
  // --------------------------------------------------

  const [roads, setRoads] = useState([]);

  // --------------------------------------------------
  // User suggestions
  // --------------------------------------------------

  const [suggestions, setSuggestions] = useState([]);

  const [suggestionsLoading, setSuggestionsLoading] =
    useState(true);

  const [suggestionsError, setSuggestionsError] =
    useState("");

  // --------------------------------------------------
  // Drawing state
  // --------------------------------------------------

  const [drawing, setDrawing] = useState(false);

  const [currentPolygon, setCurrentPolygon] =
    useState([]);

  const [roadName, setRoadName] =
    useState("");

  // ID of official road currently being edited

  const [editingRoadId, setEditingRoadId] =
    useState(null);

  // --------------------------------------------------
  // General state
  // --------------------------------------------------

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  // --------------------------------------------------
  // Map
  // --------------------------------------------------

  const [map, setMap] =
    useState(null);

  // --------------------------------------------------
  // Search
  // --------------------------------------------------

  const [searchText, setSearchText] =
    useState("");

  const [searching, setSearching] =
    useState(false);

  const [searchLocation, setSearchLocation] =
    useState(null);

  const [searchError, setSearchError] =
    useState("");

  // --------------------------------------------------
  // Selected user suggestion
  // --------------------------------------------------

  const [selectedSuggestionId, setSelectedSuggestionId] =
    useState(null);

  const [reviewingSuggestionId, setReviewingSuggestionId] =
    useState(null);

  // --------------------------------------------------
  // Load everything
  // --------------------------------------------------

  useEffect(() => {
    loadRoads();
    loadSuggestions();
  }, []);

  // --------------------------------------------------
  // Load official narrow roads
  // --------------------------------------------------

  async function loadRoads() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/api/narrow-roads`
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
  // Load user suggestions
  // --------------------------------------------------

  async function loadSuggestions() {
    try {
      setSuggestionsLoading(true);
      setSuggestionsError("");

      const response = await fetch(
        `${API_URL}/api/narrow-road-suggestions`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load suggestions"
        );
      }

      const data = await response.json();

      setSuggestions(
        Array.isArray(data.suggestions)
          ? data.suggestions
          : []
      );

    } catch (err) {
      console.error(
        "[Admin] Failed to load suggestions:",
        err
      );

      setSuggestionsError(
        "Unable to load user suggestions"
      );

    } finally {
      setSuggestionsLoading(false);
    }
  }

  // --------------------------------------------------
  // Search location
  // --------------------------------------------------

  async function searchLocationOnMap() {
    const query = searchText.trim();

    if (!query) {
      setSearchError(
        "Enter a location to search"
      );
      return;
    }

    try {
      setSearching(true);
      setSearchError("");

      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?format=json&limit=1&q=${encodeURIComponent(
          query
        )}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          "Search request failed"
        );
      }

      const results =
        await response.json();

      if (
        !Array.isArray(results) ||
        results.length === 0
      ) {
        setSearchError(
          "Location not found"
        );
        return;
      }

      const result = results[0];

      const lat = Number(result.lat);
      const lon = Number(result.lon);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
      ) {
        setSearchError(
          "Invalid location returned"
        );
        return;
      }

      setSearchLocation({
        lat,
        lon,
      });

    } catch (err) {
      console.error(
        "[Admin] Location search failed:",
        err
      );

      setSearchError(
        "Unable to search location"
      );

    } finally {
      setSearching(false);
    }
  }

  // --------------------------------------------------
  // Search with Enter
  // --------------------------------------------------

  function handleSearchKeyDown(event) {
    if (event.key === "Enter") {
      searchLocationOnMap();
    }
  }

  // --------------------------------------------------
  // Start drawing official road
  // --------------------------------------------------

  function startDrawing() {
    setCurrentPolygon([]);
    setRoadName("");
    setEditingRoadId(null);
    setError("");
    setDrawing(true);
    setSelectedSuggestionId(null);
  }

  // --------------------------------------------------
  // Add polygon point
  // --------------------------------------------------

  function addPoint(point) {
    setCurrentPolygon((previous) => [
      ...previous,
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
  // Edit official road
  // --------------------------------------------------

  function startEditingRoad(road) {
    setEditingRoadId(road.id);

    setRoadName(road.name);

    setCurrentPolygon(
      road.polygon.map((point) => [
        point[0],
        point[1],
      ])
    );

    setError("");
    setDrawing(true);

    setSelectedSuggestionId(null);

    if (
      map &&
      Array.isArray(road.polygon) &&
      road.polygon.length > 0
    ) {
      map.fitBounds(
        road.polygon,
        {
          padding: [50, 50],
        }
      );
    }
  }

  // --------------------------------------------------
  // Save official road
  // --------------------------------------------------

  async function saveRoad() {
    if (!roadName.trim()) {
      setError(
        "Enter a name for the narrow road"
      );
      return;
    }

    if (currentPolygon.length < 3) {
      setError(
        "Mark at least 3 points to create the road boundary"
      );
      return;
    }

    try {
      setSaving(true);
      setError("");

      const isEditing =
        editingRoadId !== null;

      const url = isEditing
        ? `${API_URL}/api/narrow-roads/${editingRoadId}`
        : `${API_URL}/api/narrow-roads`;

      const response = await fetch(url, {
        method: isEditing
          ? "PUT"
          : "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          name: roadName.trim(),
          polygon: currentPolygon,
        }),
      });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to save narrow road"
        );
      }

      if (isEditing) {
        setRoads((previous) =>
          previous.map((road) =>
            road.id === editingRoadId
              ? data.road
              : road
          )
        );
      } else {
        setRoads((previous) => [
          ...previous,
          data.road,
        ]);
      }

      setDrawing(false);
      setCurrentPolygon([]);
      setRoadName("");
      setEditingRoadId(null);

    } catch (err) {
      console.error(
        "[Admin] Failed to save road:",
        err
      );

      setError(
        err.message ||
          "Failed to save narrow road"
      );

    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // Delete official road
  // --------------------------------------------------

  async function deleteRoad(id) {
    const confirmed =
      window.confirm(
        "Delete this narrow-road geofence?"
      );

    if (!confirmed) return;

    try {
      const response =
        await fetch(
          `${API_URL}/api/narrow-roads/${id}`,
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

      setRoads((previous) =>
        previous.filter(
          (road) =>
            road.id !== id
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

  // --------------------------------------------------
  // View user suggestion
  // --------------------------------------------------

  function viewSuggestion(suggestion) {
    setSelectedSuggestionId(
      suggestion.id
    );

    if (
      map &&
      Array.isArray(
        suggestion.polygon
      ) &&
      suggestion.polygon.length > 0
    ) {
      map.fitBounds(
        suggestion.polygon,
        {
          padding: [80, 80],
        }
      );
    }
  }

  // --------------------------------------------------
  // Approve / Reject suggestion
  // --------------------------------------------------

  async function reviewSuggestion(
    suggestion,
    status
  ) {
    const action =
      status === "APPROVED"
        ? "approve"
        : "reject";

    const confirmed =
      window.confirm(
        `Are you sure you want to ${action} "${suggestion.name}"?`
      );

    if (!confirmed) return;

    try {
      setReviewingSuggestionId(
        suggestion.id
      );

      setSuggestionsError("");

      const response =
        await fetch(
          `${API_URL}/api/narrow-road-suggestions/${suggestion.id}/status`,
          {
            method: "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              status,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to review suggestion"
        );
      }

      console.log(
        `[Admin] Suggestion ${status}:`,
        data
      );

      setSelectedSuggestionId(
        null
      );

      // Reload both lists.
      // Important for APPROVED:
      // the new road now comes from narrowRoads.json.
      await Promise.all([
        loadRoads(),
        loadSuggestions(),
      ]);

    } catch (err) {
      console.error(
        "[Admin] Failed to review suggestion:",
        err
      );

      setSuggestionsError(
        err.message ||
          "Failed to review suggestion"
      );

    } finally {
      setReviewingSuggestionId(
        null
      );
    }
  }

  // --------------------------------------------------
  // Pending suggestions only
  // --------------------------------------------------

  const pendingSuggestions =
    suggestions.filter(
      (suggestion) =>
        suggestion.status ===
        "PENDING"
    );

  // --------------------------------------------------
  // Map ready
  // --------------------------------------------------

  function handleMapReady(
    mapInstance
  ) {
    setMap(mapInstance);
  }

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div className="admin-page">

      {/* ==================================================
          HEADER
      ================================================== */}

      <header className="admin-header">

        <div>
          <div className="admin-title">
            NARROW ROAD MANAGEMENT
          </div>

          <div className="admin-subtitle">
            ADMIN GEOFENCE CONTROL
          </div>
        </div>

        {/* ------------------------------------------------
            ADMIN SEARCH
        ------------------------------------------------ */}

        <div
          className="admin-search"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flex: 1,
            maxWidth: "560px",
            marginLeft: "30px",
          }}
        >

          <input
            type="text"
            value={searchText}
            onChange={(event) =>
              setSearchText(
                event.target.value
              )
            }
            onKeyDown={
              handleSearchKeyDown
            }
            placeholder="Search location..."
            style={{
              flex: 1,
            }}
          />

          <button
            type="button"
            onClick={
              searchLocationOnMap
            }
            disabled={searching}
            className="admin-primary-button"
          >
            {searching
              ? "SEARCHING..."
              : "SEARCH"}
          </button>

        </div>

        {/* ------------------------------------------------
            ACTIONS
        ------------------------------------------------ */}

        <div className="admin-actions">

          {!drawing ? (

            <button
              type="button"
              onClick={
                startDrawing
              }
              className="admin-primary-button"
            >
              + MARK NARROW ROAD
            </button>

          ) : (

            <>

              <button
                type="button"
                onClick={
                  cancelDrawing
                }
                className="admin-secondary-button"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={
                  saveRoad
                }
                disabled={
                  saving ||
                  currentPolygon.length <
                    3
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

      {/* Search error */}

      {searchError && (
        <div
          style={{
            position: "absolute",
            top: "75px",
            right: "20px",
            zIndex: 10000,
            background: "#24151a",
            color: "#ff6b6b",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "1px solid #7a2934",
          }}
        >
          {searchError}
        </div>
      )}

      {/* ==================================================
          CONTENT
      ================================================== */}

      <div className="admin-content">

        {/* ==================================================
            MAP
        ================================================== */}

        <div className="admin-map">

          <MapContainer
            center={[
              10.958,
              76.956,
            ]}
            zoom={15}
            zoomControl={true}
            className="admin-leaflet-map"
          >

            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            <MapController
              onReady={
                handleMapReady
              }
            />

            <SearchController
              searchLocation={
                searchLocation
              }
            />

            <DrawingLayer
              drawing={drawing}
              onPointAdded={
                addPoint
              }
            />

            {/* ==================================================
                EXISTING OFFICIAL ROADS
            ================================================== */}

            {roads.map((road) => (

              <Polygon
                key={`road-${road.id}`}
                positions={
                  road.polygon
                }
                pathOptions={{
                  color: "#ff5c63",
                  weight: 3,
                  fillColor:
                    "#ff5c63",
                  fillOpacity:
                    0.18,
                }}
              />

            ))}

            {/* ==================================================
                USER SUGGESTIONS
            ================================================== */}

            {pendingSuggestions.map(
              (suggestion) => {

                const selected =
                  suggestion.id ===
                  selectedSuggestionId;

                return (

                  <Polygon
                    key={`suggestion-${suggestion.id}`}
                    positions={
                      suggestion.polygon
                    }
                    pathOptions={{
                      color: selected
                        ? "#ffd54f"
                        : "#9c6cff",

                      weight: selected
                        ? 5
                        : 3,

                      dashArray:
                        "8 6",

                      fillColor:
                        selected
                          ? "#ffd54f"
                          : "#9c6cff",

                      fillOpacity:
                        selected
                          ? 0.30
                          : 0.20,
                    }}

                    eventHandlers={{
                      click: () =>
                        viewSuggestion(
                          suggestion
                        ),
                    }}
                  />

                );
              }
            )}

            {/* ==================================================
                SEARCH LOCATION
            ================================================== */}

            {searchLocation && (

              <CircleMarker
                center={[
                  searchLocation.lat,
                  searchLocation.lon,
                ]}
                radius={8}
                pathOptions={{
                  color: "#ffffff",
                  fillColor:
                    "#2196f3",
                  fillOpacity: 1,
                  weight: 3,
                }}
              />

            )}

            {/* ==================================================
                CURRENT DRAWING
            ================================================== */}

            {currentPolygon.length >=
              2 && (

              <Polyline
                positions={
                  currentPolygon
                }
                pathOptions={{
                  color:
                    "#56c7ff",
                  weight: 3,
                  dashArray:
                    "8 6",
                }}
              />

            )}

            {/* ==================================================
                DRAWING POINTS
            ================================================== */}

            {currentPolygon.map(
              (
                point,
                index
              ) => (

                <CircleMarker
                  key={index}
                  center={point}
                  radius={5}
                  pathOptions={{
                    color:
                      "#56c7ff",
                    fillColor:
                      "#56c7ff",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                />

              )
            )}

          </MapContainer>

          {/* ==================================================
              DRAWING HELP
          ================================================== */}

          {drawing && (

            <div className="admin-drawing-help">

              <strong>
                MARKING NARROW ROAD
              </strong>

              <span>
                Click around the
                entire road boundary.
              </span>

              <span>
                Points:{" "}
                {
                  currentPolygon.length
                }
              </span>

            </div>

          )}

        </div>

        {/* ==================================================
            SIDE PANEL
        ================================================== */}

        <aside className="admin-sidebar">

          {/* ==================================================
              USER SUGGESTIONS
          ================================================== */}

          <div className="admin-section-title">
            USER SUGGESTIONS
          </div>

          {suggestionsError && (

            <div
              className="admin-error"
              style={{
                marginBottom:
                  "12px",
              }}
            >
              {suggestionsError}
            </div>

          )}

          {suggestionsLoading ? (

            <div className="admin-empty">
              Loading user suggestions...
            </div>

          ) : pendingSuggestions.length ===
            0 ? (

            <div className="admin-empty">
              No pending user suggestions.
            </div>

          ) : (

            <div className="admin-road-list">

              {pendingSuggestions.map(
                (suggestion) => {

                  const reviewing =
                    reviewingSuggestionId ===
                    suggestion.id;

                  const selected =
                    selectedSuggestionId ===
                    suggestion.id;

                  return (

                    <div
                      key={
                        suggestion.id
                      }
                      className="admin-road-item"
                      style={{
                        border:
                          selected
                            ? "1px solid #56c7ff"
                            : undefined,
                      }}
                    >

                      <div>

                        <strong>
                          {suggestion.name}
                        </strong>

                        <span>
                          {
                            suggestion
                              .polygon
                              .length
                          }{" "}
                          boundary points
                        </span>

                        {suggestion.reason && (

                          <span
                            style={{
                              marginTop:
                                "6px",
                              whiteSpace:
                                "normal",
                            }}
                          >
                            {suggestion.reason}
                          </span>

                        )}

                        {suggestion.submittedAt && (

                          <span>
                            Submitted{" "}
                            {new Date(
                              suggestion.submittedAt
                            ).toLocaleString()}
                          </span>

                        )}

                      </div>

                      <div
                        className="admin-road-buttons"
                        style={{
                          display:
                            "flex",
                          flexWrap:
                            "wrap",
                          gap:
                            "6px",
                        }}
                      >

                        <button
                          type="button"
                          onClick={() =>
                            viewSuggestion(
                              suggestion
                            )
                          }
                          className="admin-edit-button"
                          disabled={
                            reviewing
                          }
                        >
                          {selected
                            ? "SELECTED"
                            : "VIEW"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            reviewSuggestion(
                              suggestion,
                              "APPROVED"
                            )
                          }
                          className="admin-primary-button"
                          disabled={
                            reviewing
                          }
                        >
                          {reviewing
                            ? "..."
                            : "APPROVE"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            reviewSuggestion(
                              suggestion,
                              "REJECTED"
                            )
                          }
                          className="admin-delete-button"
                          disabled={
                            reviewing
                          }
                        >
                          REJECT
                        </button>

                      </div>

                    </div>

                  );
                }
              )}

            </div>

          )}

          {/* ==================================================
              SEPARATOR
          ================================================== */}

          <div
            style={{
              height: "1px",
              background:
                "rgba(255,255,255,0.08)",
              margin:
                "24px 0",
            }}
          />

          {/* ==================================================
              NEW / EDIT ROAD
          ================================================== */}

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
                {
                  currentPolygon.length
                }{" "}
                points
              </div>

            </div>

          )}

          {/* ==================================================
              ERROR
          ================================================== */}

          {error && (

            <div className="admin-error">
              {error}
            </div>

          )}

          {/* ==================================================
              SAVED OFFICIAL ROADS
          ================================================== */}

          <div
            className="admin-section-title"
            style={{
              marginTop:
                "20px",
            }}
          >
            SAVED NARROW ROADS
          </div>

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
                      {
                        road.polygon
                          .length
                      }{" "}
                      boundary points
                    </span>

                  </div>

                  <div className="admin-road-buttons">

                    <button
                      type="button"
                      onClick={() =>
                        startEditingRoad(
                          road
                        )
                      }
                      className="admin-edit-button"
                    >
                      EDIT
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        deleteRoad(
                          road.id
                        )
                      }
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