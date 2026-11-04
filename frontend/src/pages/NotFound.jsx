import { Link } from "react-router-dom";

import Icon from "../components/common/Icon";
import { usePageTitle } from "../hooks/usePageTitle";

function NotFound() {
  usePageTitle("Page not found");

  return (
    <div className="cv-center-page">
      <div className="cv-card cv-message-card">
        <div className="cv-overlay-icon">
          <Icon name="road" size={30} />
        </div>

        <h1>Page not found</h1>

        <p>This address doesn't match any page.</p>

        <Link to="/" className="cv-button">
          Go to the start page
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
