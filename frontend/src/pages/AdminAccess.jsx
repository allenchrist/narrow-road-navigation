import { useEffect, useState } from "react";

import Icon from "../components/common/Icon";
import {
  ADMIN_SIGNED_OUT_EVENT,
  clearAdminToken,
  hasAdminToken,
  signInAdmin,
} from "../services/adminApi";
import { usePageTitle } from "../hooks/usePageTitle";
import AdminPage from "./AdminPage";

function AdminLogin({ onSignedIn }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function submit(event) {
    event.preventDefault();

    setSigningIn(true);
    setError("");

    const message = await signInAdmin(password);

    setSigningIn(false);

    if (message) {
      setError(message);
      setPassword("");
    } else {
      onSignedIn();
    }
  }

  return (
    <div className="cv-center-page">
      <form className="cv-card cv-message-card" onSubmit={submit}>
        <div className="cv-brand-mark cv-brand-mark--large">
          <Icon name="road" size={32} />
        </div>

        <h1>Narrow road admin</h1>

        <p>Enter the admin password to manage roads and suggestions.</p>

        <label className="cv-field">
          <span>Password</span>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
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
          disabled={!password || signingIn}
        >
          {signingIn ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function AdminAccess() {
  usePageTitle("Admin");

  const [signedIn, setSignedIn] = useState(hasAdminToken);

  useEffect(() => {
    function onSignedOut() {
      setSignedIn(false);
    }

    window.addEventListener(ADMIN_SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      window.removeEventListener(ADMIN_SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  if (!signedIn) {
    return <AdminLogin onSignedIn={() => setSignedIn(true)} />;
  }

  return (
    <AdminPage
      onSignOut={() => {
        clearAdminToken();
        setSignedIn(false);
      }}
    />
  );
}

export default AdminAccess;
