import { io } from "socket.io-client";

// --------------------------------------------------
// Render backend
// --------------------------------------------------

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "https://narrow-road-navigation.onrender.com";


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


});


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