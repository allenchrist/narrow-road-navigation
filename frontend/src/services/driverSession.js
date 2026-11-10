import { BACKEND_URL } from "../config";

const SESSION_KEY = "driverSession";

// Kept between visits, so a car screen doesn't need a login on every drive.
// Anything else saved under this name, such as a half-written or edited
// value, counts as logged out rather than breaking the page.
export function getDriverSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));

    return typeof session?.token === "string" &&
      typeof session.username === "string" &&
      session.username
      ? session
      : null;
  } catch {
    return null;
  }
}

export function signOutDriver() {
  localStorage.removeItem(SESSION_KEY);

  // Loaded here rather than at the top, so the login page doesn't download
  // the live connection code. If a car screen opened it, it's already loaded.
  import("./socket").then(({ closeVehicleSocket }) => closeVehicleSocket());
}

/**
 * Returns an error message to show, or null if signed in.
 */
export async function signInDriver(username, password) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return data.message || "Couldn't log in.";
    }

    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        token: data.token,
        username: data.user.username,
      }),
    );

    return null;
  } catch {
    return "Can't reach the server. It may be waking up, so try again in a moment.";
  }
}
