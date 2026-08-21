import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import StatusBar from "../components/layout/StatusBar";
import VehicleMap from "../components/map/VehicleMap";
import VehiclePairing from "../components/pairing/VehiclePairing";

function Dashboard() {
  return (
    <div className="dashboard">
      <Header />

      <div className="dashboard-body">
        <Sidebar />

        <main className="main-view">

          <VehiclePairing />

          <VehicleMap />

        </main>
      </div>

      <StatusBar />
    </div>
  );
}

export default Dashboard;