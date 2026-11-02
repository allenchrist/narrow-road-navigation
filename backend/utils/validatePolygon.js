const MAX_POLYGON_POINTS = 500;

const POLYGON_ERROR =
  `Polygon must contain 3 to ${MAX_POLYGON_POINTS} [latitude, longitude] points`;

/**
 * Checks that a client-supplied polygon is a list of valid
 * [latitude, longitude] points. Stored polygons are drawn on every
 * admin map, so one bad entry would affect all later page loads.
 */
function isValidPolygon(polygon) {
  if (
    !Array.isArray(polygon) ||
    polygon.length < 3 ||
    polygon.length > MAX_POLYGON_POINTS
  ) {
    return false;
  }

  return polygon.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 90 &&
      Math.abs(point[1]) <= 180
  );
}

module.exports = { isValidPolygon, POLYGON_ERROR };
