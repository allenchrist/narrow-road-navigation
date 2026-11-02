import { useEffect, useState } from "react";
import { Polygon } from "react-leaflet";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

// Picks up roads an administrator has added or approved
const REFRESH_MS = 60000;

function NarrowRoadLayer({ activeRoadId }) {
  const [roads, setRoads] = useState([]);

  useEffect(() => {
    async function loadRoads() {
      try {
        const response = await fetch(
          `${API_URL}/api/narrow-roads`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (Array.isArray(data.roads)) {
          setRoads(data.roads);
        }
      } catch (error) {
        console.error(
          "[NarrowRoadLayer] Failed to load roads:",
          error
        );
      }
    }

    loadRoads();

    const interval = setInterval(loadRoads, REFRESH_MS);

    return () => clearInterval(interval);
  }, []);

  return roads.map((road) => {
    const active = road.id === activeRoadId;

    return (
      <Polygon
        key={road.id}
        positions={road.polygon}
        interactive={false}
        pathOptions={{
          color: active ? "#ffd54f" : "#ff5c63",
          weight: active ? 4 : 2,
          fillColor: active ? "#ffd54f" : "#ff5c63",
          fillOpacity: active ? 0.35 : 0.15,
        }}
      />
    );
  });
}

export default NarrowRoadLayer;
