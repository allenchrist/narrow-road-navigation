import { useVehicle } from "../../context/VehicleContext";
import { useState, useEffect } from "react";

function useClock() {
  const [display, setDisplay] = useState({ time: "", date: "" });

  useEffect(() => {
    function tick() {
      const now = new Date();
      const time = now.toLocaleTimeString("en-GB", { hour12: false });
      const date = now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).toUpperCase();
      setDisplay({ time, date });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return display;
}

function Header() {
  const { vehicle, gpsStatus } = useVehicle();
  const clock = useClock();

  const systemOnline = vehicle.backendConnected;
  const gpsActive = gpsStatus === "ACTIVE";

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-mark">CV</div>
        <div className="brand-text">
          <h1>Connected Vehicle</h1>
          <span>Vehicle Coordination &amp; Safety</span>
        </div>
      </div>

      <div className="header-status">
        <div className="system-status">
          <span
            className={`status-indicator ${systemOnline ? "online" : "offline"}`}
          ></span>
          <div>
            <strong>SYSTEM</strong>
            <span>{systemOnline ? "ONLINE" : "OFFLINE"}</span>
          </div>
        </div>

        <div className="system-status">
          <span
            className={`status-indicator ${
              gpsActive ? "online" : gpsStatus === "STALE" ? "standby" : "offline"
            }`}
          ></span>
          <div>
            <strong>GPS</strong>
            <span>{gpsStatus}</span>
          </div>
        </div>

        <div className="system-status">
          <span className="status-indicator standby"></span>
          <div>
            <strong>V2V</strong>
            <span>STANDBY</span>
          </div>
        </div>

        <div className="clock">
          <strong>{clock.time}</strong>
          <span>{clock.date}</span>
        </div>
      </div>
    </header>
  );
}

export default Header;
