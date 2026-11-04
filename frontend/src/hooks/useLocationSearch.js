import { useState } from "react";

/**
 * The admin page's location search, using OpenStreetMap.
 */
export function useLocationSearch() {
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchLocation, setSearchLocation] = useState(null);
  const [searchError, setSearchError] = useState("");

  async function searchLocationOnMap() {
    const query = searchText.trim();

    if (!query) {
      setSearchError("Enter a location to search");
      return;
    }

    try {
      setSearching(true);
      setSearchError("");

      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?format=json&limit=1&q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Search request failed");
      }

      const results = await response.json();

      if (!Array.isArray(results) || results.length === 0) {
        setSearchError("Location not found");
        return;
      }

      const lat = Number(results[0].lat);
      const lon = Number(results[0].lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setSearchError("Invalid location returned");
        return;
      }

      setSearchLocation({ lat, lon });
    } catch (err) {
      console.error("[Admin] Location search failed:", err);

      setSearchError("Unable to search location");
    } finally {
      setSearching(false);
    }
  }

  return {
    searchText,
    setSearchText,
    searching,
    searchLocation,
    searchError,
    searchLocationOnMap,
  };
}
