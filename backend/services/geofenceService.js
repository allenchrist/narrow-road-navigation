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

// ── Roads near a point ──────────────────────────────────────────────────
// Checking every road on every GPS update gets slow as roads are added, so
// each road is listed under the squares of the map it's near. A vehicle is
// then only checked against the roads listed under its own square.

// About 550 m across
const CELL_DEGREES = 0.005;

// The furthest any check looks from a road, so a road is listed in every
// square a vehicle could be in while that road still matters
const REACH_M =
  Math.max(APPROACH_DISTANCE_M, WAITING_DISTANCE_M, MAX_ROAD_TOLERANCE_M) + 10;

const METRES_PER_DEGREE = 111320;

// Built once for each list of roads, which is replaced whenever one changes
const roadIndexes = new WeakMap();

const cellOf = (degrees) => Math.floor(degrees / CELL_DEGREES);

function buildRoadIndex(roads) {
  const cells = new Map();

  for (const road of roads) {
    if (!Array.isArray(road.polygon) || road.polygon.length === 0) continue;

    const lats = road.polygon.map((point) => Number(point[0]));
    const lons = road.polygon.map((point) => Number(point[1]));
    const middleLat = (Math.min(...lats) + Math.max(...lats)) / 2;

    const latMargin = REACH_M / METRES_PER_DEGREE;
    const lonMargin =
      REACH_M / (METRES_PER_DEGREE * Math.cos((middleLat * Math.PI) / 180));

    for (
      let x = cellOf(Math.min(...lons) - lonMargin);
      x <= cellOf(Math.max(...lons) + lonMargin);
      x++
    ) {
      for (
        let y = cellOf(Math.min(...lats) - latMargin);
        y <= cellOf(Math.max(...lats) + latMargin);
        y++
      ) {
        const key = `${x},${y}`;

        // In the same order as the full list, so overlapping roads come
        // out in the same order as before
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(road);
      }
    }
  }

  return cells;
}

function roadsNear(roads, lat, lon) {
  if (!roadIndexes.has(roads)) {
    roadIndexes.set(roads, buildRoadIndex(roads));
  }

  return roadIndexes.get(roads).get(`${cellOf(lon)},${cellOf(lat)}`) ?? [];
}

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

  for (const road of roadsNear(roads, Number(lat), Number(lon))) {
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
