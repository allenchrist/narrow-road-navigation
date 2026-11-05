import { hasRoadName, VEHICLE_LABELS } from "../../utils/display";
import Icon from "../common/Icon";

// Each has its own icon, so an alert doesn't rely on colour alone
const MESSAGES = {
  GIVE_WAY: {
    icon: "yield",
    tone: "stop",
    title: "Give way",
    detail: "Suggested: stop and let the other vehicle pass",
    note: (other) => `The ${other} entered first`,
  },
  RIGHT_OF_WAY: {
    icon: "arrowUp",
    tone: "go",
    title: "You have right of way",
    detail: "Suggested: continue slowly",
    note: (other) => `The ${other} should give way`,
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

  const otherVehicle =
    VEHICLE_LABELS[alert.otherVehicleType]?.toLowerCase() ?? "other vehicle";

  const note = [
    message.note?.(otherVehicle),
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
    </div>
  );
}

export default NarrowRoadAlert;
