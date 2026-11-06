import {
  MapContainer,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import {
  useState,
  useEffect,
  useRef,
} from "react";

import "leaflet/dist/leaflet.css";

import { useVehicle } from "../../context/VehicleContext";
import Icon from "../common/Icon";
import { MapController } from "./mapHelpers";
import VehicleMarker from "./VehicleMarker";

// The closest the map tiles go
const MAX_ZOOM = 19;

const DRIVING_ZOOM = 17;

// Closer in a narrow road, where lanes are only a few metres wide, so the
// road shows past the vehicle images
const NARROW_ROAD_ZOOM = MAX_ZOOM;

// With an alert showing, the car sits this share of the map's height below
// the middle, so the alert card doesn't cover it
const ALERT_OFFSET_SHARE = 0.18;

// Shown until the first GPS position arrives
const DEFAULT_CENTER = [20, 78];
const DEFAULT_ZOOM = 5;

// The road you're in is tinted to match the alert card, softly enough that
// the map underneath still shows through
const ROAD_TINTS = {
  GIVE_WAY: "#ff5c63",
  RIGHT_OF_WAY: "#43d17a",
  ROAD_CLEAR: "#43d17a",
  VEHICLE_ENTERING: "#ff9b3d",
  IN_NARROW_ROAD: "#f2b84b",
};

const TILE_LAYERS = {
  map: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
};

// Where the map's middle should be, for the car to sit offsetShare below it
function centreFor(map, lat, lon, zoom, offsetShare) {
  const offset = map.getSize().y * offsetShare;

  return map.unproject(
    map.project([lat, lon], zoom).subtract([0, offset]),
    zoom
  );
}

/**
 * Keeps the map on the driver's car. Dragging the map pauses this,
 * so the driver can look around, until they press recenter. The zoom
 * only changes on entering or leaving a narrow road, so a driver who
 * zooms by hand keeps their zoom until then.
 */
function FollowEgo({
  lat,
  lon,
  following,
  zoom,
  offsetShare,
  onDragged,
  onZoomed,
}) {
  const map = useMap();

  const positionedRef = useRef(false);
  const zoomRef = useRef(zoom);

  useMapEvents({
    dragstart: onDragged,
    zoomend: (event) => onZoomed(event.target.getZoom()),
  });

  useEffect(() => {
    if (
      lat === null ||
      lon === null ||
      !following
    ) {
      return;
    }

    if (!positionedRef.current) {
      positionedRef.current = true;
      zoomRef.current = zoom;

      // Not animated: the next GPS update would interrupt an animation
      // and leave the map stuck at whatever zoom it had reached
      map.setView(centreFor(map, lat, lon, zoom, offsetShare), zoom, {
        animate: false,
      });

      return;
    }

    if (zoomRef.current !== zoom) {
      zoomRef.current = zoom;

      map.setView(centreFor(map, lat, lon, zoom, offsetShare), zoom, {
        animate: true,
      });

      return;
    }

    map.panTo(centreFor(map, lat, lon, map.getZoom(), offsetShare), {
      animate: true,
      duration: 0.8,
    });
  }, [lat, lon, following, zoom, offsetShare, map]);

  return null;
}

/**
 * The road you're in, as a soft band with a thin line through it, like a
 * highlighted route. Many lanes are narrower than a car image on the map,
 * so the band is drawn wider than the road itself, in screen pixels.
 */
function CurrentRoads({ roads, kind }) {
  const tint = ROAD_TINTS[kind] ?? ROAD_TINTS.IN_NARROW_ROAD;

  return roads.flatMap((road) => [
    <Polygon
      key={`${road.id}-band-${tint}`}
      positions={road.polygon}
      interactive={false}
      pathOptions={{
        className: "cv-current-road",
        color: tint,
        weight: 18,
        opacity: 0.18,
        fill: false,
        lineJoin: "round",
      }}
    />,
    <Polygon
      key={`${road.id}-line-${tint}`}
      positions={road.polygon}
      interactive={false}
      pathOptions={{
        className: "cv-current-road",
        color: tint,
        weight: 1.5,
        opacity: 0.6,
        fillColor: tint,
        fillOpacity: 0.22,
        lineJoin: "round",
      }}
    />,
  ]);
}

function VehicleMap({
  alert,
  soundOn,
  soundUnlocked,
  onToggleSound,
}) {
  const {
    vehicles,
    egoVehicle,
    myVehicleId,
  } = useVehicle();

  const [map, setMap] = useState(null);
  const [mapMode, setMapMode] = useState("map");
  const [following, setFollowing] = useState(true);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const hasEgoGps =
    egoVehicle.lat !== null &&
    egoVehicle.lon !== null;

  // Other vehicles only appear once this dashboard has its own vehicle.
  // A vehicle that stopped updating is hidden, so nobody relies on an old position.
  const vehicleList = myVehicleId
    ? Object.values(vehicles).filter(
        (v) =>
          v.lat !== null &&
          (v.vehicleId === myVehicleId || v.active)
      )
    : [];

  const tiles = TILE_LAYERS[mapMode];

  const inNarrowRoad = Boolean(alert?.roadId);
  const followZoom = inNarrowRoad ? NARROW_ROAD_ZOOM : DRIVING_ZOOM;
  const offsetShare = alert ? ALERT_OFFSET_SHARE : 0;

  const onMyCar =
    hasEgoGps &&
    following &&
    zoom === followZoom;

  const myCarLabel = !hasEgoGps
    ? "Waiting for GPS"
    : onMyCar
    ? "On my car"
    : "Go to my car";

  function goToMyCar() {
    if (!map || !hasEgoGps) {
      return;
    }

    setFollowing(true);

    map.setView(
      centreFor(map, egoVehicle.lat, egoVehicle.lon, followZoom, offsetShare),
      followZoom,
      { animate: true }
    );
  }

  return (
    <div className={`cv-map cv-map--${mapMode}`}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomControl={false}
        attributionControl={true}
        className="cv-map-canvas"
      >
        <TileLayer
          key={mapMode}
          url={tiles.url}
          attribution={tiles.attribution}
          maxZoom={MAX_ZOOM}
        />

        <MapController onReady={setMap} />

        <FollowEgo
          lat={egoVehicle.lat}
          lon={egoVehicle.lon}
          following={following}
          zoom={followZoom}
          offsetShare={offsetShare}
          onDragged={() => setFollowing(false)}
          onZoomed={setZoom}
        />

        {alert && (
          <CurrentRoads
            roads={egoVehicle.currentRoads ?? []}
            kind={alert.kind}
          />
        )}

        {vehicleList.map((v) => (
          <VehicleMarker
            key={v.vehicleId}
            vehicleData={v}
            isEgo={v.vehicleId === myVehicleId}
          />
        ))}
      </MapContainer>

      {myVehicleId && !soundUnlocked && soundOn && (
        <div className="cv-sound-hint">
          Tap anywhere to turn on alert sounds
        </div>
      )}

      <button
        type="button"
        className={`cv-mycar${
          hasEgoGps && !onMyCar ? " is-away" : ""
        }`}
        onClick={goToMyCar}
        disabled={!hasEgoGps}
        aria-label={myCarLabel}
        title={myCarLabel}
      >
        <Icon name="recenter" size={22} />
        <span className="cv-mycar-label">{myCarLabel}</span>
      </button>

      <div className="cv-map-controls">
        <div className="cv-segmented" role="group" aria-label="Map style">
          {[
            ["map", "Map"],
            ["satellite", "Satellite"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={mapMode === mode ? "is-active" : ""}
              aria-pressed={mapMode === mode}
              onClick={() => setMapMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="cv-control-group">
          <button
            type="button"
            className="cv-icon-button"
            onClick={onToggleSound}
            aria-label={soundOn ? "Mute alert sounds" : "Turn on alert sounds"}
            aria-pressed={!soundOn}
            title={soundOn ? "Mute alert sounds" : "Turn on alert sounds"}
          >
            <Icon name={soundOn ? "soundOn" : "soundOff"} />
          </button>

          <button
            type="button"
            className="cv-icon-button"
            onClick={() => map?.zoomIn()}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Icon name="plus" />
          </button>

          <button
            type="button"
            className="cv-icon-button"
            onClick={() => map?.zoomOut()}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Icon name="minus" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default VehicleMap;
