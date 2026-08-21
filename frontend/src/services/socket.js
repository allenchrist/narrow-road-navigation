import { io } from "socket.io-client";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

console.log("[Socket.IO] Backend URL:", BACKEND_URL);

// --------------------------------------------------
// Read Android device ID from dashboard URL
// Example:
// http://localhost:5173/?device=bdb8a5d7-...
// --------------------------------------------------

function getDeviceIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const deviceId = params.get("device");

    if (!deviceId) {
      console.log("[Socket.IO] No device ID provided");
      return null;
    }

    const normalized = deviceId.trim();

    console.log(
      "[Socket.IO] Dashboard device ID:",
      normalized
    );

    return normalized;
  } catch (error) {
    console.error(
      "[Socket.IO] Failed to read device ID:",
      error
    );

    return null;
  }
}

const dashboardDeviceId = getDeviceIdFromUrl();

const socket = io(BACKEND_URL, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 30000,
});

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

  // Identify this dashboard
  if (dashboardDeviceId) {
    console.log(
      "[Socket.IO] Identifying dashboard device:",
      dashboardDeviceId
    );

    socket.emit("session:identify", {
      deviceId: dashboardDeviceId,
    });
  }
});

// --------------------------------------------------
// SESSION ASSIGNED
// --------------------------------------------------

socket.on("session:assigned", (data) => {
  console.log(
    "[Socket.IO] SESSION ASSIGNED:",
    data
  );

  console.log(
    "[Socket.IO] Ego vehicle:",
    data.vehicleId
  );
});

// --------------------------------------------------
// SESSION ERROR
// --------------------------------------------------

socket.on("session:error", (data) => {
  console.error(
    "[Socket.IO] SESSION ERROR:",
    data
  );
});

// --------------------------------------------------
// CONNECTION ERROR
// --------------------------------------------------

socket.on("connect_error", (error) => {
  console.error(
    "[Socket.IO] CONNECTION ERROR:",
    error.message
  );

  console.error(
    "[Socket.IO] Full error:",
    error
  );
});

// --------------------------------------------------
// DISCONNECT
// --------------------------------------------------

socket.on("disconnect", (reason) => {
  console.warn(
    "[Socket.IO] DISCONNECTED:",
    reason
  );
});

export function getVehicleSocket() {
  return socket;
}