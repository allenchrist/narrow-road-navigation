import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  CircleMarker,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import SearchMatches from "../common/SearchMatches";
import {
  DrawingLayer,
  FlyToLocation,
  MapController,
} from "../map/mapHelpers";

function AdminMap({ search, editor, review, onMapReady }) {
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

        <FlyToLocation
          location={searchLocation}
          zoom={17}
          duration={1.2}
        />

        <DrawingLayer
          drawing={drawing}
          onPointAdded={addPoint}
        />

        {/* Saved roads */}

        {roads.map((road) => (

          <Polygon
            key={`road-${road.id}`}
            positions={road.polygon}
            pathOptions={{
              color: "#ff5c63",
              weight: 3,
              fillColor: "#ff5c63",
              fillOpacity: 0.18,
            }}
          />

        ))}

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
                fillOpacity: selected ? 0.30 : 0.20,
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

      {drawing && (

        <div className="admin-drawing-help">

          <strong>
            Marking a narrow road
          </strong>

          <span>
            Click around the road to mark its boundary.
          </span>

          <span>
            Points:{" "}
            {currentPolygon.length}
          </span>

        </div>

      )}

    </div>
  );
}

export default AdminMap;
