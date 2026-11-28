"use client";
import { XIcon } from "@phosphor-icons/react";
import { applyUpdate, useWorkerUi } from "@/lib/offlineWorker";
import "./offline.css";

/** "A new version is ready: Reload". Shown when an updated offline worker is waiting; Reload makes it take over and reloads the page once. Dismissing keeps the old version until the app is closed. */
export default function UpdateToast() {
  const waiting = useWorkerUi((s) => s.waiting);
  if (!waiting) return null;
  return (
    <div className="ofl-toast hud" role="status" aria-live="polite">
      <i className="ofl-dot ready" aria-hidden />
      <span>A new version is ready.</span>
      <button type="button" className="btn primary" onClick={applyUpdate}>Reload</button>
      <button type="button" className="icon-btn ofl-x" aria-label="Dismiss" onClick={() => useWorkerUi.setState({ waiting: null })}><XIcon size={14} /></button>
    </div>
  );
}
