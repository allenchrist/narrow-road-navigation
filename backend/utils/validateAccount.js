const {
  DEFAULT_VEHICLE_TYPE,
  VEHICLE_TYPE_ERROR,
  isValidVehicleType,
} = require("./vehicleTypes");

const USERNAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{2,49}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 8;

// bcrypt ignores anything past this many bytes
const MAX_PASSWORD_BYTES = 72;

// The username becomes the dashboard's address, so these would clash with it
const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "health",
  "vehicle",
  "socket.io",
]);

// Returns an error message to show, or null if the password is fine
function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return "Password is too long.";
  }

  return null;
}

/**
 * Returns the cleaned-up account details, or an error message to show.
 */
function validateRegistration({
  username,
  email,
  password,
  vehicleType = DEFAULT_VEHICLE_TYPE,
}) {
  if (
    typeof username !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return { error: "Username, email, and password are required." };
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim();

  if (!USERNAME_PATTERN.test(cleanUsername)) {
    return {
      error:
        "Username must be 3 to 50 characters: letters, numbers, dots, dashes and underscores.",
    };
  }

  if (RESERVED_USERNAMES.has(cleanUsername.toLowerCase())) {
    return { error: "That username isn't available." };
  }

  if (cleanEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(cleanEmail)) {
    return { error: "Enter a valid email address." };
  }

  const passwordError = validatePassword(password);

  if (passwordError) {
    return { error: passwordError };
  }

  if (!isValidVehicleType(vehicleType)) {
    return { error: VEHICLE_TYPE_ERROR };
  }

  return {
    username: cleanUsername,
    email: cleanEmail,
    password,
    vehicleType,
  };
}

module.exports = { validateRegistration, validatePassword };
