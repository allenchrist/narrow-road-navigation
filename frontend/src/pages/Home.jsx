import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import Icon from "../components/common/Icon";
import {
  getDriverSession,
  signInDriver,
} from "../services/driverSession";

function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState(
    location.state?.username ?? ""
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState(location.state?.reason ?? "");
  const [signingIn, setSigningIn] = useState(false);

  const session = getDriverSession();

  if (session) {
    return (
      <Navigate
        to={`/${encodeURIComponent(session.username)}`}
        replace
      />
    );
  }

  async function logIn(event) {
    event.preventDefault();

    setSigningIn(true);
    setError("");

    const message = await signInDriver(username.trim(), password);

    setSigningIn(false);

    if (message) {
      setError(message);
      setPassword("");
      return;
    }

    navigate(
      `/${encodeURIComponent(getDriverSession().username)}`,
      { replace: true }
    );
  }

  return (
    <div className="cv-center-page">
      <form className="cv-card cv-message-card" onSubmit={logIn}>
        <div className="cv-brand-mark cv-brand-mark--large">
          <Icon name="car" size={32} />
        </div>

        <h1>Connected Vehicle</h1>

        <p>
          Safer passage through narrow roads. Log in with
          your phone app's account to open your car screen.
        </p>

        <label className="cv-field">
          <span>Username</span>

          <input
            type="text"
            value={username}
            onChange={(event) =>
              setUsername(event.target.value)
            }
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoFocus={!username}
          />
        </label>

        <label className="cv-field cv-field--close">
          <span>Password</span>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            autoComplete="current-password"
            autoFocus={Boolean(username)}
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
          disabled={!username.trim() || !password || signingIn}
        >
          {signingIn ? "Logging in…" : "Log in"}
        </button>

        <p className="cv-form-note">
          New here? Create an account in the phone app.
        </p>
      </form>
    </div>
  );
}

export default Home;
