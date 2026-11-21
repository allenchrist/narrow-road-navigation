import L from "leaflet";
import { Marker, Polyline, Popup } from "react-leaflet";

// A bend's number, at its middle
const bendIcon = (number) =>
  L.divIcon({
    className: "admin-bend-number",
    html: `<span>${number}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

// A waiting point, which can be dragged along the road
const waitIcon = L.divIcon({
  className: "admin-wait-point",
  html: "<span></span>",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/**
 * The ghat roads for Mountain Mode on the admin map: each road, its hairpin
 * bends by number, and the waiting points before each bend. A waiting point
 * can be dragged, and a bend deleted from its popup.
 */
function HillRoadLayer({ hill }) {
  return hill.roads.flatMap((road) => [
    <Polyline
      key={`hill-${road.id}`}
      positions={road.line}
      interactive={false}
      pathOptions={{ color: "#9c6cff", weight: 4, opacity: 0.7 }}
    />,

    ...road.bends.flatMap((bend) => [
      <Marker
        key={`bend-${road.id}-${bend.number}-${bend.startM}`}
        position={bend.apex}
        icon={bendIcon(bend.number)}
      >
        <Popup>
          <strong>Hairpin {bend.number}</strong>
          <br />
          {road.name}
          <br />
          <button
            type="button"
            className="admin-bend-delete"
            onClick={() => {
              if (
                window.confirm(
                  `Delete hairpin ${bend.number}? The bends above it are numbered one lower.`,
                )
              ) {
                hill.deleteBend(road.id, bend.number);
              }
            }}
          >
            Delete bend
          </button>
        </Popup>
      </Marker>,

      ...[
        ["below", bend.waitBelow],
        ["above", bend.waitAbove],
      ].map(([side, point]) => (
        <Marker
          key={`wait-${road.id}-${bend.number}-${side}-${point.join(",")}`}
          position={point}
          icon={waitIcon}
          draggable
          title={`Waiting point ${side} hairpin ${bend.number}. Drag to move.`}
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = event.target.getLatLng();
              hill.moveWaitingPoint(road.id, bend.number, side, [lat, lng]);
            },
          }}
        />
      )),
    ]),
  ]);
}

export default HillRoadLayer;
