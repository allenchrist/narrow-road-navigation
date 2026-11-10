const MAX_ROAD_NAME_LENGTH = 100;
const MAX_REASON_LENGTH = 500;

const ROAD_NAME_ERROR = `Road name is required, up to ${MAX_ROAD_NAME_LENGTH} characters`;

const REASON_ERROR = `Reason must be ${MAX_REASON_LENGTH} characters or fewer`;

function isValidRoadName(name) {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= MAX_ROAD_NAME_LENGTH
  );
}

function isValidReason(reason) {
  return (
    reason === undefined ||
    (typeof reason === "string" && reason.trim().length <= MAX_REASON_LENGTH)
  );
}

module.exports = {
  ROAD_NAME_ERROR,
  REASON_ERROR,
  isValidRoadName,
  isValidReason,
};
