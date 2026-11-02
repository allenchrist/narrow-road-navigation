import { io } from "socket.io-client";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "https://narrow-road-navigation.onrender.com";

let socket = null;

// Created on first use, so only the dashboard connects
export function getVehicleSocket() {
  if (!socket) {
    socket = io(BACKEND_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    });

    socket.on("connect_error", (error) => {
      console.error(
        "[Socket.IO] Connection error:",
        error.message
      );
    });
  }

  return socket;
}
