import {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";

import { useNavigate, useParams } from "react-router-dom";

import { signOutDriver } from "../services/driverSession";
import {
  getVehicleSocket,
  SOCKET_NOT_AUTHORIZED,
} from "../services/socket";

const VehicleContext = createContext(null);

// A backup only: the server says when this account's phone connects
const IDENTIFY_RETRY_MS = 60000;

const EMPTY_VEHICLE = {
  vehicleId: null,

  lat: null,
  lon: null,
  heading: null,
  speed: null,
  bearing: null,

  connected: false,
  active: false,

  narrowRoadAlert: null,
};

function getGpsStatus(backendConnected, myVehicleId, ego) {
  if (!backendConnected) return "DISCONNECTED";
  if (!myVehicleId) return "NO VEHICLE";
  if (!ego.connected) return "OFFLINE";
  if (ego.lat === null || ego.lon === null) return "WAITING";

  // The server decides this, so a wrong clock on this screen can't affect it
  return ego.active ? "ACTIVE" : "STALE";
}

export function VehicleProvider({ children }) {
  const { username } = useParams();
  const navigate = useNavigate();

  const [vehicles, setVehicles] =
    useState({});

  const [backendConnected, setBackendConnected] =
    useState(false);

  // Ego vehicle assigned to THIS dashboard
  const [myVehicleId, setMyVehicleId] =
    useState(null);

  const [sessionError, setSessionError] =
    useState("");

  // --------------------------------------------------
  // SOCKET.IO
  // --------------------------------------------------

  useEffect(() => {
    const socket =
      getVehicleSocket();

    function identifyDashboard() {
      socket.emit("session:identify");
    }

    // The login has expired, so the driver needs to log in again
    function onConnectError(error) {
      if (error.message === SOCKET_NOT_AUTHORIZED) {
        signOutDriver();

        navigate("/", {
          replace: true,
          state: {
            username,
            reason: "Your login has ended. Please log in again.",
          },
        });
      }
    }

    function onConnect() {
      setBackendConnected(true);

      identifyDashboard();
    }

    function onDisconnect() {
      setBackendConnected(false);

      setVehicles((previous) => {
        const updated = {};

        Object.keys(previous).forEach(
          (id) => {
            updated[id] = {
              ...previous[id],
              connected: false,
              active: false,
            };
          }
        );

        return updated;
      });
    }

    function onVehiclesUpdate({
      vehicles: list,
    }) {
      if (!Array.isArray(list)) {
        return;
      }

      const vehicleMap = {};

      list.forEach((vehicle) => {
        vehicleMap[vehicle.vehicleId] = vehicle;
      });

      setVehicles(vehicleMap);
      setBackendConnected(true);
    }

    function onSessionAssigned({
      vehicleId,
    }) {
      if (
        !vehicleId ||
        typeof vehicleId !== "string"
      ) {
        return;
      }

      setSessionError("");

      setMyVehicleId(
        vehicleId
          .trim()
          .toUpperCase()
      );
    }

    function onSessionError({
      message,
    }) {
      setSessionError(message);

      setMyVehicleId(null);
    }

    socket.on("connect", onConnect);
    socket.on("session:changed", identifyDashboard);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on("vehicles:update", onVehiclesUpdate);
    socket.on("session:assigned", onSessionAssigned);
    socket.on("session:error", onSessionError);

    // This page opened on a socket that is already connected,
    // for example after pressing Back from another page.
    if (socket.connected) {
      setBackendConnected(true);

      identifyDashboard();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("session:changed", identifyDashboard);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.off("vehicles:update", onVehiclesUpdate);
      socket.off("session:assigned", onSessionAssigned);
      socket.off("session:error", onSessionError);
    };
  }, [username, navigate]);

  // --------------------------------------------------
  // Keep checking until this dashboard has a vehicle,
  // in case a message from the server was missed.
  // --------------------------------------------------

  useEffect(() => {
    if (!backendConnected || myVehicleId) {
      return;
    }

    const socket =
      getVehicleSocket();

    const interval = setInterval(() => {
      socket.emit("session:identify");
    }, IDENTIFY_RETRY_MS);

    return () =>
      clearInterval(interval);
  }, [
    backendConnected,
    myVehicleId,
  ]);

  const egoVehicle =
    (myVehicleId && vehicles[myVehicleId]) ||
    EMPTY_VEHICLE;

  return (
    <VehicleContext.Provider
      value={{
        username,
        vehicles,
        egoVehicle,
        myVehicleId,
        backendConnected,
        sessionError,
        gpsStatus: getGpsStatus(
          backendConnected,
          myVehicleId,
          egoVehicle
        ),
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
