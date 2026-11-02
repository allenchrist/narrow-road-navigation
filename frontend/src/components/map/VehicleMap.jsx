import {
  MapContainer,
  TileLayer,
  useMap,
} from "react-leaflet";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";

import "leaflet/dist/leaflet.css";

import { useVehicle } from "../../context/VehicleContext";
import {
  haversineDistance,
} from "../../utils/haversine";

import VehicleMarker from "./VehicleMarker";
import NarrowRoadLayer from "./NarrowRoadLayer";
import NarrowRoadAlert from "../alerts/NarrowRoadAlert";
import { useAlertSound } from "../../hooks/useAlertSound";

/*
 * ---------------------------------------------------------
 * Ego map follower
 * ---------------------------------------------------------
 */

function FollowEgo({
  lat,
  lon,
}) {
  const map = useMap();

  const initializedRef =
    useRef(false);

  useEffect(() => {
    if (
      lat === null ||
      lon === null
    ) {
      return;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;

      map.flyTo(
        [lat, lon],
        17,
        {
          duration: 1.2,
          easeLinearity: 0.25,
        }
      );

      return;
    }

    map.panTo(
      [lat, lon],
      {
        animate: true,
        duration: 0.5,
        easeLinearity: 0.25,
      }
    );
  }, [
    lat,
    lon,
    map,
  ]);

  return null;
}

/*
 * ---------------------------------------------------------
 * Map controller
 * ---------------------------------------------------------
 */

function MapController({
  onReady,
}) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [
    map,
    onReady,
  ]);

  return null;
}

/*
 * ---------------------------------------------------------
 * Vehicle Map
 * ---------------------------------------------------------
 */

function VehicleMap() {
  const {
    vehicles,
    egoVehicle,
    myVehicleId,
    sessionError,
  } = useVehicle();

  const [map, setMap] =
    useState(null);

  const [mapMode, setMapMode] =
    useState("map");

  const [soundOn, setSoundOn] =
    useState(true);

  // An alert from before a lost connection may no longer be true
  const alert =
    egoVehicle.backendConnected && egoVehicle.connected
      ? egoVehicle.narrowRoadAlert
      : null;

  useAlertSound(alert?.level, soundOn);

  /*
   * Ego GPS availability
   */

  const hasEgoGps =
    egoVehicle.lat !== null &&
    egoVehicle.lon !== null;

  /*
   * Other vehicles are visible
   * only when connected.
   */

  const vehicleList =
    Object.values(vehicles).filter(
      (v) =>
        v.vehicleId === myVehicleId ||
        v.connected === true
    );

  /*
   * Map reference
   */

  const handleMapReady =
    useCallback(
      (mapInstance) => {
        setMap(mapInstance);
      },
      []
    );

  /*
   * -------------------------------------------------------
   * Controls
   * -------------------------------------------------------
   */

  const zoomIn = () => {
    map?.zoomIn();
  };

  const zoomOut = () => {
    map?.zoomOut();
  };

  const centerOnEgo = () => {
    if (
      !map ||
      !hasEgoGps
    ) {
      return;
    }

    map.flyTo(
      [
        egoVehicle.lat,
        egoVehicle.lon,
      ],
      17,
      {
        duration: 1,
        easeLinearity: 0.25,
      }
    );
  };

  return (
    <div className="map-container-wrapper">

      {/* --------------------------------------------------
          No vehicles
      -------------------------------------------------- */}

      {vehicleList.length === 0 && (
        <div className="map-no-gps">

          <div className="map-no-gps-inner">

            <div className="map-no-gps-icon">
              ◎
            </div>

            <span>
              WAITING FOR VEHICLES
            </span>

            <p>
              {egoVehicle.backendConnected
                ? "Backend connected — no vehicles registered yet"
                : "Backend not connected"}
            </p>

          </div>

        </div>
      )}

      {/* --------------------------------------------------
          Leaflet Map
      -------------------------------------------------- */}

      <MapContainer
        center={[20, 78]}
        zoom={5}
        zoomControl={false}
        attributionControl={true}
        className="vehicle-map"
      >

        {/* ------------------------------------------------
            Map / Satellite
        ------------------------------------------------ */}

        {mapMode === "map" ? (

          <TileLayer
            key="map"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

        ) : (

          <TileLayer
            key="satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
          />

        )}

        {/* ------------------------------------------------
            Map controller
        ------------------------------------------------ */}

        <MapController
          onReady={handleMapReady}
        />

        {/* ------------------------------------------------
            Follow ego vehicle
        ------------------------------------------------ */}

        <FollowEgo
          lat={egoVehicle.lat}
          lon={egoVehicle.lon}
        />

        {/* ------------------------------------------------
            Narrow roads
        ------------------------------------------------ */}

        <NarrowRoadLayer
          activeRoadId={alert?.roadId}
        />

        {/* ------------------------------------------------
            Render all vehicles
        ------------------------------------------------ */}

        {vehicleList.map((v) => {

          const isEgo =
            v.vehicleId ===
            myVehicleId;

          const distanceFromEgo =
            !isEgo &&
            hasEgoGps &&
            v.lat !== null &&
            v.lon !== null
              ? haversineDistance(
                  egoVehicle.lat,
                  egoVehicle.lon,
                  v.lat,
                  v.lon
                )
              : null;

          return (
            <VehicleMarker
              key={v.vehicleId}
              vehicleData={v}
              isEgo={isEgo}
              distanceFromEgo={
                distanceFromEgo
              }
            />
          );
        })}

      </MapContainer>

      {/* --------------------------------------------------
          Map mode
      -------------------------------------------------- */}

      <div className="map-mode">

        <span
          className={
            mapMode === "map"
              ? "active"
              : ""
          }
          onClick={() =>
            setMapMode("map")
          }
        >
          MAP
        </span>

        <span
          className={
            mapMode === "satellite"
              ? "active"
              : ""
          }
          onClick={() =>
            setMapMode("satellite")
          }
        >
          SATELLITE
        </span>

      </div>

      {/* --------------------------------------------------
          Dashboard could not link to a vehicle
      -------------------------------------------------- */}

      {sessionError && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: "80px",
            left: "50%",
            transform:
              "translateX(-50%)",
            zIndex: 99999,
            background: "#24151a",
            color: "#ff6b6b",
            padding: "10px 16px",
            borderRadius: "8px",
            border: "1px solid #7a2934",
          }}
        >
          {sessionError}
        </div>
      )}

      <NarrowRoadAlert alert={alert} />

      {/* --------------------------------------------------
          Map controls
      -------------------------------------------------- */}

      <div className="map-top-controls">

        <button
          type="button"
          onClick={() =>
            setSoundOn((previous) => !previous)
          }
          aria-label={
            soundOn
              ? "Mute alert sound"
              : "Turn on alert sound"
          }
          title={
            soundOn
              ? "Mute alert sound"
              : "Turn on alert sound"
          }
        >
          {soundOn ? "🔊" : "🔇"}
        </button>

        <button
          type="button"
          onClick={zoomIn}
          aria-label="Zoom in"
        >
          +
        </button>

        <button
          type="button"
          onClick={zoomOut}
          aria-label="Zoom out"
        >
          −
        </button>

        <button
          type="button"
          onClick={centerOnEgo}
          aria-label="Center on ego vehicle"
          title={
            hasEgoGps
              ? "Center on vehicle"
              : "GPS unavailable"
          }
          style={{
            opacity:
              hasEgoGps
                ? 1
                : 0.4,
          }}
        >
          ◎
        </button>

      </div>

    </div>
  );
}

export default VehicleMap;