import { BACKEND_URL } from "../config";

const OFFLINE_MESSAGE =
  "Can't reach the server. It may be waking up, so try again in a moment.";

async function postJson(path, body, fallback) {
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return null;
    }

    const data = await response.json().catch(() => ({}));

    return data.message || fallback;
  } catch {
    return OFFLINE_MESSAGE;
  }
}

/**
 * Emails a code to change the password. The server replies the same way
 * whether or not the email has an account. Returns an error message, or null.
 */
export function sendResetCode(email) {
  return postJson(
    "/api/auth/password/forgot",
    { email },
    "Couldn't send the code."
  );
}

// Returns an error message to show, or null once the password has changed
export function resetPassword(email, code, newPassword) {
  return postJson(
    "/api/auth/password/reset",
    { email, code, newPassword },
    "Couldn't change your password."
  );
}

// A free server sleeps when nobody uses it. This starts waking it up while
// the driver is still typing, so logging in doesn't have to wait.
export function wakeServer() {
  fetch(`${BACKEND_URL}/health`).catch(() => {});
}
