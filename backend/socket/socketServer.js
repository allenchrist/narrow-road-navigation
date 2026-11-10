const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const {
  getVehiclesForDashboard,
  getVisibleVehicles,
} = require("../services/vehicleState");
const { getVehicleForDevice } = require("../services/deviceRegistry");

const {
  findUserByUsername,
  isSessionCurrent,
} = require("../services/authService");

let io = null;

// Also checked by the website, which then asks the driver to log in again
const NOT_AUTHORIZED = "Not authorized";

function userRoom(username) {
  return `user:${username}`;
}

function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
      credentials: false,
    },
  });

  // Live positions are only for logged-in drivers. The username comes from
  // the login token, so nobody can claim to be someone else.
  io.use(async (socket, next) => {
    let decoded;

    try {
      decoded = jwt.verify(
        socket.handshake.auth?.token,
        process.env.JWT_SECRET,
      );
    } catch {
      next(new Error(NOT_AUTHORIZED));
      return;
    }

    try {
      if (!decoded.username || !(await isSessionCurrent(decoded))) {
        next(new Error(NOT_AUTHORIZED));
        return;
      }
    } catch (error) {
      // A database problem isn't a bad login, so the screen just retries
      console.error("[Socket.IO] Login check failed:", error.message);

      next(new Error("Server busy"));
      return;
    }

    socket.data.username = decoded.username;

    next();
  });

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.username));

    console.log(`[Socket.IO] Dashboard connected: ${socket.id}`);

    // --------------------------------------------------
    // AUTOMATIC USERNAME → DEVICE → VEHICLE IDENTIFICATION
    // --------------------------------------------------

    socket.on("session:identify", async () => {
      const normalizedUsername = socket.data.username;

      // Set again below, if this account still has a vehicle
      socket.data.vehicleId = null;

      try {
        // ----------------------------------------------
        // Find user in PostgreSQL
        // ----------------------------------------------

        const user = await findUserByUsername(normalizedUsername);

        if (!user) {
          socket.emit("session:error", {
            message: "User not found",
          });

          return;
        }

        // ----------------------------------------------
        // Get the device associated with this user
        // ----------------------------------------------

        const deviceId = user.device_id;

        if (!deviceId) {
          socket.emit("session:error", {
            message: "No device is associated with this account",
          });

          return;
        }

        // ----------------------------------------------
        // Device → Vehicle lookup
        // ----------------------------------------------

        const vehicleId = getVehicleForDevice(deviceId);

        if (!vehicleId) {
          socket.emit("session:error", {
            message: "Device is not currently connected",
          });

          return;
        }

        // ----------------------------------------------
        // Dashboard successfully identified
        // ----------------------------------------------

        socket.data.vehicleId = vehicleId;

        socket.emit("session:assigned", {
          vehicleId,
          username: normalizedUsername,
        });

        // A dashboard can identify again on an existing socket,
        // so it needs the current vehicles here as well.
        socket.emit("vehicles:update", {
          vehicles: getVisibleVehicles(getVehiclesForDashboard(), vehicleId),
        });
      } catch (error) {
        console.error(
          `[Socket.IO] Username identification failed for ${normalizedUsername}:`,
          error.message,
        );

        socket.emit("session:error", {
          message: "Failed to identify dashboard",
        });
      }
    });

    // --------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Dashboard disconnected: ${socket.id}`);
    });
  });

  return io;
}

// --------------------------------------------------
// Broadcast full fleet to all dashboards
// --------------------------------------------------

// This account's phone changed, so its car screens must look it up again
function notifyDeviceChanged(username) {
  io?.to(userRoom(username)).emit("session:changed");
}

// This login has ended, so its car screens must connect again and be refused
function disconnectUser(username) {
  io?.in(userRoom(username)).disconnectSockets(true);
}

// Saved devices have just loaded, so every car screen should look again
function notifyAllDashboards() {
  io?.emit("session:changed");
}

// Also closes the HTTP server, then calls onClosed
function closeSocketServer(onClosed) {
  if (!io) {
    onClosed();
    return;
  }

  io.close(onClosed);
}

// Fast enough to follow a turn, while several phones sending at once
// still only cause one update
const QUICK_UPDATE_DELAY_MS = 100;

let quickUpdateTimer = null;

// Sends the change soon, instead of waiting for the next regular update
function scheduleFleetUpdate() {
  quickUpdateTimer ??= setTimeout(broadcastFleetUpdate, QUICK_UPDATE_DELAY_MS);
}

// Each dashboard gets its own list, containing only what that driver may see
function broadcastFleetUpdate() {
  clearTimeout(quickUpdateTimer);
  quickUpdateTimer = null;

  if (!io) return;

  const vehicles = getVehiclesForDashboard();

  for (const socket of io.of("/").sockets.values()) {
    socket.emit("vehicles:update", {
      vehicles: getVisibleVehicles(vehicles, socket.data.vehicleId),
    });
  }
}

module.exports = {
  initSocketServer,
  broadcastFleetUpdate,
  scheduleFleetUpdate,
  notifyDeviceChanged,
  disconnectUser,
  notifyAllDashboards,
  closeSocketServer,
};
