const WebSocket = require("ws");
const config = require("../config/config");
const { validateVehicleData } = require("../utils/validateVehicleData");
const { updateTelemetry, setAndroidConnected } = require("./vehicleState");
const { broadcastVehicleUpdate } = require("../socket/socketServer");
const { getState } = require("./vehicleState");

let ws = null;
let reconnectDelay = config.reconnectBaseDelay;
let reconnectTimer = null;
let isShuttingDown = false;

function connect() {
  if (isShuttingDown) return;

  console.log(`[Android WS] Connecting to ${config.androidWsUrl} ...`);

  ws = new WebSocket(config.androidWsUrl);

  ws.on("open", () => {
    console.log("[Android WS] Connected to Android.");
    reconnectDelay = config.reconnectBaseDelay;
    setAndroidConnected(true);
    broadcastVehicleUpdate(getState());
  });

  ws.on("message", (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      console.warn("[Android WS] Malformed JSON — ignoring.");
      return;
    }

    const result = validateVehicleData(parsed);
    if (!result.valid) {
      console.warn(`[Android WS] Invalid data — ${result.reason}`);
      return;
    }

    updateTelemetry(result.data);
    broadcastVehicleUpdate(getState());
  });

  ws.on("error", (err) => {
    console.error(`[Android WS] Error: ${err.message}`);
    // 'close' will fire after 'error', so reconnect is handled there.
  });

  ws.on("close", (code, reason) => {
    console.warn(
      `[Android WS] Disconnected (code=${code}). Reconnecting in ${reconnectDelay}ms ...`
    );
    setAndroidConnected(false);
    broadcastVehicleUpdate(getState());
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (isShuttingDown) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(
      reconnectDelay * 1.5,
      config.reconnectMaxDelay
    );
    connect();
  }, reconnectDelay);
}

function startAndroidWebSocket() {
  isShuttingDown = false;
  connect();
}

function stopAndroidWebSocket() {
  isShuttingDown = true;
  clearTimeout(reconnectTimer);
  if (ws) ws.terminate();
}

module.exports = { startAndroidWebSocket, stopAndroidWebSocket };
