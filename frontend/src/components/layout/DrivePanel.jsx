import { useVehicle } from "../../context/VehicleContext";
import {
  formatDistance,
  haversineDistance,
} from "../../utils/haversine";
import {
  displayRoadName,
  displayVehicleName,
  isMoving,
  travelDirection,
} from "../../utils/display";
import Icon from "../common/Icon";

const KMH_PER_MPS = 3.6;
const MAX_NEARBY_SHOWN = 4;
const GAUGE_MAX_KMH = 80;

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

  const speed =
    hasPosition && egoVehicle.speed !== null
      ? Math.round(egoVehicle.speed * KMH_PER_MPS)
      : null;

  const direction = hasPosition
    ? travelDirection(egoVehicle)
    : null;

  const nearby = hasPosition
    ? Object.values(vehicles)
        .filter(
          (v) =>
            v.vehicleId !== myVehicleId &&
            v.active &&
            v.lat !== null
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

  const inNarrowRoad = Boolean(alert?.roadId);

  const gaugePercent = Math.min(
    100,
    ((speed ?? 0) / GAUGE_MAX_KMH) * 100
  );

  return (
    <aside className="cv-panel cv-drive-panel">
      <section className="cv-speed-section">
        <div className="cv-speed">
          <svg viewBox="0 0 140 124" aria-hidden="true">
            <path
              className="cv-gauge-track"
              pathLength="100"
              d="M29 111 A58 58 0 1 1 111 111"
            />
            <path
              className="cv-gauge-value"
              pathLength="100"
              strokeDasharray={`${gaugePercent} 100`}
              d="M29 111 A58 58 0 1 1 111 111"
            />
          </svg>

          <div className="cv-speed-value">
            <strong>{speed ?? "–"}</strong>
            <span>km/h</span>
          </div>
        </div>

        <div className="cv-compass">
          <span
            className="cv-compass-arrow"
            style={{
              transform: `rotate(${direction ?? 0}deg)`,
              opacity: direction === null ? 0.3 : 1,
            }}
          >
            <Icon name="navigation" size={22} />
          </span>

          <span>
            {direction === null ? "–" : compassPoint(direction)}
          </span>
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

      <section className="cv-nearby">
        <div className="cv-nearby-header">
          <span className="cv-section-label">Nearby vehicles</span>
          <span className="cv-count">{nearby.length}</span>
        </div>

        {nearby.length === 0 ? (
          <p className="cv-nearby-empty">
            No other vehicles nearby
          </p>
        ) : (
          <ul>
            {nearby.slice(0, MAX_NEARBY_SHOWN).map((v) => (
              <li key={v.vehicleId}>
                <span className="cv-nearby-icon">
                  <Icon name="car" size={16} />
                </span>

                <div>
                  <strong>{displayVehicleName(v.vehicleId)}</strong>
                  <span>
                    {isMoving(v) ? "Moving" : "Stopped"}
                  </span>
                </div>

                <b>{formatDistance(v.distance)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

export default DrivePanel;
