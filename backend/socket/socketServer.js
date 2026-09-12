const { Server } = require("socket.io");
const config = require("../config/config");
const { getAllVehicles } = require("../services/vehicleState");
const {
  getVehicleForDevice,
} = require("../services/deviceRegistry");

const {
  findUserByUsername,
} = require("../services/authService");
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
    // AUTOMATIC USERNAME → DEVICE → VEHICLE IDENTIFICATION
    // --------------------------------------------------

    socket.on(
      "session:identify",
      async ({ username }) => {
        console.log(
          `[Socket.IO] session:identify received from ${socket.id}:`,
          username
        );

        if (
          !username ||
          typeof username !== "string"
        ) {
          socket.emit("session:error", {
            message: "Invalid username",
          });

          return;
        }

        const normalizedUsername =
          username.trim();

        if (!normalizedUsername) {
          socket.emit("session:error", {
            message: "Invalid username",
          });

          return;
        }

        try {
          // ----------------------------------------------
          // Find user in PostgreSQL
          // ----------------------------------------------

          const user =
            await findUserByUsername(
              normalizedUsername
            );

          if (!user) {
            console.warn(
              `[Socket.IO] User not found: ${normalizedUsername}`
            );

            socket.emit("session:error", {
              message: "User not found",
            });

            return;
          }

          // ----------------------------------------------
          // Get the device associated with this user
          // ----------------------------------------------

          const deviceId =
            user.device_id;

          console.log(
            `[Socket.IO] User lookup: ${normalizedUsername} → ${
              deviceId || "NO DEVICE"
            }`
          );

          if (!deviceId) {
            console.warn(
              `[Socket.IO] No device associated with user: ${normalizedUsername}`
            );

            socket.emit("session:error", {
              message:
                "No device is associated with this account",
            });

            return;
          }

          // ----------------------------------------------
          // Device → Vehicle lookup
          // ----------------------------------------------

          const vehicleId =
            getVehicleForDevice(
              deviceId
            );

          console.log(
            `[Socket.IO] Device lookup: ${deviceId} → ${
              vehicleId || "NOT FOUND"
            }`
          );

          if (!vehicleId) {
            console.warn(
              `[Socket.IO] Device not registered: ${deviceId}`
            );

            socket.emit("session:error", {
              message:
                "Device is not currently connected",
            });

            return;
          }

          // ----------------------------------------------
          // Dashboard successfully identified
          // ----------------------------------------------

          console.log(
            `[Socket.IO] Dashboard ${socket.id} identified as ${vehicleId} for user ${normalizedUsername}`
          );

          socket.emit(
            "session:assigned",
            {
              deviceId,
              vehicleId,
              username: normalizedUsername,
            }
          );

        } catch (error) {
          console.error(
            `[Socket.IO] Username identification failed for ${normalizedUsername}:`,
            error.message
          );

          socket.emit("session:error", {
            message:
              "Failed to identify dashboard",
          });
        }
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