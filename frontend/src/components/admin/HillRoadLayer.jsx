import L from "leaflet";
import { useEffect } from "react";
import { Marker, Polyline, Popup, useMapEvents } from "react-leaflet";

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

/** While adding, a click on the map adds a hairpin there; Esc stops. */
function AddBendOnClick({ hill }) {
  useMapEvents({
    click: (event) => {
      if (hill.adding) hill.addBend([event.latlng.lat, event.latlng.lng]);
    },
  });

  useEffect(() => {
    if (!hill.adding) return undefined;

    const onKey = (event) => {
      if (event.key === "Escape") hill.stopAdding();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hill]);

  return null;
}

/**
 * The ghat roads for Mountain Mode on the admin map: each road, its hairpin
 * bends by number, and the waiting points before each bend. A waiting point
 * can be dragged, and a bend deleted from its popup.
 */
function HillRoadLayer({ hill }) {
  return [
    <AddBendOnClick key="add-bend" hill={hill} />,
    ...hill.roads.flatMap((road) => roadLayers(road, hill)),
  ];
}

function roadLayers(road, hill) {
  return [
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
          {bend.addedByAdmin && (
            <>
              <br />
              <em>Added by the admin</em>
            </>
          )}
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
  ];
}

export default HillRoadLayer;
