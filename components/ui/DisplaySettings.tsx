"use client";
import { MonitorIcon } from "@phosphor-icons/react";
import { openDisplaySettings } from "./displayUi";
import "./displayPanel.css";

/** A menu row that opens the Display settings (layout, interface size, full screen, keep screen on, screensaver). The sheet is mounted by `DisplayHost`. */
export default function DisplaySettings() {
  return (
    <button type="button" className="more-row" onClick={openDisplaySettings}>
      <MonitorIcon size={20} aria-hidden />
      <span className="more-row-text">
        <span className="more-row-title">Display</span>
        <small className="more-row-sub">Layout, size, full screen, screensaver</small>
      </span>
    </button>
  );
}
