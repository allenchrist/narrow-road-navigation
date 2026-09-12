import { io } from "socket.io-client";

// --------------------------------------------------
// Render backend
// --------------------------------------------------

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "https://narrow-road-navigation.onrender.com";


// --------------------------------------------------
// Dashboard username identity
//
// Example:
// /allenchrist
// --------------------------------------------------

function getDashboardUsername() {
  try {
    const pathParts =
      window.location.pathname
        .split("/")
        .filter(Boolean);

    const username =
      pathParts[0];

    if (!username) {
      console.warn(
        "[Socket.IO] No dashboard username"
      );

      return null;
    }

    const normalized =
      decodeURIComponent(username).trim();

    console.log(
      "[Socket.IO] Dashboard username:",
      normalized
    );

    return normalized;

  } catch (error) {

    console.error(
      "[Socket.IO] Failed to read dashboard username:",
      error
    );

    return null;
  }
}


const dashboardUsername =
  getDashboardUsername();


// --------------------------------------------------
// Socket.IO
// --------------------------------------------------

console.log(
  "[Socket.IO] Backend URL:",
  BACKEND_URL
);

const socket = io(
  BACKEND_URL,
  {
    path: "/socket.io",

    transports: [
      "websocket",
      "polling",
    ],

    reconnection: true,

    reconnectionAttempts:
      Infinity,

    reconnectionDelay:
      2000,

    reconnectionDelayMax:
      30000,
  }
);


// --------------------------------------------------
// Initial state
// --------------------------------------------------

console.log(
  "[Socket.IO] Socket instance created:",
  socket.id
);

console.log(
  "[Socket.IO] Initial connected state:",
  socket.connected
);


// --------------------------------------------------
// CONNECT
// --------------------------------------------------

socket.on("connect", () => {

  console.log(
    "[Socket.IO] CONNECTED:",
    socket.id
  );

  console.log(
    "[Socket.IO] Backend:",
    BACKEND_URL
  );


  // ------------------------------------------------
  // Automatically identify dashboard by username
  // ------------------------------------------------

  if (dashboardUsername) {

    console.log(
      "[Socket.IO] Identifying dashboard username:",
      dashboardUsername
    );

    socket.emit(
      "session:identify",
      {
        username:
          dashboardUsername,
      }
    );

  } else {

    console.warn(
      "[Socket.IO] Dashboard has no username identity"
    );
  }
});


// --------------------------------------------------
// VEHICLES UPDATE
//
// This is the important part.
// Backend sends the complete fleet here.
// --------------------------------------------------

socket.on(
  "vehicles:update",
  (data) => {

    console.log(
      "[Socket.IO] VEHICLES UPDATE RECEIVED:",
      data
    );

    if (
      !data ||
      !Array.isArray(data.vehicles)
    ) {

      console.warn(
        "[Socket.IO] Invalid vehicles:update:",
        data
      );

      return;
    }


    // ------------------------------------------------
    // Debug every vehicle
    // ------------------------------------------------

    data.vehicles.forEach(
      (vehicle) => {

        console.log(
          `[Socket.IO] Vehicle ${vehicle.vehicleId}:`,
          {
            lat:
              vehicle.lat,

            lon:
              vehicle.lon,

            connected:
              vehicle.connected,

            insideNarrowRoad:
              vehicle.insideNarrowRoad,

            narrowRoadId:
              vehicle.narrowRoadId,

            narrowRoadName:
              vehicle.narrowRoadName,
          }
        );


        // --------------------------------------------
        // Geofence debug
        // --------------------------------------------

        if (
          vehicle.insideNarrowRoad
        ) {

          console.log(
            `[Socket.IO] 🚨 ${vehicle.vehicleId} ` +
            `IS INSIDE NARROW ROAD: ` +
            `${vehicle.narrowRoadName}`
          );
        }
      }
    );
  }
);


// --------------------------------------------------
// SESSION ASSIGNED
// --------------------------------------------------

socket.on(
  "session:assigned",
  (data) => {

    console.log(
      "[Socket.IO] SESSION ASSIGNED:",
      data
    );

    console.log(
      "[Socket.IO] Ego vehicle:",
      data.vehicleId
    );
  }
);


// --------------------------------------------------
// SESSION ERROR
// --------------------------------------------------

socket.on(
  "session:error",
  (data) => {

    console.error(
      "[Socket.IO] SESSION ERROR:",
      data
    );
  }
);


// --------------------------------------------------
// CONNECTION ERROR
// --------------------------------------------------

socket.on(
  "connect_error",
  (error) => {

    console.error(
      "[Socket.IO] CONNECTION ERROR:",
      error.message
    );
  }
);


// --------------------------------------------------
// DISCONNECT
// --------------------------------------------------

socket.on(
  "disconnect",
  (reason) => {

    console.warn(
      "[Socket.IO] DISCONNECTED:",
      reason
    );
  }
);


// --------------------------------------------------
// Export
// --------------------------------------------------

export function getVehicleSocket() {
  return socket;
}