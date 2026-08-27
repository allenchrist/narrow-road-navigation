import { useVehicle } from "../../context/VehicleContext";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

function useClock() {
  const [display, setDisplay] = useState({
    time: "",
    date: "",
  });

  useEffect(() => {
    function tick() {
      const now = new Date();

      const time = now.toLocaleTimeString("en-GB", {
        hour12: false,
      });

      const date = now
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .toUpperCase();

      setDisplay({
        time,
        date,
      });
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

  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] =
    useState(false);

  const profileRef = useRef(null);

  const systemOnline =
    vehicle.backendConnected;

  const gpsActive =
    gpsStatus === "ACTIVE";

  // --------------------------------------------------
  // Close profile menu when clicking outside
  // --------------------------------------------------

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  // --------------------------------------------------
  // Suggest Narrow Road
  // --------------------------------------------------

  function handleSuggestNarrowRoad() {
    setProfileOpen(false);

    navigate("/suggest-narrow-road");
  }

  return (
    <header className="app-header">

      {/* ------------------------------------------------
          BRAND
      ------------------------------------------------ */}

      <div className="brand-section">

        {/* ------------------------------------------------
            USER PROFILE BUTTON
        ------------------------------------------------ */}

        <div
          className="profile-container"
          ref={profileRef}
        >

          <button
            type="button"
            className="brand-mark profile-button"
            onClick={() =>
              setProfileOpen(
                (previous) => !previous
              )
            }
            aria-label="Open user profile"
            aria-expanded={profileOpen}
          >
            👤
          </button>

          {/* ------------------------------------------------
              PROFILE MENU
          ------------------------------------------------ */}

          {profileOpen && (
            <div className="profile-menu">

              <div className="profile-menu-header">
                <span className="profile-menu-icon">
                  👤
                </span>

                <div>
                  <strong>User</strong>

                  <span>
                    Connected Vehicle
                  </span>
                </div>
              </div>

              <div className="profile-menu-divider" />

              <button
                type="button"
                className="profile-menu-item"
                onClick={
                  handleSuggestNarrowRoad
                }
              >
                <span>🚧</span>

                <span>
                  Suggest Narrow Road
                </span>
              </button>

            </div>
          )}

        </div>

        {/* ------------------------------------------------
            BRAND TEXT
        ------------------------------------------------ */}

        <div className="brand-text">

          <h1>
            Connected Vehicle
          </h1>

          <span>
            Vehicle Coordination &amp; Safety
          </span>

        </div>

      </div>

      {/* ------------------------------------------------
          HEADER STATUS
      ------------------------------------------------ */}

      <div className="header-status">

        {/* SYSTEM */}

        <div className="system-status">

          <span
            className={`status-indicator ${
              systemOnline
                ? "online"
                : "offline"
            }`}
          ></span>

          <div>

            <strong>
              SYSTEM
            </strong>

            <span>
              {systemOnline
                ? "ONLINE"
                : "OFFLINE"}
            </span>

          </div>

        </div>

        {/* GPS */}

        <div className="system-status">

          <span
            className={`status-indicator ${
              gpsActive
                ? "online"
                : gpsStatus === "STALE"
                ? "standby"
                : "offline"
            }`}
          ></span>

          <div>

            <strong>
              GPS
            </strong>

            <span>
              {gpsStatus}
            </span>

          </div>

        </div>

        {/* V2V */}

        <div className="system-status">

          <span className="status-indicator standby"></span>

          <div>

            <strong>
              V2V
            </strong>

            <span>
              STANDBY
            </span>

          </div>

        </div>

        {/* CLOCK */}

        <div className="clock">

          <strong>
            {clock.time}
          </strong>

          <span>
            {clock.date}
          </span>

        </div>

      </div>

    </header>
  );
}

export default Header;