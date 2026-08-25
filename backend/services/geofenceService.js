const {
  getAllNarrowRoads,
} = require("./narrowRoadService");

// --------------------------------------------------
// Check whether a GPS point is inside a polygon
// Ray-casting algorithm
// --------------------------------------------------

function isPointInsidePolygon(lat, lon, polygon) {
  const pointLat = Number(lat);
  const pointLon = Number(lon);

  if (
    !Number.isFinite(pointLat) ||
    !Number.isFinite(pointLon)
  ) {
    return false;
  }

  if (
    !Array.isArray(polygon) ||
    polygon.length < 3
  ) {
    return false;
  }

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
// Find narrow road containing vehicle
// --------------------------------------------------

function findNarrowRoadAtPosition(lat, lon) {
  const vehicleLat = Number(lat);
  const vehicleLon = Number(lon);

  if (
    !Number.isFinite(vehicleLat) ||
    !Number.isFinite(vehicleLon)
  ) {
    return null;
  }

  const roads = getAllNarrowRoads();

  for (const road of roads) {
    if (
      isPointInsidePolygon(
        vehicleLat,
        vehicleLon,
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
// Get geofence state
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