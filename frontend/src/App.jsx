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

        {/* Normal vehicle dashboard */}
        <Route
          path="/"
          element={
            <VehicleProvider>
              <Dashboard />
            </VehicleProvider>
          }
        />

        {/* Suggest Narrow Road */}
        <Route
          path="/suggest-narrow-road"
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