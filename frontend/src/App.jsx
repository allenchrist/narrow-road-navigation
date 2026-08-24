import { BrowserRouter, Routes, Route } from "react-router-dom";

import { VehicleProvider } from "./context/VehicleContext";

import Dashboard from "./pages/Dashboard";
import AdminPage from "./pages/AdminPage";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Normal vehicle dashboard */}
        <Route
          path="/"
          element={
            <VehicleProvider>
              <Dashboard />
            </VehicleProvider>
          }
        />

        {/* Admin narrow-road management */}
        <Route
          path="/admin"
          element={<AdminPage />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;