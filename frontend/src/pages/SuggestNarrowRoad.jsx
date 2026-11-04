import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Icon from "../components/common/Icon";
import SuggestHeader from "../components/suggest/SuggestHeader";
import SuggestMap from "../components/suggest/SuggestMap";
import SuggestSidebar from "../components/suggest/SuggestSidebar";

import { BACKEND_URL } from "../config";
import { useLocationSearch } from "../hooks/useLocationSearch";
import { usePageTitle } from "../hooks/usePageTitle";
import { getDriverSession } from "../services/driverSession";

function SuggestNarrowRoad() {
  const navigate = useNavigate();
  const { username } = useParams();

  usePageTitle("Suggest a narrow road");

  const [map, setMap] = useState(null);
  const search = useLocationSearch(map);
  const { setSearchLocation, clearMatches } = search;

  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [roadName, setRoadName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const backToDashboard = () => navigate(`/${encodeURIComponent(username)}`);

  // Start at the driver's car, if it's connected
  useEffect(() => {
    let cancelled = false;

    async function showCarArea() {
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/vehicle`, {
          headers: {
            Authorization: `Bearer ${getDriverSession()?.token}`,
          },
        });

        if (!response.ok) {
          return;
        }

        const { vehicle } = await response.json();

        if (!cancelled && vehicle?.lat != null) {
          // Doesn't move a map the driver has already searched
          setSearchLocation(
            (current) => current ?? { lat: vehicle.lat, lon: vehicle.lon }
          );
        }
      } catch {
        // The map stays at its default area
      }
    }

    showCarArea();

    return () => {
      cancelled = true;
    };
  }, [setSearchLocation]);

  function startDrawing() {
    clearMatches();
    setPoints([]);
    setError("");
    setDrawing(true);
  }

  function cancelDrawing() {
    setDrawing(false);
    setPoints([]);
    setError("");
  }

  async function submitSuggestion() {
    setError("");

    if (!roadName.trim()) {
      setError("Please enter a road name");
      return;
    }

    if (points.length < 3) {
      setError("Mark at least 3 points around the road");
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(
        `${BACKEND_URL}/api/narrow-road-suggestions`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getDriverSession()?.token}`,
          },

          body: JSON.stringify({
            name: roadName.trim(),
            polygon: points,
            reason: reason.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to submit suggestion");
      }

      setSubmitted(true);
    } catch (err) {
      console.error("[Suggest Road] Submission failed:", err);

      setError(err.message || "Failed to submit suggestion");
    } finally {
      setSubmitting(false);
    }
  }

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
            onClick={backToDashboard}
          >
            Back to dashboard
          </button>

        </div>

      </div>
    );
  }

  return (
    <div className="suggest-road-page">

      <SuggestHeader
        search={search}
        onBack={backToDashboard}
      />

      <div className="suggest-road-content">

        <SuggestMap
          search={search}
          drawing={drawing}
          points={points}
          onPointAdded={(point) =>
            setPoints((previous) => [...previous, point])
          }
          onMapReady={setMap}
        />

        <SuggestSidebar
          drawing={drawing}
          pointCount={points.length}
          roadName={roadName}
          reason={reason}
          error={error}
          submitting={submitting}
          onRoadNameChange={setRoadName}
          onReasonChange={setReason}
          onStartDrawing={startDrawing}
          onCancelDrawing={cancelDrawing}
          onUndo={() =>
            setPoints((previous) => previous.slice(0, -1))
          }
          onSubmit={submitSuggestion}
        />

      </div>

    </div>
  );
}

export default SuggestNarrowRoad;
