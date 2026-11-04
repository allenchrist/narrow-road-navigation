import { useState } from "react";

import { useVehicle } from "../context/VehicleContext";
import { useAlertSound } from "../hooks/useAlertSound";
import { useKeepScreenAwake } from "../hooks/useKeepScreenAwake";
import { usePageTitle } from "../hooks/usePageTitle";

import TopBar from "../components/layout/TopBar";
import DrivePanel from "../components/layout/DrivePanel";
import VehicleMap from "../components/map/VehicleMap";
import NarrowRoadAlert from "../components/alerts/NarrowRoadAlert";
import StatusNotice from "../components/alerts/StatusNotice";
import SessionOverlay from "../components/alerts/SessionOverlay";

function Dashboard() {
  const { egoVehicle, backendConnected } = useVehicle();

  const [soundOn, setSoundOn] = useState(true);

  // An alert from before a lost connection may no longer be true
  const alert =
    backendConnected && egoVehicle.active
      ? egoVehicle.narrowRoadAlert
      : null;

  const soundUnlocked = useAlertSound(alert?.level, soundOn);

  useKeepScreenAwake();
  usePageTitle("Car screen");

  return (
    <div className="cv-dashboard">
      <VehicleMap
        soundOn={soundOn}
        soundUnlocked={soundUnlocked}
        onToggleSound={() =>
          setSoundOn((previous) => !previous)
        }
      />

      <TopBar />

      <DrivePanel alert={alert} />

      <div className="cv-alert-area">
        <NarrowRoadAlert alert={alert} />
        <StatusNotice />
      </div>

      <SessionOverlay />
    </div>
  );
}

export default Dashboard;
