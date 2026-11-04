import Icon from "../common/Icon";

function SuggestSidebar({
  drawing,
  pointCount,
  roadName,
  reason,
  error,
  submitting,
  onRoadNameChange,
  onReasonChange,
  onStartDrawing,
  onCancelDrawing,
  onUndo,
  onSubmit,
}) {
  return (
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
          onClick={onStartDrawing}
        >
          <Icon name="add" size={18} />
          Start marking the road
        </button>
      ) : (
        <div className="suggest-drawing-actions">

          <button
            type="button"
            className="suggest-secondary-button"
            onClick={onCancelDrawing}
          >
            Cancel
          </button>

          <button
            type="button"
            className="suggest-secondary-button"
            onClick={onUndo}
            disabled={pointCount === 0}
          >
            <Icon name="undo" size={18} />
            Undo
          </button>

        </div>
      )}

      <div className="suggest-form">

        <label>
          Road name
        </label>

        <input
          type="text"
          value={roadName}
          maxLength={100}
          onChange={(event) => onRoadNameChange(event.target.value)}
          placeholder="Example: College Road"
        />

        <label>
          Why is this road narrow? (optional)
        </label>

        <textarea
          value={reason}
          maxLength={500}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="For example: only one vehicle fits between the walls"
          rows={5}
        />

        <div className="suggest-point-count">
          {pointCount < 3
            ? `${pointCount} of at least 3 points marked`
            : `${pointCount} points marked`}
        </div>

      </div>

      {error && (
        <div className="suggest-error">
          {error}
        </div>
      )}

      <button
        type="button"
        className="suggest-submit-button"
        onClick={onSubmit}
        disabled={submitting || pointCount < 3 || !roadName.trim()}
      >
        {submitting ? "Sending…" : "Send suggestion"}
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
  );
}

export default SuggestSidebar;
