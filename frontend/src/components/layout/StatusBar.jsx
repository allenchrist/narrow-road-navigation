import { useVehicle } from "../../context/VehicleContext";
import { useState, useEffect } from "react";

function useLastUpdateAge(lastReceivedAt) {
  const [age, setAge] = useState(null);

  useEffect(() => {
    if (!lastReceivedAt) {
      setAge(null);
      return;
    }
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - lastReceivedAt) / 1000);
      setAge(secs);
    }, 1000);
    return () => clearInterval(id);
  }, [lastReceivedAt]);

  return age;
}

function StatusBar() {
  const { vehicle, gpsStatus } = useVehicle();
  const age = useLastUpdateAge(vehicle.lastReceivedAt);

  const hasGps = vehicle.lat !== null;

  const gpsDotClass =
    gpsStatus === "ACTIVE"
      ? "online"
      : gpsStatus === "STALE"
      ? "standby"
      : "offline";

  const positionText = hasGps
    ? `${vehicle.lat.toFixed(6)}, ${vehicle.lon.toFixed(6)}`
    : "—";

  const headingText =
    vehicle.heading !== null ? `${vehicle.heading.toFixed(1)}°` : "—";

  const lastUpdateText =
    age === null
      ? "—"
      : age === 0
      ? "just now"
      : `${age}s ago`;

  return (
    <footer className="status-bar">
      <div className="status-group">
        <span className="status-label">GPS</span>
        <span className="status-value">
          <i className={`mini-dot ${gpsDotClass}`}></i>
          {gpsStatus}
        </span>
      </div>

      <div className="status-group">
        <span className="status-label">POSITION</span>
        <span className="status-value">{positionText}</span>
      </div>

      <div className="status-group">
        <span className="status-label">HEADING</span>
        <span className="status-value">{headingText}</span>
      </div>

      <div className="status-group">
        <span className="status-label">V2V</span>
        <span className="status-value">
          <i className="mini-dot standby"></i>
          STANDBY
        </span>
      </div>

      <div className="status-group">
        <span className="status-label">LAST UPDATE</span>
        <span className="status-value">{lastUpdateText}</span>
      </div>
    </footer>
  );
}

export default StatusBar;
