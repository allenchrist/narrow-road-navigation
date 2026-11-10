import { useState } from "react";

import Icon from "./Icon";

// A password box with a button to show what's been typed
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  close,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className={`cv-field${close ? " cv-field--close" : ""}`}>
      <span>{label}</span>

      <div className="cv-password">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />

        <button
          type="button"
          onClick={() => setVisible((previous) => !previous)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <Icon name={visible ? "visibilityOff" : "visibility"} size={20} />
        </button>
      </div>
    </label>
  );
}

export default PasswordField;
