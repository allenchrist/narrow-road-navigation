import { BACKEND_URL } from "../config";
import { closeVehicleSocket } from "./socket";

const SESSION_KEY = "driverSession";

// Kept between visits, so a car screen doesn't need a login on every drive
export function getDriverSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function signOutDriver() {
  localStorage.removeItem(SESSION_KEY);
  closeVehicleSocket();
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
      })
    );

    return null;
  } catch {
    return "Can't reach the server. It may be waking up, so try again in a moment.";
  }
}
