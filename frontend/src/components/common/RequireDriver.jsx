import { Navigate, useNavigate, useParams } from "react-router-dom";

import {
  getDriverSession,
  signOutDriver,
} from "../../services/driverSession";
import Icon from "./Icon";

/**
 * Shows a page only to the driver whose address it is. Anyone else
 * goes to the login page, or is asked if they want to switch accounts.
 */
function RequireDriver({ children }) {
  const { username } = useParams();
  const navigate = useNavigate();

  const session = getDriverSession();

  if (!session) {
    return <Navigate to="/" replace state={{ username }} />;
  }

  if (session.username.toLowerCase() === username.toLowerCase()) {
    if (session.username === username) {
      return children;
    }

    return (
      <Navigate
        to={`/${encodeURIComponent(session.username)}`}
        replace
      />
    );
  }

  return (
    <div className="cv-center-page">
      <div className="cv-card cv-message-card">
        <div className="cv-overlay-icon">
          <Icon name="person" size={30} />
        </div>

        <h1>Switch account?</h1>

        <p>
          You're logged in as {session.username}. Log out to open {username}.
        </p>

        <button
          type="button"
          className="cv-button"
          onClick={() => {
            signOutDriver();
            navigate("/", { replace: true, state: { username } });
          }}
        >
          Log out and switch
        </button>

        <button
          type="button"
          className="cv-button cv-button--quiet"
          onClick={() =>
            navigate(`/${encodeURIComponent(session.username)}`, {
              replace: true,
            })
          }
        >
          Back to my dashboard
        </button>
      </div>
    </div>
  );
}

export default RequireDriver;
