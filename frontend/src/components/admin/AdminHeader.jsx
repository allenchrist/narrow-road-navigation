import Icon from "../common/Icon";

function AdminHeader({ search, editor, onStartDrawing, onSignOut }) {
  const {
    drawing,
    currentPolygon,
    saving,
    editingRoadId,
    cancelDrawing,
    undoLastPoint,
    saveRoad,
  } = editor;

  return (
    <header className="admin-header">
      <div className="admin-heading">
        <div className="admin-title">Narrow road management</div>

        <div className="admin-subtitle">Admin console</div>
      </div>

      <div className="admin-header-search-container">
        <div className="admin-header-search">
          <span className="admin-search-icon">
            <Icon name="search" size={18} />
          </span>
          <input
            type="text"
            value={search.searchText}
            onChange={(event) => search.setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                search.searchLocationOnMap();
              }
            }}
            placeholder="Search location..."
          />
        </div>

        <button
          type="button"
          onClick={search.searchLocationOnMap}
          disabled={search.searching}
          className="admin-search-btn"
        >
          {search.searching ? "Searching…" : "Search"}
        </button>
      </div>

      <div className="admin-actions">
        <button
          type="button"
          onClick={onSignOut}
          className="admin-secondary-button"
        >
          Sign out
        </button>

        {!drawing ? (
          <button
            type="button"
            onClick={onStartDrawing}
            className="admin-primary-button"
          >
            <Icon name="add" size={18} />
            Mark narrow road
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={cancelDrawing}
              className="admin-secondary-button"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={undoLastPoint}
              disabled={currentPolygon.length === 0}
              className="admin-secondary-button"
            >
              <Icon name="undo" size={18} />
              Undo
            </button>

            <button
              type="button"
              onClick={saveRoad}
              disabled={saving || currentPolygon.length < 3}
              className="admin-primary-button"
            >
              {saving ? "Saving…" : editingRoadId ? "Update road" : "Save road"}
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export default AdminHeader;
