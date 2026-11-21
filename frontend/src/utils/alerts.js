// Each alert's colour on maps, matching its card on the car screen
export const ALERT_TINTS = {
  GIVE_WAY: "#ff5c63",
  RIGHT_OF_WAY: "#43d17a",
  ROAD_CLEAR: "#43d17a",
  VEHICLE_ENTERING: "#ff9b3d",
  VEHICLE_WAITING: "#f2b84b",
  IN_NARROW_ROAD: "#f2b84b",
  ENTRY_GO: "#43d17a",
  ENTRY_FOLLOW: "#43d17a",
  ENTRY_WAIT: "#ff5c63",
  ENTRY_PRIORITY: "#ff9b3d",
  BEND_STOP: "#ff5c63",
  BEND_GO: "#43d17a",
  BEND_CLEAR: "#43d17a",
  BEND_KEEP_LEFT: "#f2b84b",
  BEND_NO_OVERTAKE: "#f2b84b",
};

// Alerts shown while inside a narrow road, rather than at its entrance or
// on a ghat road
export const INSIDE_ROAD_ALERTS = new Set([
  "IN_NARROW_ROAD",
  "VEHICLE_WAITING",
  "VEHICLE_ENTERING",
  "RIGHT_OF_WAY",
  "GIVE_WAY",
  "ROAD_CLEAR",
]);

// A narrow road's colour on maps, by whether it's free
export const ROAD_STATUS_TINTS = {
  AVAILABLE: "#43d17a",
  RESERVED: "#f2b84b",
  OCCUPIED: "#ff5c63",
};

export const ROAD_STATUS_LABELS = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  OCCUPIED: "Occupied",
};

// Short names, for lists
export const ALERT_LABELS = {
  GIVE_WAY: "Give way",
  RIGHT_OF_WAY: "Right of way",
  ROAD_CLEAR: "Road clear",
  VEHICLE_ENTERING: "Vehicle about to enter",
  VEHICLE_WAITING: "Vehicle waiting",
  IN_NARROW_ROAD: "In a narrow road",
  ENTRY_GO: "Go ahead",
  ENTRY_FOLLOW: "Following",
  ENTRY_WAIT: "Waiting at entrance",
  ENTRY_PRIORITY: "Entering, priority",
  BEND_STOP: "Stopped before a bend",
  BEND_GO: "Taking a bend",
  BEND_CLEAR: "Bend clear",
  BEND_KEEP_LEFT: "Keep left at a bend",
  BEND_NO_OVERTAKE: "Don't overtake",
};
