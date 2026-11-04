import { useState } from "react";

// Search results within about this distance of the map are preferred
const SEARCH_AREA_DEGREES = 0.5;

function searchUrl(query, map) {
  const center = map?.getCenter();

  // A preference only, so a place in another city can still be found
  const area = center
    ? `&viewbox=${[
        center.lng - SEARCH_AREA_DEGREES,
        center.lat + SEARCH_AREA_DEGREES,
        center.lng + SEARCH_AREA_DEGREES,
        center.lat - SEARCH_AREA_DEGREES,
      ].join(",")}`
    : "";

  return (
    `https://nominatim.openstreetmap.org/search` +
    `?format=json&limit=5${area}&q=${encodeURIComponent(query)}`
  );
}

const toLocation = (result) => ({
  lat: Number(result.lat),
  lon: Number(result.lon),
  displayName: result.display_name,
});

/**
 * Finds a place using OpenStreetMap, preferring results near the map.
 * The best match goes on the map, and the others are offered in case
 * it's the wrong place.
 */
export function useLocationSearch(map) {
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchLocation, setSearchLocation] = useState(null);
  const [otherMatches, setOtherMatches] = useState([]);
  const [searchError, setSearchError] = useState("");

  async function searchLocationOnMap() {
    const query = searchText.trim();

    if (!query) {
      setSearchError("Enter a location to search");
      return;
    }

    if (searching) {
      return;
    }

    try {
      setSearching(true);
      setSearchError("");
      setOtherMatches([]);

      const response = await fetch(searchUrl(query, map), {
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

      const [best, ...others] = results
        .map(toLocation)
        .filter(
          (location) =>
            Number.isFinite(location.lat) && Number.isFinite(location.lon)
        );

      if (!best) {
        setSearchError("Invalid location returned");
        return;
      }

      setSearchLocation(best);
      setOtherMatches(others);
    } catch (err) {
      console.error("[Location Search] Search failed:", err);

      setSearchError("Unable to search location");
    } finally {
      setSearching(false);
    }
  }

  function chooseMatch(match) {
    setSearchLocation(match);
    setOtherMatches([]);
  }

  return {
    searchText,
    setSearchText,
    searching,
    searchLocation,
    setSearchLocation,
    otherMatches,
    searchError,
    searchLocationOnMap,
    chooseMatch,
    clearMatches: () => setOtherMatches([]),
  };
}
