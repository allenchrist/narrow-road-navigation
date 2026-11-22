import Icon from "../common/Icon";

/**
 * The ghat roads for Mountain Mode, with how many hairpins each has.
 */
function HillRoadList({ hill, onShow }) {
  return (
    <>
      <p className="admin-hill-help">
        Each purple road on the map is a ghat road, with its hairpins numbered
        from the bottom. Drag a small dot to move a waiting point, click a
        number to delete a bend the map got wrong, or add one it missed.
      </p>

      <button
        type="button"
        className={`admin-edit-button admin-add-bend${hill.adding ? " is-active" : ""}`}
        onClick={hill.adding ? hill.stopAdding : hill.startAdding}
      >
        <Icon name={hill.adding ? "check" : "plus"} size={15} />
        {hill.adding ? "Done adding" : "Add a hairpin"}
      </button>

      {hill.notice && <div className="admin-notice">{hill.notice}</div>}
      {hill.error && <div className="admin-error">{hill.error}</div>}

      {hill.roads.length === 0 ? (
        <div className="admin-empty">No ghat roads yet.</div>
      ) : (
        <div className="admin-road-list">
          {hill.roads.map((road) => (
            <div key={road.id} className="admin-road-item admin-hill-item">
              <div>
                <strong>{road.name}</strong>

                <span>{road.bends.length} hairpin bends</span>
              </div>

              <div className="admin-road-buttons">
                <button
                  type="button"
                  onClick={() => onShow(road)}
                  className="admin-edit-button"
                >
                  <Icon name="target" size={15} />
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default HillRoadList;
