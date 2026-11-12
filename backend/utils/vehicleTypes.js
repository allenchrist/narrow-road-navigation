const DEFAULT_VEHICLE_TYPE = "car";

// "priority" covers every emergency vehicle: ambulances, fire engines, police
const VEHICLE_TYPES = ["car", "truck", "lorry", "bus", "auto", "priority"];

// These always get right of way in a narrow road
const PRIORITY_VEHICLE_TYPES = ["priority"];

const VEHICLE_TYPE_ERROR = `Vehicle type must be one of: ${VEHICLE_TYPES.join(", ")}.`;

const isValidVehicleType = (type) => VEHICLE_TYPES.includes(type);

const isPriorityVehicle = (type) => PRIORITY_VEHICLE_TYPES.includes(type);

module.exports = {
  DEFAULT_VEHICLE_TYPE,
  VEHICLE_TYPE_ERROR,
  isValidVehicleType,
  isPriorityVehicle,
};
