const { Server } = require("socket.io");
const config = require("../config/config");
const { getState } = require("../services/vehicleState");

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
    console.log(`[Socket.IO] React client connected: ${socket.id}`);

    // Immediately send the latest known state so the dashboard
    // doesn't wait for the next Android GPS update.
    const current = getState();
    if (current.lat !== null) {
      socket.emit("vehicle:update", current);
    } else {
      socket.emit("vehicle:update", current);
    }

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] React client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function broadcastVehicleUpdate(state) {
  if (io) {
    io.emit("vehicle:update", state);
  }
}

module.exports = { initSocketServer, broadcastVehicleUpdate };
