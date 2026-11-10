import { useState } from "react";

import { resetPassword, sendResetCode } from "../../services/passwordReset";
import Icon from "../common/Icon";
import PasswordField from "../common/PasswordField";

const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;

// Only shown on phones, where the side panel with the name is hidden
const brand = (
  <div className="cv-auth-brand cv-auth-brand--compact">
    <div className="cv-brand-mark">
      <Icon name="car" size={22} />
    </div>

    <span>Connected Vehicle</span>
  </div>
);

/**
 * Changing a forgotten password, in two steps: the email address, then the
 * emailed code with a new password. Uses the same codes as the phone app.
 */
function ForgotPasswordForm({ onDone, onCancel }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(event) {
    event?.preventDefault();

    setBusy(true);
    setError("");
    setNotice("");

    const message = await sendResetCode(email.trim());

    setBusy(false);

    if (message) {
      setError(message);
      return;
    }

    setStep("code");
    setNotice(
      step === "code"
        ? "We've sent a new code, if that email has an account."
        : "",
    );
  }

  async function changePassword(event) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setNotice("");

    const message = await resetPassword(email.trim(), code.trim(), newPassword);

    setBusy(false);

    if (message) {
      setError(message);
      return;
    }

    onDone();
  }

  if (step === "email") {
    return (
      <form className="cv-auth-form" onSubmit={sendCode}>
        {brand}

        <h2>Reset your password</h2>

        <p>Enter your account's email address. We'll send you a code.</p>

        <label className="cv-field">
          <span>Email</span>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck="false"
            autoFocus
          />
        </label>

        {error && (
          <div className="cv-form-error" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="cv-button"
          disabled={!email.includes("@") || busy}
        >
          {busy ? "Sending…" : "Send code"}
        </button>

        <button type="button" className="cv-text-button" onClick={onCancel}>
          Back to log in
        </button>
      </form>
    );
  }

  return (
    <form className="cv-auth-form" onSubmit={changePassword}>
      {brand}

      <h2>Enter your code</h2>

      <p>
        If {email.trim()} has an account, we've sent it a {CODE_LENGTH}-digit
        code. It expires in 10 minutes.
      </p>

      <label className="cv-field">
        <span>Code</span>

        <input
          className="cv-code-input"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
          }
          autoComplete="one-time-code"
          autoFocus
        />
      </label>

      <PasswordField
        label={`New password, at least ${MIN_PASSWORD_LENGTH} characters`}
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        close
      />

      {notice && <div className="cv-form-success">{notice}</div>}

      {error && (
        <div className="cv-form-error" role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="cv-button"
        disabled={
          code.length !== CODE_LENGTH ||
          newPassword.length < MIN_PASSWORD_LENGTH ||
          busy
        }
      >
        {busy ? "Changing…" : "Change password"}
      </button>

      <div className="cv-text-buttons">
        <button
          type="button"
          className="cv-text-button"
          onClick={() => sendCode()}
          disabled={busy}
        >
          Send a new code
        </button>

        <button type="button" className="cv-text-button" onClick={onCancel}>
          Back to log in
        </button>
      </div>
    </form>
  );
}

export default ForgotPasswordForm;
