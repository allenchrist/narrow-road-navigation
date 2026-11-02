import { Link } from "react-router-dom";

function NotFound() {
  return (
    <div className="cv-center-page">
      <div className="cv-card cv-message-card">
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
