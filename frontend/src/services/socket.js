import { io } from "socket.io-client";

// Created once at module load time — lives for the entire app session.
// Never disconnected so StrictMode double-invoke cannot destroy it.
const socket = io("/", {
  path: "/socket.io",
  reconnectionDelay: 2000,
  reconnectionDelayMax: 30000,
  transports: ["websocket", "polling"],
});

export function getVehicleSocket() {
  return socket;
}
