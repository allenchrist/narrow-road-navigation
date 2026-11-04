import {
  MapContainer,
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
import { haversineDistance } from "../../utils/haversine";
import Icon from "../common/Icon";
import { MapController } from "./mapHelpers";
import VehicleMarker from "./VehicleMarker";

const DRIVING_ZOOM = 17;

// Shown until the first GPS position arrives
const DEFAULT_CENTER = [20, 78];
const DEFAULT_ZOOM = 5;

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

/**
 * Keeps the map on the driver's car. Dragging the map pauses this,
 * so the driver can look around, until they press recenter.
 */
function FollowEgo({
  lat,
  lon,
  following,
  onDragged,
  onZoomed,
}) {
  const map = useMap();

  const positionedRef = useRef(false);

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

      // Not animated: the next GPS update would interrupt an animation
      // and leave the map stuck at whatever zoom it had reached
      map.setView([lat, lon], DRIVING_ZOOM, {
        animate: false,
      });

      return;
    }

    map.panTo([lat, lon], {
      animate: true,
      duration: 0.8,
    });
  }, [lat, lon, following, map]);

  return null;
}

function VehicleMap({
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

  const onMyCar =
    hasEgoGps &&
    following &&
    zoom === DRIVING_ZOOM;

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
      [egoVehicle.lat, egoVehicle.lon],
      DRIVING_ZOOM,
      { animate: true }
    );
  }

  return (
    <div className={`cv-map cv-map--${mapMode}`}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        attributionControl={true}
        className="cv-map-canvas"
      >
        <TileLayer
          key={mapMode}
          url={tiles.url}
          attribution={tiles.attribution}
        />

        <MapController onReady={setMap} />

        <FollowEgo
          lat={egoVehicle.lat}
          lon={egoVehicle.lon}
          following={following}
          onDragged={() => setFollowing(false)}
          onZoomed={setZoom}
        />

        {vehicleList.map((v) => {
          const isEgo = v.vehicleId === myVehicleId;

          return (
            <VehicleMarker
              key={v.vehicleId}
              vehicleData={v}
              isEgo={isEgo}
              distanceFromEgo={
                !isEgo && hasEgoGps
                  ? haversineDistance(
                      egoVehicle.lat,
                      egoVehicle.lon,
                      v.lat,
                      v.lon
                    )
                  : null
              }
            />
          );
        })}
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
