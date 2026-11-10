// Imported roads without a real name are stored as "Narrow Road 12345"
const PLACEHOLDER_ROAD_NAME = /^Narrow Road \d+$/;

export function displayRoadName(name) {
  return !name || PLACEHOLDER_ROAD_NAME.test(name) ? "Narrow road" : name;
}

export function hasRoadName(name) {
  return displayRoadName(name) !== "Narrow road";
}

export const VEHICLE_LABELS = {
  car: "Car",
  truck: "Truck",
  lorry: "Lorry",
  bus: "Bus",
  auto: "Auto",
};

// VEHICLE_002 on a bus account becomes Bus 002
export function displayVehicleName({ vehicleId, vehicleType }) {
  const label = VEHICLE_LABELS[vehicleType] ?? "Vehicle";

  return vehicleId.replace("VEHICLE_", `${label} `);
}

const MOVING_SPEED_MPS = 1;

export function isMoving(vehicle) {
  return vehicle.speed !== null && vehicle.speed >= MOVING_SPEED_MPS;
}

// GPS gives a direction once the phone moves, but below about 7 km/h it
// wanders, so slower than this the compass is used instead
const GPS_DIRECTION_SPEED_MPS = 2;

// A phone's compass shows how it is lying, not which way the car is going
export function travelDirection(vehicle) {
  return vehicle.speed !== null &&
    vehicle.speed >= GPS_DIRECTION_SPEED_MPS &&
    vehicle.bearing !== null
    ? vehicle.bearing
    : vehicle.heading;
}
