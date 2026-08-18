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
 * Read ?ego=VEHICLE_X from the URL.
 * This lets a phone open the dashboard as:
 *   http://localhost:5173?ego=VEHICLE_A
 * and the dashboard will treat VEHICLE_A as its ego vehicle.
 *
 * If no param is present, myVehicleId stays null and the
 * dashboard shows all vehicles without a designated ego.
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

  // myVehicleId: the ego vehicle for THIS dashboard session.
  // Initialised from URL param; can be updated if backend sends session:assigned.
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

    // Backend can push a session assignment to a specific dashboard
    // (future: when phone and dashboard share a session token)
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

  // Derived ego vehicle — uses myVehicleId if set, otherwise null
  const egoVehicle = myVehicleId && vehicles[myVehicleId]
    ? { ...vehicles[myVehicleId], backendConnected }
    : { ...EMPTY_VEHICLE, backendConnected };

  // Backward-compatible alias
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
