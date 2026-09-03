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
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32" id="Bust-In-Silhouette-High-Contrast--Streamline-Fluent-Emoji-High-Contrast" height="32" width="32">
  <desc>
    Bust In Silhouette High Contrast Streamline Emoji: https://streamlinehq.com
  </desc>
  <path fill="#000000" d="M17.6249 0.32h-3.2622c-0.8631 0.0011 -1.7161 0.1865 -2.502 0.5437 -0.7858 0.3573 -1.4862 0.8783 -2.0546 1.5281 -0.5682 0.6497 -0.9912 1.4134 -1.2406 2.2398 -0.2494 0.8264 -0.3195 1.6965 -0.2055 2.5522l0.0947 1.4604c-1.1597 0.1818 -2.0468 1.1853 -2.0468 2.3959 0 1.3175 1.0504 2.3895 2.3593 2.4246l0.1385 2.1351c0.1851 1.3835 0.8663 2.6527 1.9169 3.5716 0.7059 0.6175 1.5464 1.0488 2.4455 1.265 -2.959 0.524 -5.7256 1.8921 -7.9518 3.9674v-0.012c-1.9674 1.8337 -3.4291 4.1432 -4.2444 6.7061v0.1334c-0.0436 0.1272 -0.08 0.2568 -0.1092 0.3881l4.3505 0.0485 0.0029 0.0121h21.3675l0.0028 -0.0121 4.3509 -0.0485c-0.0086 -0.0238 -0.0177 -0.0476 -0.0267 -0.0712 -0.0415 -0.1093 -0.0825 -0.2172 -0.0825 -0.3169v-0.1334c-0.8197 -2.5608 -2.2809 -4.8693 -4.2444 -6.7061v0.0128c-2.2245 -2.0738 -4.9887 -3.442 -7.945 -3.967 0.9009 -0.2157 1.7434 -0.6475 2.4506 -1.2662 1.0507 -0.9189 1.7318 -2.1881 1.9169 -3.5716l0.1326 -2.1393c1.2666 -0.0805 2.2689 -1.1333 2.2689 -2.4204 0 -1.1843 -0.8488 -2.1703 -1.9714 -2.3829l0.0914 -1.4734c0.114 -0.8557 0.0439 -1.7258 -0.2056 -2.5522 -0.2493 -0.8264 -0.6723 -1.59 -1.2406 -2.2398 -0.5682 -0.6498 -1.2687 -1.1708 -2.0545 -1.528C19.3412 0.5065 18.4881 0.3211 17.6249 0.32Z" stroke-width="1"></path>
</svg>
          </button>

          {/* ------------------------------------------------
              PROFILE MENU
          ------------------------------------------------ */}

          {profileOpen && (
            <div className="profile-menu">

              <div className="profile-menu-header">
                <span className="profile-menu-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32" id="Bust-In-Silhouette-High-Contrast--Streamline-Fluent-Emoji-High-Contrast" height="32" width="32">
  <desc>
    Bust In Silhouette High Contrast Streamline Emoji: https://streamlinehq.com
  </desc>
  <path fill="#000000" d="M17.6249 0.32h-3.2622c-0.8631 0.0011 -1.7161 0.1865 -2.502 0.5437 -0.7858 0.3573 -1.4862 0.8783 -2.0546 1.5281 -0.5682 0.6497 -0.9912 1.4134 -1.2406 2.2398 -0.2494 0.8264 -0.3195 1.6965 -0.2055 2.5522l0.0947 1.4604c-1.1597 0.1818 -2.0468 1.1853 -2.0468 2.3959 0 1.3175 1.0504 2.3895 2.3593 2.4246l0.1385 2.1351c0.1851 1.3835 0.8663 2.6527 1.9169 3.5716 0.7059 0.6175 1.5464 1.0488 2.4455 1.265 -2.959 0.524 -5.7256 1.8921 -7.9518 3.9674v-0.012c-1.9674 1.8337 -3.4291 4.1432 -4.2444 6.7061v0.1334c-0.0436 0.1272 -0.08 0.2568 -0.1092 0.3881l4.3505 0.0485 0.0029 0.0121h21.3675l0.0028 -0.0121 4.3509 -0.0485c-0.0086 -0.0238 -0.0177 -0.0476 -0.0267 -0.0712 -0.0415 -0.1093 -0.0825 -0.2172 -0.0825 -0.3169v-0.1334c-0.8197 -2.5608 -2.2809 -4.8693 -4.2444 -6.7061v0.0128c-2.2245 -2.0738 -4.9887 -3.442 -7.945 -3.967 0.9009 -0.2157 1.7434 -0.6475 2.4506 -1.2662 1.0507 -0.9189 1.7318 -2.1881 1.9169 -3.5716l0.1326 -2.1393c1.2666 -0.0805 2.2689 -1.1333 2.2689 -2.4204 0 -1.1843 -0.8488 -2.1703 -1.9714 -2.3829l0.0914 -1.4734c0.114 -0.8557 0.0439 -1.7258 -0.2056 -2.5522 -0.2493 -0.8264 -0.6723 -1.59 -1.2406 -2.2398 -0.5682 -0.6498 -1.2687 -1.1708 -2.0545 -1.528C19.3412 0.5065 18.4881 0.3211 17.6249 0.32Z" stroke-width="1"></path>
</svg>
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