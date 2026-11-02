import { Component } from "react";

class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[App] Unexpected error:", error);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div className="cv-center-page">
        <div className="cv-card cv-message-card">
          <h1>Something went wrong</h1>

          <p>Reload the page to get back to your dashboard.</p>

          <button
            type="button"
            className="cv-button"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
