import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  CircleMarker,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import {
  ALERT_TINTS,
  ROAD_STATUS_LABELS,
  ROAD_STATUS_TINTS,
} from "../../utils/alerts";
import SearchMatches from "../common/SearchMatches";
import HillRoadLayer from "./HillRoadLayer";
import VehicleMarker from "../map/VehicleMarker";
import { DrawingLayer, FlyToLocation, MapController } from "../map/mapHelpers";

function AdminMap({
  search,
  editor,
  review,
  liveVehicles,
  roadStatuses = {},
  hill = null,
  onMapReady,
}) {
  const { searchLocation, searchError } = search;
  const { roads, drawing, currentPolygon, addPoint } = editor;
  const { pendingSuggestions, selectedSuggestionId, viewSuggestion } = review;

  return (
    <div className="admin-map cv-map--map">
      <MapContainer
        center={[10.958, 76.956]}
        zoom={15}
        zoomControl={true}
        className="admin-leaflet-map"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        <MapController onReady={onMapReady} />

        <FlyToLocation location={searchLocation} zoom={17} duration={1.2} />

        <DrawingLayer drawing={drawing} onPointAdded={addPoint} />

        {/* Saved roads, coloured by whether they're free, reserved or
            occupied right now */}

        {roads.map((road) => {
          const status = roadStatuses[road.id] ?? "AVAILABLE";
          const tint = ROAD_STATUS_TINTS[status];

          return (
            <Polygon
              key={`road-${road.id}-${status}`}
              positions={road.polygon}
              className={`admin-road admin-road--${status.toLowerCase()}`}
              pathOptions={{
                color: tint,
                weight: 3,
                fillColor: tint,
                fillOpacity: status === "AVAILABLE" ? 0.18 : 0.35,
              }}
            />
          );
        })}

        {/* Where vehicles drive in, and the roads leading there */}

        {roads.flatMap((road) =>
          (road.entrances ?? []).flatMap((entrance, index) => [
            ...(entrance.lanes ?? []).map((lane, laneIndex) => (
              <Polyline
                key={`lane-${road.id}-${index}-${laneIndex}`}
                positions={lane}
                interactive={false}
                pathOptions={{
                  color: "#56c7ff",
                  weight: 2,
                  opacity: 0.7,
                  dashArray: "4 5",
                }}
              />
            )),
            <CircleMarker
              key={`entrance-${road.id}-${index}`}
              center={entrance.point}
              radius={4}
              interactive={false}
              className="admin-entrance"
              pathOptions={{
                color: "#ffffff",
                weight: 1.5,
                fillColor: road.entrancesFound ? "#56c7ff" : "#9aa7b4",
                fillOpacity: 1,
              }}
            />,
          ]),
        )}

        {/* Ghat roads for Mountain Mode, with their hairpins */}

        {hill && !drawing && <HillRoadLayer hill={hill} />}

        {/* Drivers' suggestions */}

        {pendingSuggestions.map((suggestion) => {
          const selected = suggestion.id === selectedSuggestionId;

          return (
            <Polygon
              key={`suggestion-${suggestion.id}`}
              positions={suggestion.polygon}
              pathOptions={{
                color: selected ? "#ffd54f" : "#9c6cff",
                weight: selected ? 5 : 3,
                dashArray: "8 6",
                fillColor: selected ? "#ffd54f" : "#9c6cff",
                fillOpacity: selected ? 0.3 : 0.2,
              }}
              eventHandlers={{
                // While marking, a click here only adds a point
                click: () => {
                  if (!drawing) {
                    viewSuggestion(suggestion);
                  }
                },
              }}
            />
          );
        })}

        {/* Live vehicles, each ringed in the colour of its alert */}

        {liveVehicles.map((vehicle) => {
          const tint = vehicle.active
            ? ALERT_TINTS[vehicle.narrowRoadAlert?.kind]
            : null;

          return tint ? (
            <CircleMarker
              key={`ring-${vehicle.vehicleId}`}
              center={[vehicle.lat, vehicle.lon]}
              radius={24}
              interactive={false}
              pathOptions={{
                color: tint,
                weight: 2,
                fillColor: tint,
                fillOpacity: 0.18,
              }}
            />
          ) : null;
        })}

        {liveVehicles.map((vehicle) => (
          <VehicleMarker
            key={`vehicle-${vehicle.vehicleId}`}
            vehicleData={vehicle}
            isEgo={false}
          />
        ))}

        {/* Search result */}

        {searchLocation && (
          <CircleMarker
            center={[searchLocation.lat, searchLocation.lon]}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              fillColor: "#2196f3",
              fillOpacity: 1,
              weight: 3,
            }}
          />
        )}

        {/* The road being marked */}

        {currentPolygon.length >= 2 && (
          <Polyline
            positions={currentPolygon}
            pathOptions={{
              color: "#56c7ff",
              weight: 3,
              dashArray: "8 6",
            }}
          />
        )}

        {currentPolygon.map((point, index) => (
          <CircleMarker
            key={index}
            center={point}
            radius={5}
            pathOptions={{
              color: "#56c7ff",
              fillColor: "#56c7ff",
              fillOpacity: 1,
              weight: 2,
            }}
          />
        ))}
      </MapContainer>

      {searchError && (
        <div className="admin-search-error" role="alert">
          {searchError}
        </div>
      )}

      <SearchMatches search={search} />

      {!drawing && !hill?.adding && (
        <ul className="admin-map-legend" aria-label="Map key">
          {Object.entries(ROAD_STATUS_LABELS).map(([status, label]) => (
            <li key={status}>
              <span
                className="admin-legend-swatch"
                style={{ background: ROAD_STATUS_TINTS[status] }}
              />
              {label}
            </li>
          ))}
          <li>
            <span className="admin-legend-swatch admin-legend-swatch--entrance" />
            Entrance
          </li>
          <li>
            <span className="admin-legend-swatch admin-legend-swatch--bend" />
            Hairpin
          </li>
          <li>
            <span className="admin-legend-swatch admin-legend-swatch--wait" />
            Waiting point
          </li>
        </ul>
      )}

      {hill?.adding && !drawing && (
        <div className="admin-drawing-help admin-adding-help">
          <strong>Adding a hairpin</strong>

          <span>Click on the road where the hairpin is.</span>

          <button
            type="button"
            className="admin-edit-button"
            onClick={hill.stopAdding}
          >
            Done
          </button>
        </div>
      )}

      {drawing && (
        <div className="admin-drawing-help">
          <strong>Marking a narrow road</strong>

          <span>Click around the road to mark its boundary.</span>

          <span>Points: {currentPolygon.length}</span>
        </div>
      )}
    </div>
  );
}

export default AdminMap;
