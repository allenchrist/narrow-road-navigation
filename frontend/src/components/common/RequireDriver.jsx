import { Navigate, useParams } from "react-router-dom";

import { getDriverSession } from "../../services/driverSession";

/**
 * Shows a page only to the driver whose address it is. Anyone else
 * goes to the login page, or back to their own dashboard.
 */
function RequireDriver({ children }) {
  const { username } = useParams();

  const session = getDriverSession();

  if (!session) {
    return <Navigate to="/" replace state={{ username }} />;
  }

  if (session.username !== username) {
    return (
      <Navigate
        to={`/${encodeURIComponent(session.username)}`}
        replace
      />
    );
  }

  return children;
}

export default RequireDriver;
