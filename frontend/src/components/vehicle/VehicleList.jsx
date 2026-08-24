import { useVehicle } from "../../context/VehicleContext";
import { haversineDistance, formatDistance } from "../../utils/haversine";

const STALE_MS = 5000;

function vehicleStatus(v) {
  if (!v.connected) return "OFFLINE";
  if (!v.lastReceivedAt) return "WAITING";
  if (Date.now() - v.lastReceivedAt > STALE_MS) return "STALE";
  return "ONLINE";
}

function VehicleList() {
  const { vehicles, egoVehicle, myVehicleId } = useVehicle();

  // --------------------------------------------------
  // ONLY SHOW:
  // 1. Ego vehicle — always
  // 2. Other vehicles — only while connected
  // --------------------------------------------------

  const list = Object.values(vehicles).filter(
    (v) =>
      v.vehicleId === myVehicleId ||
      v.connected === true
  );

  if (list.length === 0) return null;

  // --------------------------------------------------
  // SORT
  // Ego vehicle first, then other vehicles
  // --------------------------------------------------

  const sorted = [...list].sort((a, b) => {
    if (a.vehicleId === myVehicleId) return -1;
    if (b.vehicleId === myVehicleId) return 1;

    return a.vehicleId.localeCompare(b.vehicleId);
  });

  return (
    <div className="vehicle-list-section">

      <div className="telemetry-title">
        <span>CONNECTED VEHICLES</span>

        <span className="live-badge">
          {list.length}
        </span>
      </div>

      {sorted.map((v) => {

        const status = vehicleStatus(v);

        const isEgo =
          v.vehicleId === myVehicleId;

        const dist =
          !isEgo &&
          egoVehicle.lat !== null &&
          egoVehicle.lon !== null &&
          v.lat !== null &&
          v.lon !== null
            ? haversineDistance(
                egoVehicle.lat,
                egoVehicle.lon,
                v.lat,
                v.lon
              )
            : null;

        return (
          <div
            key={v.vehicleId}
            className={
              `vehicle-list-item${
                isEgo
                  ? " vehicle-list-item--ego"
                  : ""
              }`
            }
          >

            {/* LEFT SIDE */}
            <div className="vehicle-list-left">

              <span
                className={
                  `vehicle-list-dot ${
                    status === "ONLINE"
                      ? "online"
                      : status === "STALE"
                      ? "standby"
                      : "offline"
                  }`
                }
              />

              <span className="vehicle-list-id">

                {v.vehicleId}

                {isEgo && (
                  <span className="ego-tag">
                    YOU
                  </span>
                )}

              </span>

            </div>

            {/* RIGHT SIDE */}
            <div className="vehicle-list-right">

              {/* Distance is shown only for other ONLINE vehicles */}
              {!isEgo &&
                status === "ONLINE" &&
                dist !== null && (
                  <span className="vehicle-list-dist">
                    {formatDistance(dist)}
                  </span>
                )}

              <span
                className={
                  `vehicle-list-status ${
                    status === "ONLINE"
                      ? "healthy"
                      : status === "STALE"
                      ? "stale"
                      : "disconnected-label"
                  }`
                }
              >
                {status}
              </span>

            </div>

          </div>
        );
      })}

    </div>
  );
}

export default VehicleList;