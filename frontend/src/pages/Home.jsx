import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Icon from "../components/common/Icon";

function Home() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");

  function openDashboard(event) {
    event.preventDefault();

    const trimmed = username.trim();

    if (trimmed) {
      navigate(`/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <div className="cv-center-page">
      <form
        className="cv-card cv-message-card"
        onSubmit={openDashboard}
      >
        <div className="cv-brand-mark cv-brand-mark--large">
          <Icon name="car" size={32} />
        </div>

        <h1>Connected Vehicle</h1>

        <p>
          Safer passage through narrow roads. Enter the
          username from your phone app to open your car
          screen.
        </p>

        <label className="cv-field">
          <span>Username</span>

          <input
            type="text"
            value={username}
            onChange={(event) =>
              setUsername(event.target.value)
            }
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoFocus
          />
        </label>

        <button
          type="submit"
          className="cv-button"
          disabled={!username.trim()}
        >
          Open dashboard
        </button>
      </form>
    </div>
  );
}

export default Home;
