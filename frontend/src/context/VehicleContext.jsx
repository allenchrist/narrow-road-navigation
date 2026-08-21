import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";

import { getVehicleSocket } from "../services/socket";

const VehicleContext = createContext(null);

const STALE_THRESHOLD_MS = 5000;

const EMPTY_VEHICLE = {
  vehicleId: null,
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

export function VehicleProvider({ children }) {
  const [vehicles, setVehicles] = useState({});
  const [backendConnected, setBackendConnected] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("DISCONNECTED");

  // Vehicle assigned to this dashboard session
  const [myVehicleId, setMyVehicleId] = useState(null);

  // Pairing state
  const [pairingStatus, setPairingStatus] = useState("IDLE");
  const [pairingError, setPairingError] = useState("");

  const stateRef = useRef({
    vehicles: {},
    backendConnected: false,
    myVehicleId: null,
  });

  stateRef.current = {
    vehicles,
    backendConnected,
    myVehicleId,
  };

  // --------------------------------------------------
  // GPS STATUS
  // --------------------------------------------------

  useEffect(() => {
    const id = setInterval(() => {
      const {
        vehicles: v,
        backendConnected: bc,
        myVehicleId: egoId,
      } = stateRef.current;

      if (!bc) {
        setGpsStatus("DISCONNECTED");
        return;
      }

      const ego = egoId ? v[egoId] : null;

      if (!ego) {
        setGpsStatus("NO SIGNAL");
        return;
      }

      if (!ego.connected) {
        setGpsStatus("OFFLINE");
        return;
      }

      if (ego.lat === null) {
        setGpsStatus("WAITING");
        return;
      }

      if (
        ego.lastReceivedAt &&
        Date.now() - ego.lastReceivedAt > STALE_THRESHOLD_MS
      ) {
        setGpsStatus("STALE");
        return;
      }

      setGpsStatus("ACTIVE");
    }, 1000);

    return () => clearInterval(id);
  }, []);

  // --------------------------------------------------
  // SOCKET.IO
  // --------------------------------------------------

  useEffect(() => {
    const socket = getVehicleSocket();

    function onConnect() {
      console.log("[VehicleContext] Backend connected");

      setBackendConnected(true);
    }

    function onDisconnect() {
      console.log("[VehicleContext] Backend disconnected");

      setBackendConnected(false);

      setVehicles((prev) => {
        const updated = {};

        for (const id of Object.keys(prev)) {
          updated[id] = {
            ...prev[id],
            connected: false,
          };
        }

        return updated;
      });
    }

    // --------------------------------------------------
    // Full fleet update
    // --------------------------------------------------

    function onVehiclesUpdate({ vehicles: list }) {
      if (!Array.isArray(list)) return;

      setVehicles(() => {
        const map = {};

        for (const v of list) {
          map[v.vehicleId] = {
            ...v,
          };
        }

        return map;
      });

      setBackendConnected(true);
    }

    // --------------------------------------------------
    // Pairing successful
    // --------------------------------------------------

    function onSessionAssigned({
      deviceId,
      vehicleId,
    }) {
      console.log(
        "[VehicleContext] Session assigned:",
        vehicleId
      );

      console.log(
        "[VehicleContext] Device:",
        deviceId
      );

      if (!vehicleId) return;

      const normalizedVehicleId =
        vehicleId.trim().toUpperCase();

      setMyVehicleId(normalizedVehicleId);

      setPairingStatus("PAIRED");
      setPairingError("");
    }

    // --------------------------------------------------
    // Pairing error
    // --------------------------------------------------

    function onSessionError({ message }) {
      console.error(
        "[VehicleContext] Pairing error:",
        message
      );

      setPairingStatus("ERROR");

      setPairingError(
        message || "Pairing failed"
      );
    }

    if (socket.connected) {
      setBackendConnected(true);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on(
      "vehicles:update",
      onVehiclesUpdate
    );

    socket.on(
      "session:assigned",
      onSessionAssigned
    );

    socket.on(
      "session:error",
      onSessionError
    );

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);

      socket.off(
        "vehicles:update",
        onVehiclesUpdate
      );

      socket.off(
        "session:assigned",
        onSessionAssigned
      );

      socket.off(
        "session:error",
        onSessionError
      );
    };
  }, []);

  // --------------------------------------------------
  // PAIR VEHICLE
  // --------------------------------------------------

  function pairVehicle(pairingCode) {
    const socket = getVehicleSocket();

    if (!socket.connected) {
      setPairingStatus("ERROR");
      setPairingError(
        "Backend is not connected"
      );
      return;
    }

    const normalizedCode =
      String(pairingCode)
        .trim()
        .replace(/\s/g, "");

    if (!/^\d{6}$/.test(normalizedCode)) {
      setPairingStatus("ERROR");
      setPairingError(
        "Enter a valid 6-digit pairing code"
      );
      return;
    }

    console.log(
      "[VehicleContext] Pairing with code:",
      normalizedCode
    );

    setPairingStatus("PAIRING");
    setPairingError("");

    socket.emit("session:pair", {
      pairingCode: normalizedCode,
    });
  }

  // --------------------------------------------------
  // Derived ego vehicle
  // --------------------------------------------------

  const egoVehicle =
    myVehicleId && vehicles[myVehicleId]
      ? {
          ...vehicles[myVehicleId],
          backendConnected,
        }
      : {
          ...EMPTY_VEHICLE,
          backendConnected,
        };

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

        // Pairing
        pairVehicle,
        pairingStatus,
        pairingError,
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  return useContext(VehicleContext);
}