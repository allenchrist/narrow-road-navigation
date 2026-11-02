import { BrowserRouter, Routes, Route } from "react-router-dom";

import { VehicleProvider } from "./context/VehicleContext";

import ErrorBoundary from "./components/common/ErrorBoundary";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import AdminPage from "./pages/AdminPage";
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
