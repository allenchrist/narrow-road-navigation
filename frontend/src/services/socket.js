import { io } from "socket.io-client";

// --------------------------------------------------
// Render backend
// --------------------------------------------------

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "https://narrow-road-navigation.onrender.com";


// --------------------------------------------------
// Dashboard device identity
//
// Example:
// ?device=bdb8a5d7-6e5c-467c-b041-bcbb1cd2931d
// --------------------------------------------------

function getDashboardDeviceId() {
  try {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const deviceId =
      params.get("device");

    if (!deviceId) {
      console.warn(
        "[Socket.IO] No dashboard device ID"
      );

      return null;
    }

    const normalized =
      deviceId.trim();

    console.log(
      "[Socket.IO] Dashboard device ID:",
      normalized
    );

    return normalized;

  } catch (error) {

    console.error(
      "[Socket.IO] Failed to read dashboard device ID:",
      error
    );

    return null;
  }
}


const dashboardDeviceId =
  getDashboardDeviceId();


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
  // Automatically identify dashboard
  // ------------------------------------------------

  if (dashboardDeviceId) {

    console.log(
      "[Socket.IO] Identifying dashboard device:",
      dashboardDeviceId
    );

    socket.emit(
      "session:identify",
      {
        deviceId:
          dashboardDeviceId,
      }
    );

  } else {

    console.warn(
      "[Socket.IO] Dashboard has no device identity"
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