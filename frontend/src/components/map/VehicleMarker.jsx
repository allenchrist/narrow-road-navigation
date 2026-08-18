import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useState, useEffect, useRef } from "react";
import egoCar from "../../assets/ego-car.svg";
import { formatDistance } from "../../utils/haversine";

const ANIM_DURATION = 600;

/* ---------------------------------------------------------
   Smooth position hook — shared by all vehicle markers
--------------------------------------------------------- */
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
   Build Leaflet DivIcon for a vehicle
--------------------------------------------------------- */
function buildIcon(heading, isEgo, connected) {
  const deg = typeof heading === "number" ? heading : 0;
  const opacity = connected ? 1 : 0.45;

  if (isEgo) {
    return L.divIcon({
      className: "vehicle-map-icon",
      html: `
        <div class="ego-car-wrapper" style="transform:rotate(${deg}deg);opacity:${opacity}">
          <div class="ego-car-glow"></div>
          <img src="${egoCar}" class="ego-car-img" alt="ego vehicle" draggable="false"/>
        </div>`,
      iconSize: [40, 56],
      iconAnchor: [20, 28],
      popupAnchor: [0, -32],
    });
  }

  // Other vehicles — amber/orange tinted marker
  return L.divIcon({
    className: "vehicle-map-icon",
    html: `
      <div class="other-car-wrapper" style="transform:rotate(${deg}deg);opacity:${opacity}">
        <div class="other-car-glow"></div>
        <div class="other-car-body">
          <div class="other-car-arrow"></div>
        </div>
      </div>`,
    iconSize: [32, 44],
    iconAnchor: [16, 22],
    popupAnchor: [0, -26],
  });
}

/* ---------------------------------------------------------
   VehicleMarker — renders one vehicle on the map
--------------------------------------------------------- */
function VehicleMarker({ vehicleData, isEgo, distanceFromEgo }) {
  const { vehicleId, lat, lon, heading, connected, lastReceivedAt } = vehicleData;

  const displayPos = useSmoothPosition(
    lat !== null ? lat : null,
    lon !== null ? lon : null
  );

  const iconRef = useRef(buildIcon(heading, isEgo, connected));
  const lastHeading = useRef(heading);
  const lastConnected = useRef(connected);

  if (heading !== lastHeading.current || connected !== lastConnected.current) {
    lastHeading.current = heading;
    lastConnected.current = connected;
    iconRef.current = buildIcon(heading, isEgo, connected);
  }

  if (!displayPos) return null;

  const ageSeconds = lastReceivedAt
    ? Math.floor((Date.now() - lastReceivedAt) / 1000)
    : null;

  const statusLabel = !connected
    ? "OFFLINE"
    : ageSeconds !== null && ageSeconds > 5
    ? "STALE"
    : "ONLINE";

  return (
    <Marker position={displayPos} icon={iconRef.current}>
      <Popup>
        <div className="vehicle-popup">
          <div className="vehicle-popup-header">
            <strong>{vehicleId}</strong>
            <span className={`vehicle-popup-status ${statusLabel.toLowerCase()}`}>
              {statusLabel}
            </span>
          </div>
          {lat !== null && (
            <>
              <div className="vehicle-popup-row">
                <span>Latitude</span><strong>{lat.toFixed(6)}</strong>
              </div>
              <div className="vehicle-popup-row">
                <span>Longitude</span><strong>{lon.toFixed(6)}</strong>
              </div>
              <div className="vehicle-popup-row">
                <span>Heading</span><strong>{heading?.toFixed(1)}°</strong>
              </div>
              {distanceFromEgo !== null && (
                <div className="vehicle-popup-row">
                  <span>Distance</span><strong>{formatDistance(distanceFromEgo)}</strong>
                </div>
              )}
            </>
          )}
          {ageSeconds !== null && (
            <div className="vehicle-popup-row">
              <span>Last update</span>
              <strong>{ageSeconds === 0 ? "just now" : `${ageSeconds}s ago`}</strong>
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

export default VehicleMarker;
