import { useState } from "react";
import { useVehicle } from "../../context/VehicleContext";

function VehiclePairing() {
  const {
    myVehicleId,
    backendConnected,
    pairVehicle,
    pairingStatus,
    pairingError,
  } = useVehicle();

  const [code, setCode] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();

    pairVehicle(code);
  };

  // --------------------------------------------------
  // Already paired
  // --------------------------------------------------

  if (pairingStatus === "PAIRED" && myVehicleId) {
    return (
      <div className="vehicle-pairing vehicle-pairing--paired">
        <div className="vehicle-pairing-title">
          🚗 YOUR VEHICLE
        </div>

        <div className="vehicle-pairing-id">
          {myVehicleId}
        </div>

        <div className="vehicle-pairing-status">
          ● PAIRED
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // Pairing UI
  // --------------------------------------------------

  return (
    <div className="vehicle-pairing">
      <div className="vehicle-pairing-title">
        CONNECT VEHICLE
      </div>

      <div className="vehicle-pairing-subtitle">
        Enter the 6-digit code shown on your Android
        vehicle app.
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          disabled={!backendConnected || pairingStatus === "PAIRING"}
          onChange={(event) => {
            const value = event.target.value
              .replace(/\D/g, "")
              .slice(0, 6);

            setCode(value);
          }}
          placeholder="000000"
          aria-label="Vehicle pairing code"
        />

        <button
          type="submit"
          disabled={
            !backendConnected ||
            code.length !== 6 ||
            pairingStatus === "PAIRING"
          }
        >
          {pairingStatus === "PAIRING"
            ? "CONNECTING..."
            : "CONNECT"}
        </button>
      </form>

      {!backendConnected && (
        <div className="vehicle-pairing-error">
          Backend disconnected
        </div>
      )}

      {pairingStatus === "ERROR" &&
        pairingError && (
          <div className="vehicle-pairing-error">
            {pairingError}
          </div>
        )}
    </div>
  );
}

export default VehiclePairing;