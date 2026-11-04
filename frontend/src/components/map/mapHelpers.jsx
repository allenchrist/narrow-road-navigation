import { useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";

// Hands the map to the page, for controls outside it
export function MapController({ onReady }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

export function DrawingLayer({ drawing, onPointAdded }) {
  useMapEvents({
    click(event) {
      if (!drawing) return;

      const { lat, lng } = event.latlng;

      onPointAdded([lat, lng]);
    },
  });

  return null;
}

export function FlyToLocation({ location, zoom, duration }) {
  const map = useMap();

  useEffect(() => {
    if (!location) return;

    map.flyTo([location.lat, location.lon], zoom, { duration });
  }, [location, zoom, duration, map]);

  return null;
}
