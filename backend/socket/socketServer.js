const { Server } = require("socket.io");
const config = require("../config/config");
const { getAllVehicles } = require("../services/vehicleState");
const {
  getVehicleForDevice,
} = require("../services/deviceRegistry");
const {
  getPairing,
} = require("../services/pairingService");

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
    console.log(
      `[Socket.IO] Dashboard connected: ${socket.id}`
    );

    socket.emit("vehicles:update", {
      vehicles: getAllVehicles(),
    });

    // --------------------------------------------------
    // AUTOMATIC DEVICE → VEHICLE IDENTIFICATION
    // --------------------------------------------------

    socket.on(
      "session:identify",
      ({ deviceId }) => {
        console.log(
          `[Socket.IO] session:identify received from ${socket.id}:`,
          deviceId
        );

        if (
          !deviceId ||
          typeof deviceId !== "string"
        ) {
          socket.emit("session:error", {
            message: "Invalid device ID",
          });

          return;
        }

        const normalizedDeviceId =
          deviceId.trim();

        const vehicleId =
          getVehicleForDevice(
            normalizedDeviceId
          );

        console.log(
          `[Socket.IO] Device lookup: ${normalizedDeviceId} → ${
            vehicleId || "NOT FOUND"
          }`
        );

        if (!vehicleId) {
          console.warn(
            `[Socket.IO] Device not registered: ${normalizedDeviceId}`
          );

          socket.emit("session:error", {
            message:
              "Device not registered",
          });

          return;
        }

        console.log(
          `[Socket.IO] Dashboard ${socket.id} identified as ${vehicleId}`
        );

        socket.emit(
          "session:assigned",
          {
            deviceId:
              normalizedDeviceId,
            vehicleId,
          }
        );
      }
    );

    // --------------------------------------------------
    // OPTIONAL MANUAL PAIRING
    // --------------------------------------------------

    socket.on(
      "session:pair",
      ({ pairingCode }) => {
        if (
          !pairingCode ||
          typeof pairingCode !== "string"
        ) {
          socket.emit("session:error", {
            message:
              "Invalid pairing code",
          });

          return;
        }

        const normalizedCode =
          pairingCode.trim();

        const pairing =
          getPairing(normalizedCode);

        if (!pairing) {
          console.warn(
            `[Socket.IO] Invalid pairing code ${normalizedCode}`
          );

          socket.emit("session:error", {
            message:
              "Invalid or expired pairing code",
          });

          return;
        }

        const {
          deviceId,
          vehicleId,
        } = pairing;

        console.log(
          `[Socket.IO] Dashboard ${socket.id} paired with ${vehicleId} via code ${normalizedCode}`
        );

        socket.emit(
          "session:assigned",
          {
            deviceId,
            vehicleId,
          }
        );
      }
    );

    // --------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------

    socket.on("disconnect", () => {
      console.log(
        `[Socket.IO] Dashboard disconnected: ${socket.id}`
      );
    });
  });

  return io;
}

// --------------------------------------------------
// Broadcast full fleet to all dashboards
// --------------------------------------------------

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