import { useVehicle } from "../../context/VehicleContext";
import { useProximityAlerts } from "../../hooks/useProximityAlerts";
import { formatDistance } from "../../utils/haversine";

function AlertPanel() {
  const { vehicles } = useVehicle();
  const alerts = useProximityAlerts(vehicles);

  if (alerts.length === 0) return null;

  return (
    <div className="alert-panel">
      <div className="alert-panel-header">
        <span className="alert-panel-title">⚠ PROXIMITY ALERTS</span>
        <span className="alert-count">{alerts.length}</span>
      </div>

      <div className="alert-list">
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert-item alert-item--${alert.level}`}>
            <div className="alert-icon">
              {alert.level === "critical" ? "🔴" : "🟡"}
            </div>
            <div className="alert-body">
              <span className="alert-vehicles">
                {alert.vehicleA} ↔ {alert.vehicleB}
              </span>
              <span className="alert-distance">
                {formatDistance(alert.distance)}
              </span>
            </div>
            <span className={`alert-level-badge alert-level-badge--${alert.level}`}>
              {alert.level.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AlertPanel;
