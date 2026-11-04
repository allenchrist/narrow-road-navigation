import { BrowserRouter, Routes, Route } from "react-router-dom";

import { VehicleProvider } from "./context/VehicleContext";

import ErrorBoundary from "./components/common/ErrorBoundary";
import RequireDriver from "./components/common/RequireDriver";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import AdminAccess from "./pages/AdminAccess";
import SuggestNarrowRoad from "./pages/SuggestNarrowRoad";

import "./styles/dashboard.css";
import "./styles/pages.css";

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>

          <Route
            path="/"
            element={<Home />}
          />

          {/* Username-based vehicle dashboard */}
          <Route
            path="/:username"
            element={
              <RequireDriver>
                <VehicleProvider>
                  <Dashboard />
                </VehicleProvider>
              </RequireDriver>
            }
          />

          {/* Username-based Suggest Narrow Road */}
          <Route
            path="/:username/suggest-narrow-road"
            element={
              <RequireDriver>
                <SuggestNarrowRoad />
              </RequireDriver>
            }
          />

          {/* Admin narrow-road management */}
          <Route
            path="/admin"
            element={<AdminAccess />}
          />

          <Route
            path="*"
            element={<NotFound />}
          />

        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
