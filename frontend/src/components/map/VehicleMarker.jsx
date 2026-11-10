import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";

import {
  useSmoothPosition,
  useSteadyTarget,
  useTurnAngle,
} from "../../hooks/useSmoothPosition";
import { vehicleImage } from "../../utils/vehicleImages";
import {
  displayVehicleName,
  isMoving,
  travelDirection,
} from "../../utils/display";

const OTHER_VEHICLE_SCALE = 0.85;

function buildIcon(vehicleType, angle, isEgo, faded) {
  const opacity = faded ? 0.45 : 1;
  const image = vehicleImage(vehicleType);

  const imageTag = (src, scale) =>
    `<img src="${src}" alt="" draggable="false" style="width:${image.width * scale}px;height:${image.height * scale}px;transform:rotate(${angle}deg)"/>`;

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

/**
 * One vehicle on the map. It glides between GPS updates, holds still while
 * stopped, and turns smoothly. The map passes in the driver's own position,
 * which it also follows, so the two always match.
 */
function VehicleMarker({ vehicleData, isEgo, position }) {
  const { vehicleType, lat, lon, active, accuracy } = vehicleData;

  const target = useSteadyTarget(lat, lon, isMoving(vehicleData), accuracy);
  const ownPosition = useSmoothPosition(target);
  const shownPosition = position ?? ownPosition;

  const angle = useTurnAngle(travelDirection(vehicleData));

  const markerRef = useRef(null);

  // Rebuilt only when the vehicle's look changes. Turning is applied to the
  // image below, so it animates instead of the image being replaced.
  const icon = useMemo(
    () => buildIcon(vehicleType, angle, isEgo, !active),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicleType, isEgo, active],
  );

  useEffect(() => {
    const image = markerRef.current?.getElement()?.querySelector("img");

    if (image) {
      image.style.transform = `rotate(${angle}deg)`;
    }
  }, [angle, icon]);

  if (!shownPosition) return null;

  return (
    <Marker ref={markerRef} position={shownPosition} icon={icon}>
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
