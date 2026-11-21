import { hasRoadName, isMoving, VEHICLE_LABELS } from "../../utils/display";
import { vehicleImage } from "../../utils/vehicleImages";
import Icon from "../common/Icon";

const GIVE_WAY_STEPS = ["Stop", "Let it pass", "Continue"];

// Vehicles in the road picture, compared with their size on the map
const SCENE_SCALE = 0.9;

// Each has its own icon, so an alert doesn't rely on colour alone. The scene
// shows the narrow road from the side: the other vehicle on the left, yours
// on the right, and which of you goes.
const MESSAGES = {
  GIVE_WAY: {
    icon: "yield",
    tone: "stop",
    title: "Give way",
    detail: (other) => `Stop and let ${other} pass`,
    reason: (other) => `${other} entered first`,
    scene: {
      other: "Entered first",
      own: "Wait here",
      goes: "other",
      stopLine: true,
    },
    step: (moving) => (moving ? 0 : 1),
  },
  RIGHT_OF_WAY: {
    icon: "arrowUp",
    tone: "go",
    title: "You have right of way",
    detail: () => "Continue slowly",
    reason: (other) => `${other} should give way`,
    scene: { other: "Giving way", own: "Entered first", goes: "own" },
  },
  VEHICLE_ENTERING: {
    icon: "car",
    tone: "warning",
    title: "Vehicle about to enter",
    detail: (other) =>
      `Slow down, ${other === "the other vehicle" ? "another vehicle" : other} is approaching this road`,
    scene: { other: "Approaching", own: "In the road", outside: true },
  },
  ROAD_CLEAR: {
    icon: "check",
    tone: "clear",
    title: "Road clear",
    detail: () => "You can continue",
    reason: (other) => `${other} has passed`,
    step: () => 2,
  },
  IN_NARROW_ROAD: {
    icon: "road",
    tone: "caution",
    title: "Narrow road",
    detail: () => "Proceed with caution",
  },

  // Someone at an entrance, who has been told to wait for this driver
  VEHICLE_WAITING: {
    icon: "car",
    tone: "caution",
    title: "Vehicle waiting",
    detail: (other) =>
      `${capitalize(other === "the other vehicle" ? "another vehicle" : other)} is waiting for you to pass`,
  },

  // At the entrance of a narrow road, before going in
  ENTRY_GO: {
    icon: "arrowUp",
    tone: "go",
    title: "Go ahead",
    detail: () => "The narrow road ahead is clear",
  },
  ENTRY_FOLLOW: {
    icon: "arrowUp",
    tone: "go",
    title: "Go ahead",
    detail: (other) =>
      `Follow ${other === "the other vehicle" ? "the vehicle" : other} ahead`,
    reason: () => "Going the same way",
  },
  ENTRY_WAIT: {
    icon: "yield",
    tone: "stop",
    title: "Wait at the entrance",
    detail: (other, alert) =>
      alert.reason === "OCCUPIED"
        ? `${capitalize(other)} ${alert.otherCount > 1 ? "are" : "is"} in the narrow road`
        : `${capitalize(other)} is about to enter from the other end`,
    reason: () => "You'll be told when it's clear",
  },
  // Mountain Mode, at a hairpin bend
  BEND_STOP: {
    icon: "yield",
    tone: "stop",
    title: "Stop before the bend",
    detail: (other) =>
      `${capitalize(other)} is coming from the opposite direction`,
    reason: (other, alert) =>
      `Wait at the marked point · Hairpin ${alert.bendNumber}`,
  },
  BEND_GO: {
    icon: "arrowUp",
    tone: "go",
    title: "Take the bend",
    detail: (other) =>
      `${capitalize(other)} is waiting for you on the other side`,
    reason: (other, alert) => `Hairpin ${alert.bendNumber}`,
  },
  BEND_KEEP_LEFT: {
    icon: "car",
    tone: "caution",
    title: "Vehicle round the bend",
    detail: () => "A vehicle is coming from the opposite direction. Keep left",
    reason: (other, alert) => `Hairpin ${alert.bendNumber}`,
  },
  BEND_CLEAR: {
    icon: "check",
    tone: "clear",
    title: "Bend clear",
    detail: () => "Go ahead",
    reason: (other, alert) => `Hairpin ${alert.bendNumber}`,
  },
  BEND_NO_OVERTAKE: {
    icon: "warning",
    tone: "caution",
    title: "Don't overtake",
    detail: (other) => `${capitalize(other)} ahead is turning at the bend`,
    reason: (other, alert) => `Hairpin ${alert.bendNumber}`,
  },

  ENTRY_PRIORITY: {
    icon: "car",
    tone: "warning",
    title: "Vehicle in the road",
    detail: (other) =>
      `${capitalize(other)} ${other === "other vehicles" ? "have" : "has"} been told you're coming`,
  },
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// When a priority vehicle, such as an ambulance, decided who goes, rather
// than who came first
const PRIORITY_MESSAGES = {
  GIVE_WAY: {
    detail: (other) => `Pull over and let ${other} pass`,
    reason: (other) => `${other} has right of way`,
    scene: {
      other: "Goes first",
      own: "Wait here",
      goes: "other",
      stopLine: true,
    },
  },
  RIGHT_OF_WAY: {
    detail: () => "Continue, others are giving way to you",
    scene: { other: "Giving way", own: "Goes first", goes: "own" },
  },
  ENTRY_WAIT: {
    reason: (other) => `${capitalize(other)} goes first`,
  },
};

// Shorter names for the road picture, where space is tight
const SCENE_NAMES = { priority: "Priority" };

// "the bus", or "other vehicles" when there is more than one
function otherName(alert) {
  if (alert.otherCount > 1) {
    return "other vehicles";
  }

  const label = VEHICLE_LABELS[alert.otherVehicleType];

  return label ? `the ${label.toLowerCase()}` : "the other vehicle";
}

function SceneVehicle({ type, own, facing, label, highlight }) {
  const image = vehicleImage(type);

  return (
    <div
      className={`cv-scene-vehicle${highlight ? " cv-scene-vehicle--goes" : ""}`}
    >
      <span className="cv-scene-image">
        <img
          src={own ? image.own : image.other}
          alt=""
          draggable="false"
          style={{
            height: `${Math.round(image.height * SCENE_SCALE)}px`,
            transform: `rotate(${facing === "right" ? 90 : -90}deg)`,
          }}
        />
      </span>

      <span className="cv-scene-label">
        <b>
          {own
            ? "You"
            : (SCENE_NAMES[type] ?? VEHICLE_LABELS[type] ?? "Vehicle")}
        </b>
        {label}
      </span>
    </div>
  );
}

function RoadScene({ scene, ownType, otherType, otherCount }) {
  const flow = scene.goes === "own" ? "left" : "right";

  return (
    <div
      className={`cv-scene${scene.outside ? " cv-scene--outside" : ""}`}
      aria-hidden="true"
    >
      <div className="cv-scene-road">
        <SceneVehicle
          type={otherType}
          facing="right"
          label={scene.other}
          highlight={scene.goes === "other"}
        />

        {otherCount > 1 && (
          <span className="cv-scene-more">+{otherCount - 1}</span>
        )}

        <div
          className={`cv-scene-flow cv-scene-flow--${scene.goes ? flow : "none"}`}
        >
          <span />
          <span />
          <span />
        </div>

        {scene.stopLine && <span className="cv-scene-stop" />}

        <SceneVehicle
          type={ownType}
          own
          facing="left"
          label={scene.own}
          highlight={scene.goes === "own"}
        />
      </div>
    </div>
  );
}

function Steps({ active }) {
  return (
    <ol className="cv-alert-steps">
      {GIVE_WAY_STEPS.map((step, index) => (
        <li
          key={step}
          className={
            index < active
              ? "is-done"
              : index === active
                ? "is-current"
                : undefined
          }
          aria-current={index === active ? "step" : undefined}
        >
          <span>
            {index < active ? <Icon name="check" size={12} /> : index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

function NarrowRoadAlert({ alert, vehicle }) {
  const basic = MESSAGES[alert?.kind];

  if (!basic) {
    return null;
  }

  const message = alert.byPriority
    ? { ...basic, ...PRIORITY_MESSAGES[alert.kind] }
    : basic;

  const other = otherName(alert);

  const note = [
    message.reason && capitalize(message.reason(other, alert)),
    hasRoadName(alert.roadName) ? alert.roadName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="alert"
      className={`cv-alert cv-alert--${message.tone}`}
      data-kind={alert.kind}
    >
      <div className="cv-alert-head">
        <div className="cv-alert-icon">
          <Icon name={message.icon} size={34} />
        </div>

        <div className="cv-alert-text">
          <strong>{message.title}</strong>
          <span>{message.detail(other, alert)}</span>
          {note && <small>{note}</small>}
        </div>
      </div>

      {message.scene && (
        <RoadScene
          scene={message.scene}
          ownType={vehicle?.vehicleType}
          otherType={alert.otherVehicleType}
          otherCount={alert.otherCount ?? 1}
        />
      )}

      {message.step && <Steps active={message.step(isMoving(vehicle ?? {}))} />}
    </div>
  );
}

export default NarrowRoadAlert;
