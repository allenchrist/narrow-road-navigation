import { io } from "socket.io-client";

import { BACKEND_URL } from "../config";

// Read directly, because driverSession.js imports this file
const SESSION_KEY = "driverSession";

// The backend's message when a login is missing or has expired
export const SOCKET_NOT_AUTHORIZED = "Not authorized";

let socket = null;

function getToken() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY))?.token;
  } catch {
    return null;
  }
}

// Created on first use, so only the dashboard connects
export function getVehicleSocket() {
  if (!socket) {
    socket = io(BACKEND_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: (send) => send({ token: getToken() }),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    });

    socket.on("connect_error", (error) => {
      if (error.message !== SOCKET_NOT_AUTHORIZED) {
        console.error(
          "[Socket.IO] Connection error:",
          error.message
        );
      }
    });
  }

  return socket;
}

export function closeVehicleSocket() {
  socket?.close();
  socket = null;
}
