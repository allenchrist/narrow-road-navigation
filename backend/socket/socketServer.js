const { Server } = require("socket.io");
const config = require("../config/config");
const { getAllVehicles } = require("../services/vehicleState");

let io = null;

function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
      credentials: false,
    },
    allowEIO3: true,
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Dashboard connected: ${socket.id}`);

    // Send the full current fleet immediately on connect
    socket.emit("vehicles:update", { vehicles: getAllVehicles() });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Dashboard disconnected: ${socket.id}`);
    });
  });

  return io;
}

// Broadcast full fleet to all connected dashboards
function broadcastFleetUpdate() {
  if (!io) return;
  io.emit("vehicles:update", { vehicles: getAllVehicles() });
}

module.exports = { initSocketServer, broadcastFleetUpdate };
