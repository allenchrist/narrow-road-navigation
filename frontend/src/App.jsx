import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import ErrorBoundary from "./components/common/ErrorBoundary";
import RequireDriver from "./components/common/RequireDriver";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

// The map, live connection and admin tools load only when their page opens,
// so the login page appears quickly
const VehicleProvider = lazy(() =>
  import("./context/VehicleContext").then((module) => ({
    default: module.VehicleProvider,
  })),
);
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminAccess = lazy(() => import("./pages/AdminAccess"));
const SuggestNarrowRoad = lazy(() => import("./pages/SuggestNarrowRoad"));

function PageLoading() {
  return (
    <div className="cv-center-page">
      <div className="cv-spinner" role="progressbar" aria-label="Loading" />
    </div>
  );
}

import "./styles/dashboard.css";
import "./styles/pages.css";

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />

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
            <Route path="/admin" element={<AdminAccess />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
