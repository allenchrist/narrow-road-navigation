import { useVehicle } from "../../context/VehicleContext";

const NOTICES = {
  DISCONNECTED: "Connection lost. Reconnecting…",
  OFFLINE: "Your phone is offline. Check the app and its internet connection.",
  WAITING: "Waiting for GPS from your phone…",
  STALE: "No recent update from your phone. Alerts are paused.",
};

/**
 * A small notice for problems while the dashboard is otherwise usable.
 * SessionOverlay covers the cases where there is nothing to show yet.
 */
function StatusNotice() {
  const { myVehicleId, gpsStatus } = useVehicle();

  const notice = NOTICES[gpsStatus];

  if (!notice || (!myVehicleId && gpsStatus !== "DISCONNECTED")) {
    return null;
  }

  return (
    <div className="cv-notice" role="status">
      {notice}
    </div>
  );
}

export default StatusNotice;
