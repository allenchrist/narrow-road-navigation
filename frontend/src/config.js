// The one backend this website talks to. A single address means the dashboard
// and admin pages can't end up on different servers.
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "https://narrow-road-navigation-ckml.onrender.com";
