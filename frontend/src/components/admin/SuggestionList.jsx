function SuggestionItem({ suggestion, review }) {
  const reviewing = review.reviewingSuggestionId === suggestion.id;
  const selected = review.selectedSuggestionId === suggestion.id;

  return (
    <div className={`admin-road-item${selected ? " is-selected" : ""}`}>
      <div>
        <strong>{suggestion.name}</strong>

        <span>{suggestion.polygon.length} boundary points</span>

        {suggestion.reason && (
          <span className="admin-road-reason">{suggestion.reason}</span>
        )}

        <span>
          {suggestion.submittedBy
            ? `Sent by ${suggestion.submittedBy}`
            : "Sender not recorded"}
        </span>

        {suggestion.submittedAt && (
          <span>
            Submitted {new Date(suggestion.submittedAt).toLocaleString()}
          </span>
        )}
      </div>

      <div className="admin-road-buttons">
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
      {suggestionsError && (
        <div className="admin-error">{suggestionsError}</div>
      )}

      {suggestionsLoading ? (
        <div className="admin-empty">Loading user suggestions...</div>
      ) : pendingSuggestions.length === 0 ? (
        <div className="admin-empty">No pending user suggestions.</div>
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
