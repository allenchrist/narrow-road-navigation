import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";

import { useParams } from "react-router-dom";

import { getVehicleSocket } from "../services/socket";

const VehicleContext = createContext(null);

const STALE_THRESHOLD_MS = 5000;

const IDENTIFY_RETRY_MS = 5000;

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

  insideNarrowRoad: false,
  narrowRoadId: null,
  narrowRoadName: null,

  otherVehiclesInSameNarrowRoad: 0,

  narrowRoadAlert: null,
};

export function VehicleProvider({ children }) {
  const { username } = useParams();

  const [vehicles, setVehicles] =
    useState({});

  const [backendConnected, setBackendConnected] =
    useState(false);

  const [gpsStatus, setGpsStatus] =
    useState("DISCONNECTED");

  // --------------------------------------------------
  // Ego vehicle assigned to THIS dashboard
  // --------------------------------------------------

  const [myVehicleId, setMyVehicleId] =
    useState(null);

  const [sessionError, setSessionError] =
    useState("");

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

      if (
        ego.lat === null ||
        ego.lon === null
      ) {
        setGpsStatus("WAITING");
        return;
      }

      if (
        ego.lastReceivedAt &&
        Date.now() -
          ego.lastReceivedAt >
          STALE_THRESHOLD_MS
      ) {
        setGpsStatus("STALE");
        return;
      }

      setGpsStatus("ACTIVE");
    }, 1000);

    return () =>
      clearInterval(interval);
  }, []);

  // --------------------------------------------------
  // SOCKET.IO
  // --------------------------------------------------

  useEffect(() => {
    const socket =
      getVehicleSocket();

    function identifyDashboard() {
      socket.emit("session:identify", {
        username,
      });
    }

    function onConnect() {
      console.log(
        "[VehicleContext] Backend connected"
      );

      setBackendConnected(true);

      identifyDashboard();
    }

    function onDisconnect() {
      console.log(
        "[VehicleContext] Backend disconnected"
      );

      setBackendConnected(false);

      setVehicles((previous) => {
        const updated = {};

        Object.keys(previous).forEach(
          (id) => {
            updated[id] = {
              ...previous[id],
              connected: false,
            };
          }
        );

        return updated;
      });
    }

    // --------------------------------------------------
    // Full fleet update
    // --------------------------------------------------

    function onVehiclesUpdate({
      vehicles: list,
    }) {
      if (!Array.isArray(list)) {
        return;
      }

      const vehicleMap = {};

      list.forEach((vehicle) => {
        vehicleMap[
          vehicle.vehicleId
        ] = {
          ...vehicle,

          // Safety fallback
          otherVehiclesInSameNarrowRoad:
            Number(
              vehicle.otherVehiclesInSameNarrowRoad
            ) || 0,
        };
      });

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
        vehicleId
          .trim()
          .toUpperCase();

      console.log(
        "[VehicleContext] Setting MY VEHICLE ID:",
        normalizedVehicleId
      );

      setSessionError("");

      setMyVehicleId(
        normalizedVehicleId
      );
    }

    // --------------------------------------------------
    // Identity error
    // --------------------------------------------------

    function onSessionError({
      message,
    }) {
      console.error(
        "[VehicleContext] SESSION ERROR:",
        message
      );

      setSessionError(message);

      setMyVehicleId(null);
    }

    // This page opened on a socket that is already connected,
    // for example after pressing Back from another page.
    if (socket.connected) {
      setBackendConnected(true);

      identifyDashboard();
    }

    socket.on(
      "connect",
      onConnect
    );

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
      socket.off(
        "connect",
        onConnect
      );

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
  }, [username]);

  // --------------------------------------------------
  // Keep trying until this dashboard has a vehicle.
  // The phone may connect after the dashboard opens.
  // --------------------------------------------------

  useEffect(() => {
    if (!backendConnected || myVehicleId) {
      return;
    }

    const socket =
      getVehicleSocket();

    const interval = setInterval(() => {
      socket.emit("session:identify", {
        username,
      });
    }, IDENTIFY_RETRY_MS);

    return () =>
      clearInterval(interval);
  }, [
    backendConnected,
    myVehicleId,
    username,
  ]);

  // --------------------------------------------------
  // Derived ego vehicle
  // --------------------------------------------------

  const baseEgoVehicle =
    myVehicleId &&
    vehicles[myVehicleId]
      ? vehicles[myVehicleId]
      : EMPTY_VEHICLE;

  // --------------------------------------------------
  // Final ego vehicle
  // --------------------------------------------------

  const egoVehicle = {
    ...baseEgoVehicle,
    backendConnected,
  };

  // Existing components use this alias
  const vehicle =
    egoVehicle;

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

        sessionError,
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  return useContext(
    VehicleContext
  );
}