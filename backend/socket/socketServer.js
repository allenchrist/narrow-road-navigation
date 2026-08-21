const { Server } = require("socket.io");
const config = require("../config/config");
const { getAllVehicles } = require("../services/vehicleState");
const { getPairing } = require("../services/pairingService");

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

    // --------------------------------------------------
    // Send current fleet immediately
    // --------------------------------------------------

    socket.emit("vehicles:update", {
      vehicles: getAllVehicles(),
    });

    // --------------------------------------------------
    // Dashboard → Backend pairing
    //
    // Dashboard sends:
    // {
    //   pairingCode: "967503"
    // }
    // --------------------------------------------------

    socket.on("session:pair", ({ pairingCode }) => {

      if (
        !pairingCode ||
        typeof pairingCode !== "string"
      ) {

        socket.emit("session:error", {
          message: "Invalid pairing code",
        });

        return;
      }

      const normalizedCode =
        pairingCode.trim();

      // --------------------------------------------------
      // Look up pairing code
      // --------------------------------------------------

      const pairing =
        getPairing(normalizedCode);

      if (!pairing) {

        console.warn(
          `[Socket.IO] Invalid pairing code ${normalizedCode}`
        );

        socket.emit("session:error", {
          message: "Invalid or expired pairing code",
        });

        return;
      }

      const {
        deviceId,
        vehicleId,
      } = pairing;

      // --------------------------------------------------
      // Pair this dashboard session
      // --------------------------------------------------

      console.log(
        `[Socket.IO] Dashboard ${socket.id} paired with ${vehicleId} via code ${normalizedCode}`
      );

      // --------------------------------------------------
      // Tell this dashboard which vehicle is YOU
      // --------------------------------------------------

      socket.emit("session:assigned", {
        deviceId,
        vehicleId,
      });
    });

    // --------------------------------------------------
    // Disconnect
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