const STYLES = {
  danger: { background: "#b71c1c", color: "#ffffff", icon: "🚨" },
  warning: { background: "#e65100", color: "#ffffff", icon: "⚠️" },
  caution: { background: "#ffc107", color: "#1a1a1a", icon: "⚠️" },
};

const MESSAGES = {
  ONCOMING_VEHICLE: {
    title: "ONCOMING VEHICLE",
    detail: "Slow down and find a place to pass",
  },
  VEHICLE_IN_ROAD: {
    title: "VEHICLE IN THIS ROAD",
    detail: "It may be stopped. Proceed slowly",
  },
  VEHICLE_ENTERING: {
    title: "VEHICLE ABOUT TO ENTER",
    detail: "Another vehicle is approaching this road",
  },
  IN_NARROW_ROAD: {
    title: "NARROW ROAD",
    detail: "Proceed with caution",
  },
  WAIT_VEHICLE_IN_ROAD: {
    title: "WAIT: VEHICLE IN ROAD",
    detail: "Let it come through before entering",
  },
  VEHICLE_ALSO_APPROACHING: {
    title: "ANOTHER VEHICLE APPROACHING",
    detail: "It is heading for the same narrow road",
  },
  NARROW_ROAD_AHEAD: {
    title: "NARROW ROAD AHEAD",
    detail: "Be ready to slow down",
  },
};

function NarrowRoadAlert({ alert }) {
  const style = STYLES[alert?.level];
  const message = MESSAGES[alert?.kind];

  if (!style || !message) {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        top: "80px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 99999,
        background: style.background,
        color: style.color,
        padding: "20px 32px",
        borderRadius: "12px",
        border: "3px solid white",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        minWidth: "340px",
      }}
    >
      <div style={{ fontSize: "40px" }}>{style.icon}</div>

      <div>
        <div style={{ fontSize: "24px", fontWeight: "800" }}>
          {message.title}
        </div>

        <div style={{ fontSize: "16px", marginTop: "4px" }}>
          {message.detail}
        </div>

        <div style={{ fontSize: "14px", marginTop: "4px" }}>
          {alert.roadName}
          {alert.distanceM !== null && ` · ${alert.distanceM} m`}
        </div>
      </div>
    </div>
  );
}

export default NarrowRoadAlert;
