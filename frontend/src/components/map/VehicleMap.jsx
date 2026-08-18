import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { useVehicle } from "../../context/VehicleContext";
import { haversineDistance } from "../../utils/haversine";
import VehicleMarker from "./VehicleMarker";

function FlyToEgo({ lat, lon }) {
  const map = useMap();
  const hasFlown = useRef(false);
  useEffect(() => {
    if (!hasFlown.current && lat !== null && lon !== null) {
      hasFlown.current = true;
      map.flyTo([lat, lon], 17, { duration: 1.4, easeLinearity: 0.25 });
    }
  }, [lat, lon, map]);
  return null;
}

function MapController({ onReady }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

function VehicleMap() {
  const { vehicles, egoVehicle, myVehicleId } = useVehicle();
  const [map, setMap] = useState(null);
  const [mapMode, setMapMode] = useState("map");

  const hasEgoGps = egoVehicle.lat !== null && egoVehicle.lon !== null;
  const vehicleList = Object.values(vehicles);

  const handleMapReady = useCallback((m) => setMap(m), []);
  const zoomIn = () => map?.zoomIn();
  const zoomOut = () => map?.zoomOut();
  const centerOnEgo = () => {
    if (map && hasEgoGps) map.flyTo([egoVehicle.lat, egoVehicle.lon], 17, { duration: 1 });
  };

  return (
    <div className="map-container-wrapper">

      {vehicleList.length === 0 && (
        <div className="map-no-gps">
          <div className="map-no-gps-inner">
            <div className="map-no-gps-icon">◎</div>
            <span>WAITING FOR VEHICLES</span>
            <p>
              {egoVehicle.backendConnected
                ? "Backend connected — no vehicles registered yet"
                : "Backend not connected"}
            </p>
          </div>
        </div>
      )}

      <MapContainer
        center={[20, 78]}
        zoom={5}
        zoomControl={false}
        attributionControl={true}
        className="vehicle-map"
      >
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

        <MapController onReady={handleMapReady} />
        <FlyToEgo lat={egoVehicle.lat} lon={egoVehicle.lon} />

        {vehicleList.map((v) => {
          const isEgo = v.vehicleId === myVehicleId;
          const distanceFromEgo =
            !isEgo && hasEgoGps && v.lat !== null
              ? haversineDistance(egoVehicle.lat, egoVehicle.lon, v.lat, v.lon)
              : null;
          return (
            <VehicleMarker
              key={v.vehicleId}
              vehicleData={v}
              isEgo={isEgo}
              distanceFromEgo={distanceFromEgo}
            />
          );
        })}
      </MapContainer>

      <div className="map-mode">
        <span className={mapMode === "map" ? "active" : ""} onClick={() => setMapMode("map")}>MAP</span>
        <span className={mapMode === "satellite" ? "active" : ""} onClick={() => setMapMode("satellite")}>SATELLITE</span>
      </div>

      <div className="map-top-controls">
        <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
        <button type="button" onClick={zoomOut} aria-label="Zoom out">−</button>
        <button
          type="button"
          onClick={centerOnEgo}
          aria-label="Center on ego vehicle"
          title={hasEgoGps ? "Center on vehicle" : "GPS unavailable"}
          style={{ opacity: hasEgoGps ? 1 : 0.4 }}
        >◎</button>
      </div>
    </div>
  );
}

export default VehicleMap;
