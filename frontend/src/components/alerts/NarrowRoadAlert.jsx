import { formatDistance } from "../../utils/haversine";
import { hasRoadName } from "../../utils/display";
import Icon from "../common/Icon";

const MESSAGES = {
  ONCOMING_VEHICLE: {
    title: "Oncoming vehicle",
    detail: "Slow down and find a place to pass",
  },
  VEHICLE_IN_ROAD: {
    title: "Vehicle in this road",
    detail: "It may be stopped. Proceed slowly",
  },
  VEHICLE_ENTERING: {
    title: "Vehicle about to enter",
    detail: "Another vehicle is approaching this road",
  },
  IN_NARROW_ROAD: {
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

  return (
    <div
      role="alert"
      className={`cv-alert cv-alert--${alert.level}`}
    >
      <div className="cv-alert-icon">
        <Icon
          name={alert.vehicleCount > 0 ? "car" : "warning"}
          size={36}
        />
      </div>

      <div className="cv-alert-text">
        <strong>{message.title}</strong>
        <span>{message.detail}</span>

        {hasRoadName(alert.roadName) && (
          <small>{alert.roadName}</small>
        )}
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
