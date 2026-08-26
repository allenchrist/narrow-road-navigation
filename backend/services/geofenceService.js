const {
  getAllNarrowRoads,
} = require("./narrowRoadService");

// --------------------------------------------------
// Point-in-polygon
// polygon points are [latitude, longitude]
// --------------------------------------------------

function isPointInsidePolygon(lat, lon, polygon) {
  if (
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lon))
  ) {
    return false;
  }

  if (
    !Array.isArray(polygon) ||
    polygon.length < 3
  ) {
    return false;
  }

  const pointLat = Number(lat);
  const pointLon = Number(lon);

  let inside = false;

  for (
    let i = 0, j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const latI = Number(polygon[i][0]);
    const lonI = Number(polygon[i][1]);

    const latJ = Number(polygon[j][0]);
    const lonJ = Number(polygon[j][1]);

    if (
      !Number.isFinite(latI) ||
      !Number.isFinite(lonI) ||
      !Number.isFinite(latJ) ||
      !Number.isFinite(lonJ)
    ) {
      continue;
    }

    const intersects =
      (lonI > pointLon) !== (lonJ > pointLon) &&
      pointLat <
        ((latJ - latI) *
          (pointLon - lonI)) /
          (lonJ - lonI) +
          latI;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

// --------------------------------------------------
// Find narrow road at current vehicle position
// --------------------------------------------------

function findNarrowRoadAtPosition(lat, lon) {
  const roads = getAllNarrowRoads();

  for (const road of roads) {
    if (
      isPointInsidePolygon(
        lat,
        lon,
        road.polygon
      )
    ) {
      return {
        id: road.id,
        name: road.name,
      };
    }
  }

  return null;
}

// --------------------------------------------------
// Current geofence state
// --------------------------------------------------

function getGeofenceState(lat, lon) {
  const road =
    findNarrowRoadAtPosition(lat, lon);

  if (!road) {
    return {
      insideNarrowRoad: false,
      narrowRoadId: null,
      narrowRoadName: null,
    };
  }

  return {
    insideNarrowRoad: true,
    narrowRoadId: road.id,
    narrowRoadName: road.name,
  };
}

module.exports = {
  isPointInsidePolygon,
  findNarrowRoadAtPosition,
  getGeofenceState,
};