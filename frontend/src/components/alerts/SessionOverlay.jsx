import { useNavigate } from "react-router-dom";

import { useVehicle } from "../../context/VehicleContext";
import { signOutDriver } from "../../services/driverSession";
import Icon from "../common/Icon";

// Keyed by the backend's session:error messages
const SESSION_MESSAGES = {
  "User not found": {
    icon: "person",
    title: "Account not found",
    detail: () =>
      "This account no longer exists. Log in with another one.",
    showLogOut: true,
  },
  "No device is associated with this account": {
    icon: "phone",
    title: "Log in on your phone",
    detail: () =>
      "Open the Connected Vehicle app and log in. This screen connects by itself.",
    waiting: true,
  },
  "Device is not currently connected": {
    icon: "phone",
    title: "Waiting for your phone",
    detail: () =>
      "Open the Connected Vehicle app on your phone and tap Connect. This screen connects by itself.",
    waiting: true,
  },
};

const CONNECTING = {
  icon: "cloudOff",
  title: "Connecting to the server",
  detail: () =>
    "This can take up to a minute if the server has been idle.",
  waiting: true,
};

const IDENTIFYING = {
  icon: "car",
  title: "Finding your vehicle",
  detail: () => "This only takes a moment.",
  waiting: true,
};

const UNKNOWN_ERROR = {
  icon: "cloudOff",
  title: "Couldn't load your vehicle",
  detail: () => "Trying again automatically.",
  waiting: true,
};

/**
 * Covers the map until this dashboard is linked to a vehicle,
 * and explains what the user needs to do.
 */
function SessionOverlay() {
  const {
    myVehicleId,
    backendConnected,
    sessionError,
  } = useVehicle();

  const navigate = useNavigate();

  if (myVehicleId) {
    return null;
  }

  const content = !backendConnected
    ? CONNECTING
    : sessionError
    ? SESSION_MESSAGES[sessionError] ?? UNKNOWN_ERROR
    : IDENTIFYING;

  return (
    <div className="cv-overlay">
      <div className="cv-card cv-message-card">
        <div className="cv-overlay-icon">
          <Icon name={content.icon} size={30} />
        </div>

        <h1>{content.title}</h1>

        <p>{content.detail()}</p>

        {content.waiting && (
          <div
            className="cv-spinner"
            role="progressbar"
            aria-label="Waiting"
          />
        )}

        {content.showLogOut && (
          <button
            type="button"
            className="cv-button"
            onClick={() => {
              signOutDriver();
              navigate("/", { replace: true });
            }}
          >
            Log out
          </button>
        )}
      </div>
    </div>
  );
}

export default SessionOverlay;
