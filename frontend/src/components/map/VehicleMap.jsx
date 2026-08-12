import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { useVehicle } from "../../context/VehicleContext";
import egoCar from "../../assets/ego-car.svg";

/* ---------------------------------------------------------
   Ego icon — rebuilt only when heading changes
--------------------------------------------------------- */
function buildEgoIcon(heading) {
  const deg = typeof heading === "number" ? heading : 0;
  return L.divIcon({
    className: "vehicle-map-icon",
    html: `
      <div class="ego-car-wrapper" style="transform:rotate(${deg}deg);">
        <div class="ego-car-glow"></div>
        <img src="${egoCar}" class="ego-car-img" alt="ego vehicle" draggable="false"/>
      </div>
    `,
    iconSize: [40, 56],
    iconAnchor: [20, 28],
    popupAnchor: [0, -32],
  });
}

/* ---------------------------------------------------------
   Smooth position animation
--------------------------------------------------------- */
const ANIM_DURATION = 600;

function useSmoothPosition(targetLat, targetLon) {
  const [displayPos, setDisplayPos] = useState(
    targetLat !== null ? [targetLat, targetLon] : null
  );
  const animRef = useRef(null);
  const fromRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (targetLat === null || targetLon === null) return;

    const target = [targetLat, targetLon];
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const from = fromRef.current ?? target;
    fromRef.current = from;
    startTimeRef.current = performance.now();

    function step(now) {
      const t = Math.min((now - startTimeRef.current) / ANIM_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const lat = from[0] + (target[0] - from[0]) * ease;
      const lon = from[1] + (target[1] - from[1]) * ease;
      setDisplayPos([lat, lon]);
      fromRef.current = [lat, lon];
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
        animRef.current = null;
      }
    }

    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [targetLat, targetLon]);

  return displayPos;
}

/* ---------------------------------------------------------
   FlyToVehicle — fires once when the first GPS fix arrives,
   then stays silent so the user can freely pan the map.
--------------------------------------------------------- */
function FlyToVehicle({ lat, lon }) {
  const map = useMap();
  const hasFlown = useRef(false);

  useEffect(() => {
    if (!hasFlown.current && lat !== null && lon !== null) {
      hasFlown.current = true;
      map.flyTo([lat, lon], 17, { duration: 1.4, easeLinearity: 0.25 });
    }
  }, [lat, lon, map]);

  return null;
}

/* ---------------------------------------------------------
   MapController — exposes the Leaflet map instance
--------------------------------------------------------- */
function MapController({ onReady }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

/* ---------------------------------------------------------
   VehicleMap
--------------------------------------------------------- */
function VehicleMap() {
  const { vehicle } = useVehicle();
  const [map, setMap] = useState(null);
  const [mapMode, setMapMode] = useState("map");

  const hasGps = vehicle.lat !== null && vehicle.lon !== null;

  const displayPos = useSmoothPosition(
    hasGps ? vehicle.lat : null,
    hasGps ? vehicle.lon : null
  );

  const egoIcon = useRef(buildEgoIcon(vehicle.heading));
  const lastHeading = useRef(vehicle.heading);
  if (vehicle.heading !== lastHeading.current) {
    lastHeading.current = vehicle.heading;
    egoIcon.current = buildEgoIcon(vehicle.heading);
  }

  const handleMapReady = useCallback((m) => setMap(m), []);
  const zoomIn = () => map?.zoomIn();
  const zoomOut = () => map?.zoomOut();
  const centerOnEgo = () => {
    if (map && hasGps) map.flyTo([vehicle.lat, vehicle.lon], 17, { duration: 1 });
  };

  return (
    <div className="map-container-wrapper">

      {!hasGps && (
        <div className="map-no-gps">
          <div className="map-no-gps-inner">
            <div className="map-no-gps-icon">◎</div>
            <span>WAITING FOR GPS</span>
            <p>
              {vehicle.backendConnected
                ? vehicle.androidConnected
                  ? "Connected — awaiting first fix"
                  : "Android not connected"
                : "Backend not connected"}
            </p>
          </div>
        </div>
      )}

      <MapContainer
        center={[20, 78]}
        zoom={5}
        zoomControl={false}
        attributionControl={true}
        className="vehicle-map"
      >
        {mapMode === "map" ? (
          <TileLayer
            key="map"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
        ) : (
          <TileLayer
            key="satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
          />
        )}

        <MapController onReady={handleMapReady} />

        {/* Auto-fly to vehicle on first GPS fix */}
        <FlyToVehicle lat={vehicle.lat} lon={vehicle.lon} />

        {displayPos && (
          <Marker position={displayPos} icon={egoIcon.current}>
            <Popup>
              <strong>Ego Vehicle</strong><br />
              Lat: {vehicle.lat?.toFixed(6)}<br />
              Lon: {vehicle.lon?.toFixed(6)}<br />
              Heading: {vehicle.heading?.toFixed(1)}°
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <div className="map-mode">
        <span className={mapMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}>MAP</span>
        <span className={mapMode === "satellite" ? "active" : ""} onClick={() => setMapMode("satellite")}>SATELLITE</span>
      </div>

      <div className="map-top-controls">
        <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
        <button type="button" onClick={zoomOut} aria-label="Zoom out">−</button>
        <button
          type="button"
          onClick={centerOnEgo}
          aria-label="Center on ego vehicle"
          title={hasGps ? "Center on vehicle" : "GPS unavailable"}
          style={{ opacity: hasGps ? 1 : 0.4 }}
        >◎</button>
      </div>
    </div>
  );
}

export default VehicleMap;
