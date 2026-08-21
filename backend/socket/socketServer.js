const { Server } = require("socket.io");
const config = require("../config/config");
const { getAllVehicles } = require("../services/vehicleState");
const { getVehicleForDevice } = require("../services/deviceRegistry");

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
    socket.emit("vehicles:update", {
      vehicles: getAllVehicles(),
    });

    // --------------------------------------------------
    // Dashboard → Backend identity pairing
    // --------------------------------------------------
    socket.on("session:identify", ({ deviceId }) => {
      if (!deviceId || typeof deviceId !== "string") {
        socket.emit("session:error", {
          message: "Invalid deviceId",
        });
        return;
      }

      const normalizedDeviceId = deviceId.trim();

      const vehicleId = getVehicleForDevice(normalizedDeviceId);

      if (!vehicleId) {
        console.warn(
          `[Socket.IO] Unknown device ${normalizedDeviceId} requested pairing`
        );

        socket.emit("session:error", {
          message: "Device not registered",
        });

        return;
      }

      console.log(
        `[Socket.IO] Dashboard ${socket.id} paired with ${vehicleId} via device ${normalizedDeviceId}`
      );

      socket.emit("session:assigned", {
        deviceId: normalizedDeviceId,
        vehicleId,
      });
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Dashboard disconnected: ${socket.id}`);
    });
  });

  return io;
}

// Broadcast full fleet to all connected dashboards
function broadcastFleetUpdate() {
  if (!io) return;

  io.emit("vehicles:update", {
    vehicles: getAllVehicles(),
  });
}

module.exports = {
  initSocketServer,
  broadcastFleetUpdate,
};