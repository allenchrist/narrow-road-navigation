import { useVehicle } from "../../context/VehicleContext";

function fmt(val, decimals, suffix = "") {
  if (val === null || val === undefined) return "—";
  return val.toFixed(decimals) + suffix;
}

function Sidebar() {
  const { vehicle } = useVehicle();

  const hasData = vehicle.lat !== null;

  const healthLabel = !vehicle.backendConnected
    ? "DISCONNECTED"
    : !vehicle.androidConnected
    ? "NO SIGNAL"
    : !hasData
    ? "WAITING"
    : vehicle.lastReceivedAt &&
      Date.now() - vehicle.lastReceivedAt > 5000
    ? "STALE"
    : "HEALTHY";

  const healthClass =
    healthLabel === "HEALTHY"
      ? "healthy"
      : healthLabel === "STALE"
      ? "stale"
      : "disconnected-label";

  const healthMsg =
    healthLabel === "HEALTHY"
      ? "Sensor stream receiving normally"
      : healthLabel === "STALE"
      ? "No update received recently"
      : healthLabel === "WAITING"
      ? "Awaiting first GPS fix"
      : "Android sensor stream offline";

  const healthBarWidth =
    healthLabel === "HEALTHY"
      ? "100%"
      : healthLabel === "STALE"
      ? "50%"
      : "15%";

  const healthBarColor =
    healthLabel === "HEALTHY"
      ? "var(--success)"
      : healthLabel === "STALE"
      ? "var(--warning)"
      : "var(--danger)";

  return (
    <aside className="vehicle-sidebar">
      <div className="section-heading">
        <span className="section-label">PRIMARY VEHICLE</span>
        <span className="vehicle-state">
          {vehicle.androidConnected ? "ACTIVE" : "OFFLINE"}
        </span>
      </div>

      <div className="ego-identity">
        <div className="ego-visual">
          <div className="ego-ring"></div>
          <span>🚗</span>
        </div>
        <div>
          <h2>EGO VEHICLE</h2>
          <p>Vehicle Node A</p>
        </div>
      </div>

      <div className="sidebar-divider"></div>

      {/* ── POSITION ── */}
      <div className="telemetry-section">
        <div className="telemetry-title">
          <span>POSITION</span>
          <span className="live-badge">{hasData ? "LIVE" : "NO DATA"}</span>
        </div>

        <div className="telemetry-grid">
          <div className="telemetry-item">
            <span>LATITUDE</span>
            <strong>{fmt(vehicle.lat, 6)}</strong>
          </div>

          <div className="telemetry-item">
            <span>LONGITUDE</span>
            <strong>{fmt(vehicle.lon, 6)}</strong>
          </div>

          <div className="telemetry-item full">
            <span>HEADING</span>
            <strong>{fmt(vehicle.heading, 1, "°")}</strong>
          </div>
        </div>
      </div>

      <div className="sidebar-divider"></div>

      {/* ── IMU ── */}
      <div className="telemetry-section">
        <div className="telemetry-title">
          <span>IMU STATUS</span>
          <span className="connected-text">
            {vehicle.androidConnected ? "CONNECTED" : "OFFLINE"}
          </span>
        </div>

        {/* Accelerometer */}
        <div className="sensor-block">
          <div className="sensor-row">
            <span>ACCELEROMETER</span>
            <span style={{ color: vehicle.androidConnected ? "var(--success)" : "var(--danger)" }}>●</span>
          </div>
          <div className="sensor-values">
            <span>X <strong>{fmt(vehicle.accelX, 2)}</strong></span>
            <span>Y <strong>{fmt(vehicle.accelY, 2)}</strong></span>
            <span>Z <strong>{fmt(vehicle.accelZ, 2)}</strong></span>
          </div>
        </div>

        {/* Gyroscope */}
        <div className="sensor-block">
          <div className="sensor-row">
            <span>GYROSCOPE</span>
            <span style={{ color: vehicle.androidConnected ? "var(--success)" : "var(--danger)" }}>●</span>
          </div>
          <div className="sensor-values">
            <span>X <strong>{fmt(vehicle.gyroX, 2)}</strong></span>
            <span>Y <strong>{fmt(vehicle.gyroY, 2)}</strong></span>
            <span>Z <strong>{fmt(vehicle.gyroZ, 2)}</strong></span>
          </div>
        </div>
      </div>

      <div className="sidebar-divider"></div>

      {/* ── VEHICLE HEALTH ── */}
      <div className="vehicle-health">
        <div className="health-header">
          <span>VEHICLE DATA</span>
          <span className={healthClass}>{healthLabel}</span>
        </div>

        <div className="health-bar">
          <div style={{ width: healthBarWidth, background: healthBarColor }}></div>
        </div>

        <p>{healthMsg}</p>
      </div>
    </aside>
  );
}

export default Sidebar;
