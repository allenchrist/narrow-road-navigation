import Header from "../components/layout/Header";
import StatusBar from "../components/layout/StatusBar";
import VehicleMap from "../components/map/VehicleMap";

function Dashboard() {
  return (
    <div className="dashboard">
      <Header />

      <div className="dashboard-body">
        <main className="main-view">
          <VehicleMap />
        </main>
      </div>

      <StatusBar />
    </div>
  );
}

export default Dashboard;