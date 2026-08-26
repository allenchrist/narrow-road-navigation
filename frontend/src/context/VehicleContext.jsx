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
  const [backendConnected, setBackendConnected] =
    useState(false);

  const [gpsStatus, setGpsStatus] =
    useState("DISCONNECTED");

  // --------------------------------------------------
  // Ego vehicle assigned to THIS dashboard
  // --------------------------------------------------

  const [myVehicleId, setMyVehicleId] =
    useState(null);

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
    const interval = setInterval(() => {
      const {
        vehicles: vehicleMap,
        backendConnected: connected,
        myVehicleId: egoId,
      } = stateRef.current;

      if (!connected) {
        setGpsStatus("DISCONNECTED");
        return;
      }

      if (!egoId) {
        setGpsStatus("NO VEHICLE");
        return;
      }

      const ego = vehicleMap[egoId];

      if (!ego) {
        setGpsStatus("NO SIGNAL");
        return;
      }

      if (!ego.connected) {
        setGpsStatus("OFFLINE");
        return;
      }

      if (ego.lat === null || ego.lon === null) {
        setGpsStatus("WAITING");
        return;
      }

      if (
        ego.lastReceivedAt &&
        Date.now() - ego.lastReceivedAt >
          STALE_THRESHOLD_MS
      ) {
        setGpsStatus("STALE");
        return;
      }

      setGpsStatus("ACTIVE");
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // --------------------------------------------------
  // SOCKET.IO
  // --------------------------------------------------

  useEffect(() => {
    const socket = getVehicleSocket();

    function onConnect() {
      console.log(
        "[VehicleContext] Backend connected"
      );

      setBackendConnected(true);
    }

    function onDisconnect() {
      console.log(
        "[VehicleContext] Backend disconnected"
      );

      setBackendConnected(false);

      setVehicles((previous) => {
        const updated = {};

        Object.keys(previous).forEach((id) => {
          updated[id] = {
            ...previous[id],
            connected: false,
          };
        });

        return updated;
      });
    }

    // --------------------------------------------------
    // Full fleet update
    // --------------------------------------------------

    function onVehiclesUpdate({ vehicles: list }) {
      if (!Array.isArray(list)) return;

      const vehicleMap = {};

      list.forEach((vehicle) => {
        vehicleMap[vehicle.vehicleId] = {
          ...vehicle,
        };
      });

      console.log(
        "[VehicleContext] VEHICLES UPDATE:",
        vehicleMap
      );

      const ego =
        myVehicleId
          ? vehicleMap[myVehicleId]
          : null;

      console.log(
        "[VehicleContext] MY VEHICLE:",
        myVehicleId
      );

      console.log(
        "[VehicleContext] EGO VEHICLE:",
        ego
      );

      console.log(
        "[VehicleContext] GEOFENCE:",
        {
          insideNarrowRoad:
            ego?.insideNarrowRoad,

          narrowRoadName:
            ego?.narrowRoadName,
        }
      );

      setVehicles(vehicleMap);
      setBackendConnected(true);
    }

    // --------------------------------------------------
    // Dashboard → Vehicle assignment
    // --------------------------------------------------

    function onSessionAssigned({
      deviceId,
      vehicleId,
    }) {
      console.log(
        "[VehicleContext] SESSION ASSIGNED"
      );

      console.log(
        "[VehicleContext] Device:",
        deviceId
      );

      console.log(
        "[VehicleContext] Vehicle:",
        vehicleId
      );

      if (
        !vehicleId ||
        typeof vehicleId !== "string"
      ) {
        console.error(
          "[VehicleContext] Invalid vehicleId"
        );

        return;
      }

      const normalizedVehicleId =
        vehicleId.trim().toUpperCase();

      console.log(
        "[VehicleContext] Setting MY VEHICLE ID:",
        normalizedVehicleId
      );

      setMyVehicleId(
        normalizedVehicleId
      );
    }

    // --------------------------------------------------
    // Identity error
    // --------------------------------------------------

    function onSessionError({ message }) {
      console.error(
        "[VehicleContext] SESSION ERROR:",
        message
      );

      setMyVehicleId(null);
    }

    if (socket.connected) {
      setBackendConnected(true);
    }

    socket.on("connect", onConnect);

    socket.on(
      "disconnect",
      onDisconnect
    );

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

      socket.off(
        "disconnect",
        onDisconnect
      );

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
  // Derived ego vehicle
  // --------------------------------------------------

  const egoVehicle =
    myVehicleId &&
    vehicles[myVehicleId]
      ? {
          ...vehicles[myVehicleId],
          backendConnected,
        }
      : {
          ...EMPTY_VEHICLE,
          backendConnected,
        };

  // Existing components use this alias
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