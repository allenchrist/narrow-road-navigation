const DEFAULT_VEHICLE_TYPE = "car";

const VEHICLE_TYPES = ["car", "truck", "lorry", "bus", "auto"];

const VEHICLE_TYPE_ERROR = `Vehicle type must be one of: ${VEHICLE_TYPES.join(", ")}.`;

const isValidVehicleType = (type) => VEHICLE_TYPES.includes(type);

module.exports = {
  DEFAULT_VEHICLE_TYPE,
  VEHICLE_TYPE_ERROR,
  isValidVehicleType,
};
