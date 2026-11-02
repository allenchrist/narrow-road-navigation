import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useVehicle } from "../../context/VehicleContext";
import Icon from "../common/Icon";

const GPS_LABELS = {
  ACTIVE: { text: "Live", tone: "good" },
  WAITING: { text: "Searching", tone: "warn" },
  STALE: { text: "No update", tone: "warn" },
  OFFLINE: { text: "Phone offline", tone: "bad" },
  "NO VEHICLE": { text: "No phone", tone: "bad" },
  DISCONNECTED: { text: "Unavailable", tone: "bad" },
};

function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(
      () => setNow(new Date()),
      1000
    );

    return () => clearInterval(id);
  }, []);

  return now;
}

function StatusChip({ label, text, tone }) {
  return (
    <div className="cv-chip">
      <span className={`cv-dot cv-dot--${tone}`} />

      <div>
        <span className="cv-chip-label">{label}</span>
        <strong>{text}</strong>
      </div>
    </div>
  );
}

function TopBar() {
  const {
    username,
    backendConnected,
    gpsStatus,
  } = useVehicle();

  const navigate = useNavigate();
  const clock = useClock();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function closeOnOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const gps = GPS_LABELS[gpsStatus];

  return (
    <header className="cv-topbar">
      <div className="cv-topbar-brand">
        <div className="cv-brand-mark">
          <Icon name="car" size={22} />
        </div>

        <div className="cv-topbar-title">
          <span>Connected Vehicle</span>
          <strong>{username}</strong>
        </div>
      </div>

      <div className="cv-topbar-right">
        <div className="cv-topbar-chips">
          <StatusChip
            label="Server"
            text={backendConnected ? "Online" : "Offline"}
            tone={backendConnected ? "good" : "bad"}
          />

          <StatusChip
            label="GPS"
            text={gps.text}
            tone={gps.tone}
          />
        </div>

        <time className="cv-clock">
          {clock.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>

        <div className="cv-menu" ref={menuRef}>
          <button
            type="button"
            className="cv-icon-button"
            onClick={() =>
              setMenuOpen((previous) => !previous)
            }
            aria-label="Open menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Icon name="menu" />
          </button>

          {menuOpen && (
            <div className="cv-menu-list" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  navigate(
                    `/${encodeURIComponent(username)}/suggest-narrow-road`
                  )
                }
              >
                <Icon name="add" size={18} />
                Suggest a narrow road
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopBar;
