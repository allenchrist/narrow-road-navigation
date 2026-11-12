import egoAuto from "../assets/ego-auto.svg";
import egoBus from "../assets/ego-bus.svg";
import egoCar from "../assets/ego-car.svg";
import egoLorry from "../assets/ego-lorry.svg";
import egoTruck from "../assets/ego-truck.svg";
import otherAuto from "../assets/other-auto.svg";
import otherBus from "../assets/other-bus.svg";
import otherCar from "../assets/other-car.svg";
import otherLorry from "../assets/other-lorry.svg";
import otherTruck from "../assets/other-truck.svg";

// An emergency vehicle looks the same whoever drives it, so it's always
// recognised: white, with red and blue lights and markings
import priority from "../assets/priority.svg";

// Seen from above, facing up. Your own vehicle is white and others amber.
// Sizes are for your own on the map: a bus looks longer than a car and an
// auto smaller, while staying easy to spot.
export const VEHICLE_IMAGES = {
  car: { own: egoCar, other: otherCar, width: 36, height: 72 },
  truck: { own: egoTruck, other: otherTruck, width: 32, height: 86 },
  lorry: { own: egoLorry, other: otherLorry, width: 34, height: 82 },
  bus: { own: egoBus, other: otherBus, width: 32, height: 83 },
  auto: { own: egoAuto, other: otherAuto, width: 32, height: 53 },
  priority: { own: priority, other: priority, width: 34, height: 75 },
};

export function vehicleImage(vehicleType) {
  return VEHICLE_IMAGES[vehicleType] ?? VEHICLE_IMAGES.car;
}
