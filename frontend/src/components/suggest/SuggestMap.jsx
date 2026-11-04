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

const MARKING_COLOR = "#56c7ff";

function SuggestMap({ search, drawing, points, onPointAdded, onMapReady }) {
  return (
    <div className="suggest-road-map-wrapper cv-map--map">

      <MapContainer
        center={[10.958, 76.956]}
        zoom={15}
        zoomControl={true}
        className="suggest-road-map"
      >

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        <MapController onReady={onMapReady} />

        <DrawingLayer
          drawing={drawing}
          onPointAdded={onPointAdded}
        />

        <FlyToLocation
          location={search.searchLocation}
          zoom={16}
          duration={1}
        />

        {points.length >= 2 && (
          <Polyline
            positions={points}
            pathOptions={{
              color: MARKING_COLOR,
              weight: 4,
              dashArray: "8 6",
            }}
          />
        )}

        {points.map((point, index) => (
          <CircleMarker
            key={index}
            center={point}
            radius={6}
            pathOptions={{
              color: MARKING_COLOR,
              fillColor: MARKING_COLOR,
              fillOpacity: 1,
              weight: 2,
            }}
          />
        ))}

        {points.length >= 3 && (
          <Polygon
            positions={points}
            pathOptions={{
              color: MARKING_COLOR,
              weight: 3,
              fillColor: MARKING_COLOR,
              fillOpacity: 0.18,
            }}
          />
        )}

      </MapContainer>

      {search.searchError && (
        <div className="suggest-search-error">
          {search.searchError}
        </div>
      )}

      <SearchMatches search={search} />

      {drawing && (
        <div className="suggest-drawing-help">

          <strong>
            Mark the narrow road
          </strong>

          <span>
            Click around the road to mark its boundary.
          </span>

          <span>
            Points:{" "}
            {points.length}
          </span>

        </div>
      )}

    </div>
  );
}

export default SuggestMap;
