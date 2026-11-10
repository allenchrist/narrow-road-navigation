const { getAllNarrowRoads } = require("./narrowRoadService");
const { angleDifference, nearestPointOnPolygon } = require("../utils/geo");

// How far ahead a moving vehicle is warned about a narrow road
const APPROACH_DISTANCE_M = 150;

// How far either side of the direction of travel counts as "ahead"
const APPROACH_ANGLE_DEGREES = 45;

// A stopped vehicle this close is treated as waiting at the road
const WAITING_DISTANCE_M = 40;

// Most road shapes are only a few metres wide, which is less than a phone's
// GPS error. A car on the road often reads as just outside it, so anything
// this close counts as on the road. Follows the phone's reported accuracy,
// within limits, so a nearby parallel street doesn't count when GPS is poor.
const MIN_ROAD_TOLERANCE_M = 8;
const MAX_ROAD_TOLERANCE_M = 15;

// For phones that don't report accuracy
const DEFAULT_ROAD_TOLERANCE_M = 10;

function getRoadTolerance(accuracy) {
  return typeof accuracy === "number"
    ? Math.min(MAX_ROAD_TOLERANCE_M, Math.max(MIN_ROAD_TOLERANCE_M, accuracy))
    : DEFAULT_ROAD_TOLERANCE_M;
}

// --------------------------------------------------
// Point-in-polygon
// polygon points are [latitude, longitude]
// --------------------------------------------------

function isPointInsidePolygon(lat, lon, polygon) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    return false;
  }

  if (!Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  const pointLat = Number(lat);
  const pointLon = Number(lon);

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
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
      lonI > pointLon !== lonJ > pointLon &&
      pointLat < ((latJ - latI) * (pointLon - lonI)) / (lonJ - lonI) + latI;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

// --------------------------------------------------
// Roads a vehicle is inside or approaching.
// travelBearing is null when it is stopped.
//
// A point can be inside several roads where polygons
// overlap, so every matching road is reported.
// --------------------------------------------------

function computeGeofenceState(lat, lon, travelBearing, roads, accuracy) {
  const insideRoads = [];
  const approachingRoads = [];

  const tolerance = getRoadTolerance(accuracy);

  for (const road of roads) {
    const nearest = nearestPointOnPolygon(lat, lon, road.polygon);

    if (!nearest) {
      continue;
    }

    if (
      isPointInsidePolygon(lat, lon, road.polygon) ||
      nearest.distanceM <= tolerance
    ) {
      insideRoads.push(road);
      continue;
    }

    const isApproaching =
      travelBearing === null
        ? nearest.distanceM <= WAITING_DISTANCE_M
        : nearest.distanceM <= APPROACH_DISTANCE_M &&
          angleDifference(nearest.bearing, travelBearing) <=
            APPROACH_ANGLE_DEGREES;

    if (isApproaching) {
      approachingRoads.push({
        id: road.id,
        name: road.name,
        distanceM: nearest.distanceM,
      });
    }
  }

  approachingRoads.sort((a, b) => a.distanceM - b.distanceM);

  return {
    insideNarrowRoad: insideRoads.length > 0,
    narrowRoadId: insideRoads[0]?.id ?? null,
    narrowRoadName: insideRoads[0]?.name ?? null,
    insideRoadIds: insideRoads.map((road) => road.id),
    approachingRoads,
  };
}

function getGeofenceState(lat, lon, travelBearing = null, accuracy) {
  return computeGeofenceState(
    lat,
    lon,
    travelBearing,
    getAllNarrowRoads(),
    accuracy,
  );
}

module.exports = {
  isPointInsidePolygon,
  computeGeofenceState,
  getGeofenceState,
};
