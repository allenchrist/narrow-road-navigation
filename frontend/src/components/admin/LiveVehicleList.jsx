import { ALERT_LABELS, ALERT_TINTS } from "../../utils/alerts";
import {
  displayRoadName,
  displayVehicleName,
  isMoving,
} from "../../utils/display";
import Icon from "../common/Icon";

function status(vehicle) {
  if (!vehicle.active) return "No recent position";
  if (vehicle.weakSignal) return "Weak signal";
  return isMoving(vehicle) ? "Moving" : "Stopped";
}

/**
 * Every connected vehicle, with its driver and what its screen is showing.
 * Clicking one shows it on the map.
 */
function LiveVehicleList({ live, onShow }) {
  const { vehicles, error } = live;

  if (error) {
    return <div className="admin-error">{error}</div>;
  }

  if (vehicles.length === 0) {
    return (
      <div className="admin-empty">
        No vehicles are connected. Vehicles appear here as soon as a phone taps
        Connect.
      </div>
    );
  }

  return (
    <div className="admin-road-list">
      {vehicles.map((vehicle) => {
        const alert = vehicle.narrowRoadAlert;
        const label = vehicle.active ? ALERT_LABELS[alert?.kind] : null;

        return (
          <button
            key={vehicle.vehicleId}
            type="button"
            className="admin-road-item admin-live-item"
            onClick={() => onShow(vehicle)}
          >
            <div className="admin-live-top">
              <span className="admin-live-icon">
                <Icon name={vehicle.vehicleType ?? "car"} size={16} />
              </span>

              <div>
                <strong>{displayVehicleName(vehicle)}</strong>
                <span>
                  {vehicle.username ?? "No account"} · {status(vehicle)}
                </span>
              </div>
            </div>

            {label && (
              <span
                className="admin-live-alert"
                style={{ "--alert-tint": ALERT_TINTS[alert.kind] }}
              >
                {label}
                {alert.roadName && ` · ${displayRoadName(alert.roadName)}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default LiveVehicleList;
