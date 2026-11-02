import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useState, useEffect, useRef, useMemo } from "react";
import egoCar from "../../assets/ego-car.svg";
import { formatDistance } from "../../utils/haversine";
import {
  displayVehicleName,
  travelDirection,
} from "../../utils/display";

const ANIM_DURATION = 600;

const KMH_PER_MPS = 3.6;

// Small compass changes shouldn't redraw the marker
const ROTATION_STEP_DEGREES = 5;

const OTHER_VEHICLE_ARROW =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M12 2 4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>';

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

function buildIcon(rotation, isEgo, faded) {
  const opacity = faded ? 0.45 : 1;

  if (isEgo) {
    return L.divIcon({
      className: "cv-marker",
      html: `
        <div class="cv-marker-ego" style="opacity:${opacity}">
          <span class="cv-marker-ring"></span>
          <img src="${egoCar}" alt="" draggable="false" style="transform:rotate(${rotation}deg)"/>
        </div>`,
      iconSize: [64, 64],
      iconAnchor: [32, 32],
      popupAnchor: [0, -30],
    });
  }

  return L.divIcon({
    className: "cv-marker",
    html: `
      <div class="cv-marker-other" style="opacity:${opacity}">
        <div style="transform:rotate(${rotation}deg)">${OTHER_VEHICLE_ARROW}</div>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

/* ---------------------------------------------------------
   VehicleMarker — renders one vehicle on the map
--------------------------------------------------------- */
function VehicleMarker({ vehicleData, isEgo, distanceFromEgo }) {
  const { vehicleId, lat, lon, speed, active } = vehicleData;

  const displayPos = useSmoothPosition(lat, lon);

  const rotation =
    Math.round((travelDirection(vehicleData) ?? 0) / ROTATION_STEP_DEGREES) *
    ROTATION_STEP_DEGREES;

  const icon = useMemo(
    () => buildIcon(rotation, isEgo, !active),
    [rotation, isEgo, active]
  );

  if (!displayPos) return null;

  return (
    <Marker position={displayPos} icon={icon}>
      <Popup>
        <div className="cv-popup">
          <strong>
            {isEgo ? "Your vehicle" : displayVehicleName(vehicleId)}
          </strong>

          {distanceFromEgo !== null && (
            <div>
              <span>Distance</span>
              <b>{formatDistance(distanceFromEgo)}</b>
            </div>
          )}

          <div>
            <span>Speed</span>
            <b>
              {speed === null
                ? "–"
                : `${Math.round(speed * KMH_PER_MPS)} km/h`}
            </b>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

export default VehicleMarker;
