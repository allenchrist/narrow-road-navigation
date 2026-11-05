import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useState, useEffect, useRef, useMemo } from "react";
import egoAuto from "../../assets/ego-auto.svg";
import egoBus from "../../assets/ego-bus.svg";
import egoCar from "../../assets/ego-car.svg";
import egoLorry from "../../assets/ego-lorry.svg";
import egoTruck from "../../assets/ego-truck.svg";
import otherAuto from "../../assets/other-auto.svg";
import otherBus from "../../assets/other-bus.svg";
import otherCar from "../../assets/other-car.svg";
import otherLorry from "../../assets/other-lorry.svg";
import otherTruck from "../../assets/other-truck.svg";
import {
  displayVehicleName,
  isMoving,
  travelDirection,
} from "../../utils/display";

const ANIM_DURATION = 600;

// Your own vehicle in white, and others in amber. Sizes are for your own: a
// bus looks longer than a car and an auto smaller, while staying easy to spot.
const VEHICLE_IMAGES = {
  car: { own: egoCar, other: otherCar, width: 36, height: 72 },
  truck: { own: egoTruck, other: otherTruck, width: 32, height: 86 },
  lorry: { own: egoLorry, other: otherLorry, width: 34, height: 82 },
  bus: { own: egoBus, other: otherBus, width: 32, height: 83 },
  auto: { own: egoAuto, other: otherAuto, width: 32, height: 53 },
};

const OTHER_VEHICLE_SCALE = 0.85;

// Small compass changes shouldn't redraw the marker
const ROTATION_STEP_DEGREES = 5;

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

function buildIcon(vehicleType, rotation, isEgo, faded) {
  const opacity = faded ? 0.45 : 1;
  const image = VEHICLE_IMAGES[vehicleType] ?? VEHICLE_IMAGES.car;

  const imageTag = (src, scale) =>
    `<img src="${src}" alt="" draggable="false" style="width:${image.width * scale}px;height:${image.height * scale}px;transform:rotate(${rotation}deg)"/>`;

  if (isEgo) {
    return L.divIcon({
      className: "cv-marker",
      html: `
        <div class="cv-marker-ego" data-vehicle="${vehicleType}" style="opacity:${opacity}">
          <span class="cv-marker-ring"></span>
          ${imageTag(image.own, 1)}
        </div>`,
      iconSize: [84, 84],
      iconAnchor: [42, 42],
      popupAnchor: [0, -40],
    });
  }

  return L.divIcon({
    className: "cv-marker",
    html: `
      <div class="cv-marker-other" data-vehicle="${vehicleType}" style="opacity:${opacity}">
        ${imageTag(image.other, OTHER_VEHICLE_SCALE)}
      </div>`,
    iconSize: [72, 72],
    iconAnchor: [36, 36],
    popupAnchor: [0, -34],
  });
}

/* ---------------------------------------------------------
   VehicleMarker — renders one vehicle on the map
--------------------------------------------------------- */
function VehicleMarker({ vehicleData, isEgo }) {
  const { vehicleType, lat, lon, active } = vehicleData;

  const displayPos = useSmoothPosition(lat, lon);

  const rotation =
    Math.round((travelDirection(vehicleData) ?? 0) / ROTATION_STEP_DEGREES) *
    ROTATION_STEP_DEGREES;

  const icon = useMemo(
    () => buildIcon(vehicleType, rotation, isEgo, !active),
    [vehicleType, rotation, isEgo, active]
  );

  if (!displayPos) return null;

  return (
    <Marker position={displayPos} icon={icon}>
      <Popup>
        <div className="cv-popup">
          <strong>
            {isEgo ? "Your vehicle" : displayVehicleName(vehicleData)}
          </strong>

          <div>
            <span>Status</span>
            <b>{isMoving(vehicleData) ? "Moving" : "Stopped"}</b>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

export default VehicleMarker;
