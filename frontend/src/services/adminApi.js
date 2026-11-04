import { BACKEND_URL } from "../config";

const TOKEN_KEY = "adminToken";

// Tells the admin page its login is no longer valid
export const ADMIN_SIGNED_OUT_EVENT = "admin-signed-out";

// Session storage, so closing the tab signs out on shared computers
export function hasAdminToken() {
  return Boolean(sessionStorage.getItem(TOKEN_KEY));
}

export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Returns an error message to show, or null if signed in.
 */
export async function signInAdmin(password) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return data.message || "Couldn't sign in.";
    }

    sessionStorage.setItem(TOKEN_KEY, data.token);

    return null;
  } catch {
    return "Can't reach the server. It may be waking up, so try again in a moment.";
  }
}

export async function adminFetch(path, options = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}`,
    },
  });

  if (response.status === 401) {
    clearAdminToken();
    window.dispatchEvent(new Event(ADMIN_SIGNED_OUT_EVENT));
  }

  return response;
}
