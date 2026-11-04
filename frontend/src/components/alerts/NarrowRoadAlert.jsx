import { formatDistance } from "../../utils/haversine";
import { hasRoadName } from "../../utils/display";
import Icon from "../common/Icon";

// Each has its own icon, so an alert doesn't rely on colour alone
const MESSAGES = {
  GIVE_WAY: {
    icon: "yield",
    tone: "stop",
    title: "Give way",
    detail: "Suggested: stop and let the other vehicle pass",
    note: "Oncoming vehicle entered first",
  },
  RIGHT_OF_WAY: {
    icon: "arrowUp",
    tone: "go",
    title: "You have right of way",
    detail: "Suggested: continue slowly",
    note: "Oncoming vehicle should give way",
  },
  VEHICLE_IN_ROAD: {
    icon: "car",
    tone: "stop",
    title: "Vehicle in this road",
    detail: "It may be stopped. Proceed slowly",
  },
  VEHICLE_ENTERING: {
    icon: "car",
    tone: "warning",
    title: "Vehicle about to enter",
    detail: "Another vehicle is approaching this road",
  },
  IN_NARROW_ROAD: {
    icon: "road",
    tone: "caution",
    title: "Narrow road",
    detail: "Proceed with caution",
  },
};

function NarrowRoadAlert({ alert }) {
  const message = MESSAGES[alert?.kind];

  if (!message) {
    return null;
  }

  const distance = alert.vehicleDistanceM;

  const note = [
    message.note,
    hasRoadName(alert.roadName) ? alert.roadName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="alert"
      className={`cv-alert cv-alert--${message.tone}`}
    >
      <div className="cv-alert-icon">
        <Icon name={message.icon} size={34} />
      </div>

      <div className="cv-alert-text">
        <strong>{message.title}</strong>
        <span>{message.detail}</span>

        {note && <small>{note}</small>}
      </div>

      {distance != null && (
        <div className="cv-alert-distance">
          <strong>{formatDistance(distance)}</strong>
          <span>away</span>
        </div>
      )}
    </div>
  );
}

export default NarrowRoadAlert;
