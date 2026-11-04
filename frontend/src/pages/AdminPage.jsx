import { useState } from "react";

import AdminHeader from "../components/admin/AdminHeader";
import AdminMap from "../components/admin/AdminMap";
import RoadList from "../components/admin/RoadList";
import SuggestionList from "../components/admin/SuggestionList";

import { useLocationSearch } from "../hooks/useLocationSearch";
import { useRoadEditor } from "../hooks/useRoadEditor";
import { useSuggestionReview } from "../hooks/useSuggestionReview";

function AdminPage({ onSignOut }) {
  const [map, setMap] = useState(null);
  const [tab, setTab] = useState("suggestions");

  const search = useLocationSearch(map);
  const editor = useRoadEditor(map);
  const reviewState = useSuggestionReview(map, editor.loadRoads);

  // Clicking a suggestion on the map also shows it in the list
  const review = {
    ...reviewState,
    viewSuggestion(suggestion) {
      setTab("suggestions");
      reviewState.viewSuggestion(suggestion);
    },
  };

  // Marking a road takes over the map, so no suggestion stays selected
  function startDrawing() {
    search.clearMatches();
    editor.startDrawing();
    review.clearSelection();
  }

  function startEditingRoad(road) {
    editor.startEditingRoad(road);
    review.clearSelection();
  }

  return (
    <div className="admin-page">

      <AdminHeader
        search={search}
        editor={editor}
        onStartDrawing={startDrawing}
        onSignOut={onSignOut}
      />

      <div className="admin-content">

        <AdminMap
          search={search}
          editor={editor}
          review={review}
          onMapReady={setMap}
        />

        <aside className="admin-sidebar">

          {editor.drawing && (

            <div className="admin-drawing-panel">

              <label>
                Road name
              </label>

              <input
                type="text"
                value={editor.roadName}
                maxLength={100}
                onChange={(event) =>
                  editor.setRoadName(event.target.value)
                }
                placeholder="Example: College Road"
              />

              <div className="admin-point-count">
                {editor.currentPolygon.length}{" "}
                points
              </div>

            </div>

          )}

          {editor.error && (

            <div className="admin-error">
              {editor.error}
            </div>

          )}

          <div className="admin-tabs" role="tablist">
            {[
              ["suggestions", "Suggestions", review.pendingSuggestions.length],
              ["roads", "Saved roads", editor.roads.length],
            ].map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "is-active" : ""}
                onClick={() => setTab(id)}
              >
                {label}
                <span className="admin-count">{count}</span>
              </button>
            ))}
          </div>

          <div className="admin-tab-panel" role="tabpanel">
            {tab === "suggestions" ? (
              <SuggestionList review={review} />
            ) : (
              <RoadList
                editor={editor}
                onEditRoad={startEditingRoad}
              />
            )}
          </div>

        </aside>

      </div>

    </div>
  );
}

export default AdminPage;
