import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import Icon from "../components/common/Icon";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  getDriverSession,
  signInDriver,
} from "../services/driverSession";

const FEATURES = [
  {
    icon: "car",
    title: "See who's coming",
    detail: "Nearby vehicles appear on your car screen as they move.",
  },
  {
    icon: "yield",
    title: "Know who gives way",
    detail: "When two cars meet head on, each driver gets a clear instruction.",
  },
  {
    icon: "phone",
    title: "Your phone connects your car",
    detail: "The app shares your position, even with the screen locked.",
  },
];

function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  usePageTitle("Log in");

  const [username, setUsername] = useState(
    location.state?.username ?? ""
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="cv-auth">
      <section className="cv-auth-intro">
        <div className="cv-auth-brand">
          <div className="cv-brand-mark">
            <Icon name="car" size={22} />
          </div>

          <span>Connected Vehicle</span>
        </div>

        <h1>Pass narrow roads with confidence.</h1>

        <ul>
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <span className="cv-auth-feature-icon">
                <Icon name={feature.icon} size={20} />
              </span>

              <div>
                <strong>{feature.title}</strong>
                <span>{feature.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <main className="cv-auth-main">
        <form className="cv-auth-form" onSubmit={logIn}>
          <div className="cv-auth-brand cv-auth-brand--compact">
            <div className="cv-brand-mark">
              <Icon name="car" size={22} />
            </div>

            <span>Connected Vehicle</span>
          </div>

          <h2>Log in</h2>

          <p>Use your phone app's account to open your car screen.</p>

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

            <div className="cv-password">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete="current-password"
                autoFocus={Boolean(username)}
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword((previous) => !previous)
                }
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <Icon
                  name={showPassword ? "visibilityOff" : "visibility"}
                  size={20}
                />
              </button>
            </div>
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
      </main>
    </div>
  );
}

export default Home;
