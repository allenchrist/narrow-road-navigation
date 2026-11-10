import { useState } from "react";

import Icon from "../common/Icon";

function RoadList({ editor, onEditRoad }) {
  const { roads, loading, viewRoad, deleteRoad } = editor;

  const [roadFilter, setRoadFilter] = useState("");

  const filteredRoads = roads.filter((road) =>
    road.name.toLowerCase().includes(roadFilter.trim().toLowerCase()),
  );

  return (
    <>
      <input
        type="search"
        className="admin-road-filter"
        value={roadFilter}
        onChange={(event) => setRoadFilter(event.target.value)}
        placeholder="Filter roads by name"
        aria-label="Filter roads by name"
      />

      {loading ? (
        <div className="admin-empty">Loading...</div>
      ) : filteredRoads.length === 0 ? (
        <div className="admin-empty">
          {roads.length === 0
            ? "No narrow roads marked yet."
            : "No roads match that name."}
        </div>
      ) : (
        <div className="admin-road-list">
          {filteredRoads.map((road) => (
            <div key={road.id} className="admin-road-item">
              <div>
                <strong>{road.name}</strong>

                <span>{road.polygon.length} boundary points</span>
              </div>

              <div className="admin-road-buttons">
                <button
                  type="button"
                  onClick={() => viewRoad(road)}
                  className="admin-edit-button"
                >
                  <Icon name="target" size={15} />
                  View
                </button>

                <button
                  type="button"
                  onClick={() => onEditRoad(road)}
                  className="admin-edit-button"
                >
                  <Icon name="pencil" size={15} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => deleteRoad(road.id)}
                  className="admin-delete-button"
                >
                  <Icon name="trash" size={15} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default RoadList;
