import { useEffect, useState } from "react";

import { adminFetch } from "../services/adminApi";

/**
 * The drivers' suggestions, and approving or rejecting them.
 * `onReviewed` reloads the saved roads, as approving adds one.
 */
export function useSuggestionReview(map, onReviewed) {
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState("");

  const [selectedSuggestionId, setSelectedSuggestionId] = useState(null);
  const [reviewingSuggestionId, setReviewingSuggestionId] = useState(null);

  useEffect(() => {
    loadSuggestions();
  }, []);

  async function loadSuggestions() {
    try {
      setSuggestionsLoading(true);
      setSuggestionsError("");

      const response = await adminFetch("/api/narrow-road-suggestions");

      // The login expired, and this page is about to close
      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load suggestions");
      }

      const data = await response.json();

      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (err) {
      console.error("[Admin] Failed to load suggestions:", err);

      setSuggestionsError("Unable to load user suggestions");
    } finally {
      setSuggestionsLoading(false);
    }
  }

  function viewSuggestion(suggestion) {
    setSelectedSuggestionId(suggestion.id);

    if (
      map &&
      Array.isArray(suggestion.polygon) &&
      suggestion.polygon.length > 0
    ) {
      map.fitBounds(suggestion.polygon, {
        padding: [80, 80],
      });
    }
  }

  function clearSelection() {
    setSelectedSuggestionId(null);
  }

  async function reviewSuggestion(suggestion, status) {
    const action = status === "APPROVED" ? "approve" : "reject";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} "${suggestion.name}"?`,
    );

    if (!confirmed) return;

    try {
      setReviewingSuggestionId(suggestion.id);
      setSuggestionsError("");

      const response = await adminFetch(
        `/api/narrow-road-suggestions/${suggestion.id}/status`,
        {
          method: "PUT",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            status,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to review suggestion");
      }

      console.log(`[Admin] Suggestion ${status}:`, data);

      setSelectedSuggestionId(null);

      await Promise.all([onReviewed(), loadSuggestions()]);
    } catch (err) {
      console.error("[Admin] Failed to review suggestion:", err);

      setSuggestionsError(err.message || "Failed to review suggestion");
    } finally {
      setReviewingSuggestionId(null);
    }
  }

  return {
    pendingSuggestions: suggestions.filter(
      (suggestion) => suggestion.status === "PENDING",
    ),
    suggestionsLoading,
    suggestionsError,
    selectedSuggestionId,
    reviewingSuggestionId,
    viewSuggestion,
    clearSelection,
    reviewSuggestion,
  };
}
