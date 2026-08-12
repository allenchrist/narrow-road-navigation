import { createContext, useContext, useState, useEffect, useRef } from "react";
import { getVehicleSocket } from "../services/socket";

const VehicleContext = createContext(null);
const STALE_THRESHOLD_MS = 5000;

export function VehicleProvider({ children }) {
  const [vehicle, setVehicle] = useState({
    lat: null,
    lon: null,
    heading: null,
    accelX: null,
    accelY: null,
    accelZ: null,
    gyroX: null,
    gyroY: null,
    gyroZ: null,
    androidConnected: false,
    lastReceivedAt: null,
    backendConnected: false,
  });

  const [gpsStatus, setGpsStatus] = useState("NO DATA");
  const vehicleRef = useRef(vehicle);
  vehicleRef.current = vehicle;

  useEffect(() => {
    const id = setInterval(() => {
      const v = vehicleRef.current;
      if (!v.backendConnected) {
        setGpsStatus("DISCONNECTED");
      } else if (!v.androidConnected) {
        setGpsStatus("NO SIGNAL");
      } else if (v.lat === null) {
        setGpsStatus("WAITING");
      } else if (v.lastReceivedAt && Date.now() - v.lastReceivedAt > STALE_THRESHOLD_MS) {
        setGpsStatus("STALE");
      } else {
        setGpsStatus("ACTIVE");
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const socket = getVehicleSocket();

    function onConnect() {
      setVehicle((prev) => ({ ...prev, backendConnected: true }));
    }

    function onDisconnect() {
      setVehicle((prev) => ({
        ...prev,
        backendConnected: false,
        androidConnected: false,
      }));
    }

    function onVehicleUpdate(data) {
      setVehicle({
        lat: data.lat,
        lon: data.lon,
        heading: data.heading,
        accelX: data.accelX,
        accelY: data.accelY,
        accelZ: data.accelZ,
        gyroX: data.gyroX,
        gyroY: data.gyroY,
        gyroZ: data.gyroZ,
        androidConnected: data.androidConnected,
        lastReceivedAt: data.lastReceivedAt,
        backendConnected: true,
      });
    }

    if (socket.connected) {
      setVehicle((prev) => ({ ...prev, backendConnected: true }));
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("vehicle:update", onVehicleUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("vehicle:update", onVehicleUpdate);
    };
  }, []);

  return (
    <VehicleContext.Provider value={{ vehicle, gpsStatus }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  return useContext(VehicleContext);
}
