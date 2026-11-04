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

  const search = useLocationSearch(map);
  const editor = useRoadEditor(map);
  const review = useSuggestionReview(map, editor.loadRoads);

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

          <SuggestionList review={review} />

          <div className="admin-divider" />

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

          <RoadList
            editor={editor}
            onEditRoad={startEditingRoad}
          />

        </aside>

      </div>

    </div>
  );
}

export default AdminPage;
