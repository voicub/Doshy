"use client";
import { XIcon } from "@phosphor-icons/react";
import { dismissSceneRun, restorePrevious, useSceneRun } from "./scenesRun";
import "./sceneToast.css";

/** What the last scene did, at the bottom of the screen: running, done, or which devices did not answer, with "Restore previous" to put things back as they were. */
export default function SceneToast() {
  const run = useSceneRun((s) => s.run);
  if (!run) return null;
  const bad = run.phase === "failed" || run.phase === "partial";
  const what = run.command ? run.name : `"${run.name}"`;
  const title = run.restored ? `Restored what ${what} changed` : run.phase === "running" ? (run.restoring ? "Putting things back..." : `Running ${what}...`) : run.phase === "done" ? (run.command ? `Done: ${run.name}` : `${what} is on`) : run.phase === "partial" ? `${what} ran, but some devices did not answer` : `${what} did not run`;
  return (
    <div className={`scn-toast hud ${bad ? "warn" : ""}`} role={bad ? "alert" : "status"} data-phase={run.phase} aria-live="polite">
      <i className="scn-dot" aria-hidden />
      <div className="scn-toast-text">
        <b>{title}</b>
        {run.problems.slice(0, 4).map((p) => <small key={p}>{p}</small>)}
        {run.problems.length > 4 && <small>{`and ${run.problems.length - 4} more`}</small>}
      </div>
      {run.phase !== "running" && !run.restored && Object.keys(run.before).length > 0 && <button type="button" className="btn primary" onClick={() => void restorePrevious()}>Restore previous</button>}
      <button type="button" className="icon-btn scn-x" aria-label="Dismiss" onClick={dismissSceneRun}><XIcon size={14} /></button>
    </div>
  );
}
