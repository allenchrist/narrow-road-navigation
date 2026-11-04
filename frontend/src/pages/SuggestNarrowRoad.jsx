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
import { useNavigate, useParams } from "react-router-dom";
import "leaflet/dist/leaflet.css";

import Icon from "../components/common/Icon";

import { BACKEND_URL } from "../config";

// --------------------------------------------------
// Map click handler
// --------------------------------------------------

function DrawingLayer({
  drawing,
  onPointAdded,
}) {
  useMapEvents({
    click(event) {
      if (!drawing) return;

      const { lat, lng } =
        event.latlng;

      onPointAdded([
        lat,
        lng,
      ]);
    },
  });

  return null;
}

// --------------------------------------------------
// Move map after search
// --------------------------------------------------

function SearchLocation({
  location,
}) {
  const map = useMap();

  useEffect(() => {
    if (!location) return;

    map.flyTo(
      [
        location.lat,
        location.lon,
      ],
      16,
      {
        duration: 1,
      }
    );
  }, [location, map]);

  return null;
}

// --------------------------------------------------
// Suggest Narrow Road
// --------------------------------------------------

function SuggestNarrowRoad() {
  const navigate =
    useNavigate();

  const { username } =
    useParams();

  const [drawing, setDrawing] =
    useState(false);

  const [currentPolygon, setCurrentPolygon] =
    useState([]);

  const [roadName, setRoadName] =
    useState("");

  const [reason, setReason] =
    useState("");

  const [searchText, setSearchText] =
    useState("");

  const [searching, setSearching] =
    useState(false);

  const [searchError, setSearchError] =
    useState("");

  const [searchLocation, setSearchLocation] =
    useState(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [submitted, setSubmitted] =
    useState(false);

  const mapRef =
    useRef(null);

  // --------------------------------------------------
  // Search OpenStreetMap
  // --------------------------------------------------

  async function searchLocationOnMap() {
    const query =
      searchText.trim();

    if (!query) {
      setSearchError(
        "Enter a location to search"
      );

      return;
    }

    try {
      setSearching(true);
      setSearchError("");

      const response =
        await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
            query
          )}`,
          {
            headers: {
              Accept:
                "application/json",
            },
          }
        );

      if (!response.ok) {
        throw new Error(
          "Location search failed"
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

      const result =
        results[0];

      setSearchLocation({
        lat: Number(result.lat),
        lon: Number(result.lon),
        displayName:
          result.display_name,
      });

    } catch (err) {
      console.error(
        "[Suggest Road] Search failed:",
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
  // Search on Enter
  // --------------------------------------------------

  function handleSearchKeyDown(
    event
  ) {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();

      searchLocationOnMap();
    }
  }

  // --------------------------------------------------
  // Start drawing
  // --------------------------------------------------

  function startDrawing() {
    setCurrentPolygon([]);
    setError("");
    setDrawing(true);
  }

  // --------------------------------------------------
  // Add polygon point
  // --------------------------------------------------

  function addPoint(point) {
    setCurrentPolygon(
      (previous) => [
        ...previous,
        point,
      ]
    );
  }

  // --------------------------------------------------
  // Undo last point
  // --------------------------------------------------

  function undoLastPoint() {
    setCurrentPolygon(
      (previous) =>
        previous.slice(
          0,
          -1
        )
    );
  }

  // --------------------------------------------------
  // Cancel drawing
  // --------------------------------------------------

  function cancelDrawing() {
    setDrawing(false);
    setCurrentPolygon([]);
    setError("");
  }

  // --------------------------------------------------
  // Submit suggestion
  // --------------------------------------------------

  async function submitSuggestion() {
    setError("");

    if (!roadName.trim()) {
      setError(
        "Please enter a road name"
      );

      return;
    }

    if (
      currentPolygon.length < 3
    ) {
      setError(
        "Mark at least 3 points around the road"
      );

      return;
    }

    try {
      setSubmitting(true);

      const response =
        await fetch(
          `${BACKEND_URL}/api/narrow-road-suggestions`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              name:
                roadName.trim(),

              polygon:
                currentPolygon,

              reason:
                reason.trim(),
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to submit suggestion"
        );
      }

      console.log(
        "[Suggest Road] Submitted:",
        data
      );

      setSubmitted(true);

    } catch (err) {
      console.error(
        "[Suggest Road] Submission failed:",
        err
      );

      setError(
        err.message ||
          "Failed to submit suggestion"
      );
    } finally {
      setSubmitting(false);
    }
  }

  // --------------------------------------------------
  // Success screen
  // --------------------------------------------------

  if (submitted) {
    return (
      <div className="suggest-road-page">

        <div className="suggest-road-success">

          <div className="suggest-success-icon">
            <Icon name="check" size={32} />
          </div>

          <h1>
            Suggestion sent
          </h1>

          <p>
            Thanks. An administrator will review
            your narrow road suggestion.
          </p>

          <p className="suggest-success-status">
            Pending review
          </p>

          <button
            type="button"
            className="suggest-primary-button"
            onClick={() =>
              navigate(`/${encodeURIComponent(username)}`)
            }
          >
            Back to dashboard
          </button>

        </div>

      </div>
    );
  }

  return (
    <div className="suggest-road-page">

      {/* ------------------------------------------------
          HEADER
      ------------------------------------------------ */}

      <header className="suggest-road-header">

        {/* TITLE */}

        <button
          type="button"
          className="suggest-back-button"
          onClick={() =>
            navigate(`/${encodeURIComponent(username)}`)
          }
        >
          <Icon name="back" size={18} />
          Back
        </button>

        <div className="suggest-road-heading">

          <div className="suggest-road-title">
            Suggest a narrow road
          </div>

          <div className="suggest-road-subtitle">
            Help other drivers stay safe
          </div>

        </div>

        {/* SEARCH */}

        <div className="suggest-header-search-container">
          <div className="suggest-header-search">
            <span className="suggest-search-icon"><Icon name="search" size={18} /></span>
            <input
              type="text"
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              onKeyDown={handleSearchKeyDown}
              placeholder="Search location..."
            />
          </div>

          <button
            type="button"
            onClick={searchLocationOnMap}
            disabled={searching}
            className="suggest-search-btn"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

      </header>

      {/* ------------------------------------------------
          CONTENT
      ------------------------------------------------ */}

      <div className="suggest-road-content">

        {/* ------------------------------------------------
            MAP
        ------------------------------------------------ */}

        <div className="suggest-road-map-wrapper cv-map--map">

          <MapContainer
            center={[
              10.958,
              76.956,
            ]}
            zoom={15}
            zoomControl={true}
            className="suggest-road-map"
            ref={mapRef}
          >

            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            <DrawingLayer
              drawing={drawing}
              onPointAdded={
                addPoint
              }
            />

            <SearchLocation
              location={
                searchLocation
              }
            />

            {/* Current drawing */}

            {currentPolygon.length >=
              2 && (
              <Polyline
                positions={
                  currentPolygon
                }
                pathOptions={{
                  color:
                    "#56c7ff",
                  weight: 4,
                  dashArray:
                    "8 6",
                }}
              />
            )}

            {/* Drawing points */}

            {currentPolygon.map(
              (
                point,
                index
              ) => (
                <CircleMarker
                  key={index}
                  center={point}
                  radius={6}
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

            {/* Completed polygon */}

            {currentPolygon.length >=
              3 && (
              <Polygon
                positions={
                  currentPolygon
                }
                pathOptions={{
                  color:
                    "#56c7ff",
                  weight: 3,
                  fillColor:
                    "#56c7ff",
                  fillOpacity: 0.18,
                }}
              />
            )}

          </MapContainer>

          {searchError && (
            <div className="suggest-search-error">
              {searchError}
            </div>
          )}

          {/* ------------------------------------------------
              DRAWING HELP
          ------------------------------------------------ */}

          {drawing && (
            <div className="suggest-drawing-help">

              <strong>
                Mark the narrow road
              </strong>

              <span>
                Click around the road to mark its boundary.
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

        {/* ------------------------------------------------
            SIDE PANEL
        ------------------------------------------------ */}

        <aside className="suggest-road-sidebar">

          <div className="suggest-section-title">
            Your suggestion
          </div>

          <p className="suggest-description">
            Know a road that is too narrow
            for safe vehicle movement?
            Mark the area on the map and
            send it to the administrator
            for review.
          </p>

          {!drawing ? (
            <button
              type="button"
              className="suggest-primary-button"
              onClick={
                startDrawing
              }
            >
              <Icon name="add" size={18} />
              Start marking the road
            </button>
          ) : (
            <div className="suggest-drawing-actions">

              <button
                type="button"
                className="suggest-secondary-button"
                onClick={
                  cancelDrawing
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="suggest-secondary-button"
                onClick={
                  undoLastPoint
                }
                disabled={
                  currentPolygon.length ===
                  0
                }
              >
                <Icon name="undo" size={18} />
                Undo
              </button>

            </div>
          )}

          {/* ------------------------------------------------
              FORM
          ------------------------------------------------ */}

          <div className="suggest-form">

            <label>
              Road name
            </label>

            <input
              type="text"
              value={roadName}
              maxLength={100}
              onChange={(event) =>
                setRoadName(
                  event.target.value
                )
              }
              placeholder="Example: College Road"
            />

            <label>
              Why is this road narrow? (optional)
            </label>

            <textarea
              value={reason}
              maxLength={500}
              onChange={(event) =>
                setReason(
                  event.target.value
                )
              }
              placeholder="For example: only one vehicle fits between the walls"
              rows={5}
            />

            <div className="suggest-point-count">
              {currentPolygon.length < 3
                ? `${currentPolygon.length} of at least 3 points marked`
                : `${currentPolygon.length} points marked`}
            </div>

          </div>

          {error && (
            <div className="suggest-error">
              {error}
            </div>
          )}

          {/* ------------------------------------------------
              SUBMIT
          ------------------------------------------------ */}

          <button
            type="button"
            className="suggest-submit-button"
            onClick={
              submitSuggestion
            }
            disabled={
              submitting ||
              currentPolygon.length <
                3 ||
              !roadName.trim()
            }
          >
            {submitting
              ? "Sending…"
              : "Send suggestion"}
          </button>

          <div className="suggest-notice">

            <strong>
              Reviewed before it goes live
            </strong>

            <span>
              An administrator checks each
              suggestion before drivers get
              alerts for it.
            </span>

          </div>

        </aside>

      </div>

    </div>
  );
}

export default SuggestNarrowRoad;