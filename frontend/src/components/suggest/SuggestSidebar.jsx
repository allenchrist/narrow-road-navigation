import Icon from "../common/Icon";

function Step({ number, title, done, children }) {
  return (
    <li className="suggest-step">
      <span className={`suggest-step-number${done ? " is-done" : ""}`}>
        {done ? <Icon name="check" size={16} /> : number}
      </span>

      <div className="suggest-step-body">
        <div className="suggest-section-title">{title}</div>
        {children}
      </div>
    </li>
  );
}

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
      <ol className="suggest-steps">
        <Step number={1} title="Mark the road" done={pointCount >= 3}>
          <p className="suggest-description">
            Click around the road on the map to outline it.
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

          <div className="suggest-point-count">
            {pointCount < 3
              ? `${pointCount} of at least 3 points marked`
              : `${pointCount} points marked`}
          </div>
        </Step>

        <Step number={2} title="Describe it" done={Boolean(roadName.trim())}>
          <div className="suggest-form">
            <label>Road name</label>

            <input
              type="text"
              value={roadName}
              maxLength={100}
              onChange={(event) => onRoadNameChange(event.target.value)}
              placeholder="Example: College Road"
            />

            <label>Why is this road narrow? (optional)</label>

            <textarea
              value={reason}
              maxLength={500}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="For example: only one vehicle fits between the walls"
              rows={3}
            />
          </div>
        </Step>

        <Step number={3} title="Send for review" done={false}>
          {error && <div className="suggest-error">{error}</div>}

          <button
            type="button"
            className="suggest-submit-button"
            onClick={onSubmit}
            disabled={submitting || pointCount < 3 || !roadName.trim()}
          >
            {submitting ? "Sending…" : "Send suggestion"}
          </button>

          <p className="suggest-notice">
            An administrator checks each suggestion before drivers get alerts
            for it.
          </p>
        </Step>
      </ol>
    </aside>
  );
}

export default SuggestSidebar;
