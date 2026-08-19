import { createContext, useContext, useState, useEffect, useRef } from "react";
import { getVehicleSocket } from "../services/socket";

const VehicleContext = createContext(null);

const STALE_THRESHOLD_MS = 5000;

const EMPTY_VEHICLE = {
  lat: null,
  lon: null,
  heading: null,
  accelX: null,
  accelY: null,
  accelZ: null,
  gyroX: null,
  gyroY: null,
  gyroZ: null,
  connected: false,
  lastReceivedAt: null,
};

/**
 * TEMPORARY TESTING CONVENIENCE — NOT the final identity mechanism.
 *
 * ?ego=VEHICLE_001 lets a developer open the dashboard and designate
 * which vehicle is "theirs" for testing purposes.
 *
 * Final identity flow (Owner Model — future phase):
 *   User logs in → backend resolves USER → DEVICE → VEHICLE
 *   Backend pushes { type: "session:assigned", vehicleId } via Socket.IO
 *   setMyVehicleId() is called from the onSessionAssigned handler below
 *
 * The dashboard is NOT a vehicle client. It never connects to /vehicle.
 * Vehicle identity comes from the Android device, not the browser.
 */
function getEgoFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ego = params.get("ego");
    return ego ? ego.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

export function VehicleProvider({ children }) {
  const [vehicles, setVehicles] = useState({});
  const [backendConnected, setBackendConnected] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("DISCONNECTED");

  /**
   * myVehicleId — the ego vehicle for this dashboard session.
   *
   * Current source: ?ego=VEHICLE_001 URL param (testing only).
   * Future source:  session:assigned event from backend (Owner Model).
   *
   * null means no ego vehicle is designated — dashboard shows all vehicles
   * without highlighting one as "mine".
   */
  const [myVehicleId, setMyVehicleId] = useState(getEgoFromUrl);

  const stateRef = useRef({ vehicles: {}, backendConnected: false, myVehicleId: null });
  stateRef.current = { vehicles, backendConnected, myVehicleId };

  // Recompute GPS status every second based on ego vehicle state
  useEffect(() => {
    const id = setInterval(() => {
      const { vehicles: v, backendConnected: bc, myVehicleId: egoId } = stateRef.current;
      if (!bc) { setGpsStatus("DISCONNECTED"); return; }
      const ego = egoId ? v[egoId] : null;
      if (!ego) { setGpsStatus("NO SIGNAL"); return; }
      if (!ego.connected) { setGpsStatus("OFFLINE"); return; }
      if (ego.lat === null) { setGpsStatus("WAITING"); return; }
      if (ego.lastReceivedAt && Date.now() - ego.lastReceivedAt > STALE_THRESHOLD_MS) {
        setGpsStatus("STALE"); return;
      }
      setGpsStatus("ACTIVE");
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const socket = getVehicleSocket();

    function onConnect() {
      setBackendConnected(true);
    }

    function onDisconnect() {
      setBackendConnected(false);
      setVehicles((prev) => {
        const updated = {};
        for (const id of Object.keys(prev)) {
          updated[id] = { ...prev[id], connected: false };
        }
        return updated;
      });
    }

    function onVehiclesUpdate({ vehicles: list }) {
      if (!Array.isArray(list)) return;
      setVehicles(() => {
        const map = {};
        for (const v of list) {
          map[v.vehicleId] = { ...v };
        }
        return map;
      });
      setBackendConnected(true);
    }

    /**
     * Owner Model hook point (future phase).
     * When a user logs in, the backend will push their assigned vehicleId here.
     * For now this event is never emitted — the URL param is used instead.
     */
    function onSessionAssigned({ vehicleId }) {
      if (vehicleId) {
        setMyVehicleId(vehicleId.trim().toUpperCase());
      }
    }

    if (socket.connected) setBackendConnected(true);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("vehicles:update", onVehiclesUpdate);
    socket.on("session:assigned", onSessionAssigned);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("vehicles:update", onVehiclesUpdate);
      socket.off("session:assigned", onSessionAssigned);
    };
  }, []);

  // Derived ego vehicle — uses myVehicleId if set, otherwise empty placeholder
  const egoVehicle = myVehicleId && vehicles[myVehicleId]
    ? { ...vehicles[myVehicleId], backendConnected }
    : { ...EMPTY_VEHICLE, backendConnected };

  // Backward-compatible alias used by Sidebar / StatusBar
  const vehicle = egoVehicle;

  return (
    <VehicleContext.Provider
      value={{
        vehicles,
        vehicle,
        egoVehicle,
        myVehicleId,
        setMyVehicleId,
        backendConnected,
        gpsStatus,
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  return useContext(VehicleContext);
}
