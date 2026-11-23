"use client";
import { openDisplaySettings } from "./displayUi";
import "./displayPanel.css";

/** One line for small screens, to put at the foot of a settings list: points to the Display settings. */
export default function DisplayHint() {
  return (
    <p className="hint dp-hint">
      Running on a small screen?{" "}
      <button type="button" className="dp-link" onClick={openDisplaySettings}>
        Open Display settings
      </button>
    </p>
  );
}
