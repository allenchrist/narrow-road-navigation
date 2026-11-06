import { useVehicle } from "../../context/VehicleContext";
import { useTurnAngle } from "../../hooks/useSmoothPosition";
import { haversineDistance } from "../../utils/haversine";
import {
  displayRoadName,
  VEHICLE_LABELS,
  displayVehicleName,
  isMoving,
  travelDirection,
} from "../../utils/display";
import Icon from "../common/Icon";

const MAX_VEHICLES_SHOWN = 4;

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function compassPoint(degrees) {
  const normalized = ((degrees % 360) + 360) % 360;

  return COMPASS_POINTS[Math.round(normalized / 45) % COMPASS_POINTS.length];
}

function DrivePanel({ alert }) {
  const {
    vehicles,
    egoVehicle,
    myVehicleId,
  } = useVehicle();

  const hasPosition =
    egoVehicle.active && egoVehicle.lat !== null;

  const direction = hasPosition
    ? travelDirection(egoVehicle)
    : null;

  const arrowAngle = useTurnAngle(direction);

  const inNarrowRoad = Boolean(alert?.roadId);

  const inThisRoad = hasPosition && inNarrowRoad
    ? Object.values(vehicles)
        .filter(
          (v) =>
            v.vehicleId !== myVehicleId &&
            v.active &&
            v.inSameRoad
        )
        .map((v) => ({
          ...v,
          distance: haversineDistance(
            egoVehicle.lat,
            egoVehicle.lon,
            v.lat,
            v.lon
          ),
        }))
        .sort((a, b) => a.distance - b.distance)
    : [];

  return (
    <aside className="cv-panel cv-drive-panel">
      <section className="cv-heading">
        <span
          className="cv-compass-arrow"
          style={{
            transform: `rotate(${arrowAngle}deg)`,
            opacity: direction === null ? 0.3 : 1,
          }}
        >
          <Icon name="navigation" size={22} />
        </span>

        <div>
          <span className="cv-section-label">Heading</span>
          <strong>
            {direction === null ? (
              "–"
            ) : (
              <>
                {compassPoint(direction)}
                <span className="cv-heading-degrees">
                  {Math.round(direction) % 360}°
                </span>
              </>
            )}
          </strong>
        </div>
      </section>

      <section
        className={`cv-road-status${
          inNarrowRoad ? " cv-road-status--narrow" : ""
        }`}
      >
        <Icon name="road" />

        <div>
          <span className="cv-section-label">Road</span>
          <strong>
            {inNarrowRoad
              ? displayRoadName(alert.roadName)
              : "Regular road"}
          </strong>
        </div>
      </section>

      {inNarrowRoad && (
        <section className="cv-nearby">
          <div className="cv-nearby-header">
            <span className="cv-section-label">In this road</span>
            <span className="cv-count">{inThisRoad.length}</span>
          </div>

          {inThisRoad.length === 0 ? (
            <p className="cv-nearby-empty">
              No other vehicles in this road
            </p>
          ) : (
            <ul>
              {inThisRoad.slice(0, MAX_VEHICLES_SHOWN).map((v) => (
                <li key={v.vehicleId}>
                  <span className="cv-nearby-icon">
                    <Icon name={VEHICLE_LABELS[v.vehicleType] ? v.vehicleType : "car"} size={16} />
                  </span>

                  <div>
                    <strong>{displayVehicleName(v)}</strong>
                    <span>
                      {isMoving(v) ? "Moving" : "Stopped"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </aside>
  );
}

export default DrivePanel;
