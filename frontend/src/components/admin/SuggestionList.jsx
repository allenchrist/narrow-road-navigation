function SuggestionItem({ suggestion, review }) {
  const reviewing = review.reviewingSuggestionId === suggestion.id;
  const selected = review.selectedSuggestionId === suggestion.id;

  return (

    <div
      className="admin-road-item"
      style={{
        border: selected ? "1px solid #56c7ff" : undefined,
      }}
    >

      <div>

        <strong>
          {suggestion.name}
        </strong>

        <span>
          {suggestion.polygon.length}{" "}
          boundary points
        </span>

        {suggestion.reason && (

          <span
            style={{
              marginTop: "6px",
              whiteSpace: "normal",
            }}
          >
            {suggestion.reason}
          </span>

        )}

        <span>
          {suggestion.submittedBy
            ? `Sent by ${suggestion.submittedBy}`
            : "Sender not recorded"}
        </span>

        {suggestion.submittedAt && (

          <span>
            Submitted{" "}
            {new Date(suggestion.submittedAt).toLocaleString()}
          </span>

        )}

      </div>

      <div
        className="admin-road-buttons"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
        }}
      >

        <button
          type="button"
          onClick={() => review.viewSuggestion(suggestion)}
          className="admin-edit-button"
          disabled={reviewing}
        >
          {selected ? "Selected" : "View"}
        </button>

        <button
          type="button"
          onClick={() => review.reviewSuggestion(suggestion, "APPROVED")}
          className="admin-primary-button"
          disabled={reviewing}
        >
          {reviewing ? "..." : "Approve"}
        </button>

        <button
          type="button"
          onClick={() => review.reviewSuggestion(suggestion, "REJECTED")}
          className="admin-delete-button"
          disabled={reviewing}
        >
          Reject
        </button>

      </div>

    </div>

  );
}

function SuggestionList({ review }) {
  const { pendingSuggestions, suggestionsLoading, suggestionsError } = review;

  return (
    <>

      <div className="admin-section-title">
        User suggestions
        <span className="admin-count">
          {pendingSuggestions.length}
        </span>
      </div>

      {suggestionsError && (

        <div
          className="admin-error"
          style={{
            marginBottom: "12px",
          }}
        >
          {suggestionsError}
        </div>

      )}

      {suggestionsLoading ? (

        <div className="admin-empty">
          Loading user suggestions...
        </div>

      ) : pendingSuggestions.length === 0 ? (

        <div className="admin-empty">
          No pending user suggestions.
        </div>

      ) : (

        <div className="admin-road-list">

          {pendingSuggestions.map((suggestion) => (

            <SuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              review={review}
            />

          ))}

        </div>

      )}

    </>
  );
}

export default SuggestionList;
