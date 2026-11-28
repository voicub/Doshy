"use client";
import { useEffect } from "react";
import { useRecordingUi } from "./recordingUi";
import "./snapshot.css";

const RESULT_SHOWN_MS = 8000;

/**
 * The small bar at the bottom of the screen while a turntable video records (the Share dialog is closed and the HUD hidden by then), and afterwards what came of it.
 * Escape or Cancel stops the recording. A transparent shield over the view keeps a stray touch from moving the camera that is being recorded.
 */
export default function SnapshotProgress() {
  const phase = useRecordingUi((s) => s.phase);
  const progress = useRecordingUi((s) => s.progress);
  const seconds = useRecordingUi((s) => s.seconds);
  const message = useRecordingUi((s) => s.message);
  const cancel = useRecordingUi((s) => s.cancel);
  const dismiss = useRecordingUi((s) => s.dismiss);
  const recording = phase === "recording";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (recording) cancel?.();
      else dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [recording, cancel, dismiss]);

  // a saved-file note goes away by itself; a failure stays until it was read
  useEffect(() => {
    if (phase !== "done") return undefined;
    const t = window.setTimeout(dismiss, RESULT_SHOWN_MS);
    return () => window.clearTimeout(t);
  }, [phase, dismiss]);

  return (
    <>
      {recording && <div className="snp-shield" aria-hidden />}
      <div className={`snp ${phase}`} role="status" aria-live="polite">
        {recording ? (
          <>
            <div className="snp-row">
              <span className="snp-dot" aria-hidden />
              <span className="snp-title">Recording {Math.min(seconds, Math.round(progress * seconds))} of {seconds} s</span>
              <button type="button" className="btn" onClick={() => cancel?.()}>
                Cancel
              </button>
            </div>
            <div className="snp-bar" role="progressbar" aria-label="Recording progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <i style={{ transform: `scaleX(${progress})` }} />
            </div>
          </>
        ) : (
          <div className="snp-row">
            <p className="snp-msg">{message}</p>
            <button type="button" className="btn" onClick={dismiss}>
              OK
            </button>
          </div>
        )}
      </div>
    </>
  );
}
