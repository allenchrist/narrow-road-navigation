import { io } from "socket.io-client";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

console.log("[Socket.IO] Backend URL:", BACKEND_URL);

const socket = io(BACKEND_URL, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 30000,
});

console.log("[Socket.IO] Socket instance created:", socket.id);
console.log("[Socket.IO] Initial connected state:", socket.connected);

socket.on("connect", () => {
  console.log("[Socket.IO] CONNECTED:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("[Socket.IO] CONNECTION ERROR:", error.message);
  console.error("[Socket.IO] Full error:", error);
});

socket.on("disconnect", (reason) => {
  console.warn("[Socket.IO] DISCONNECTED:", reason);
});

export function getVehicleSocket() {
  return socket;
}