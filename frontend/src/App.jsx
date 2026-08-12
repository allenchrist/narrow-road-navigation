import { VehicleProvider } from "./context/VehicleContext";
import Dashboard from "./pages/Dashboard";
import "./App.css";

function App() {
  return (
    <VehicleProvider>
      <Dashboard />
    </VehicleProvider>
  );
}

export default App;
