import { BrowserRouter, Routes, Route } from "react-router-dom";

import { VehicleProvider } from "./context/VehicleContext";

import Dashboard from "./pages/Dashboard";
import AdminPage from "./pages/AdminPage";
import SuggestNarrowRoad from "./pages/SuggestNarrowRoad";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Username-based vehicle dashboard */}
        <Route
          path="/:username"
          element={
            <VehicleProvider>
              <Dashboard />
            </VehicleProvider>
          }
        />

        {/* Username-based Suggest Narrow Road */}
        <Route
          path="/:username/suggest-narrow-road"
          element={<SuggestNarrowRoad />}
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