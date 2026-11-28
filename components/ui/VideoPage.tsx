"use client";
import { useMemo, useState } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { useQuality } from "@/lib/quality";
import { sceneBridge } from "@/lib/snapshotBridge";
import { fileName } from "@/lib/snapshotName";
import { isConstrained, planSnapshotSize } from "@/lib/snapshotSize";
import { clampSeconds, pickVideoFormat, VIDEO_FPS, VIDEO_PIXEL_BUDGET, VIDEO_SECONDS, VIDEO_SECONDS_WEAK } from "@/lib/snapshotVideo";
import { useVp } from "@/lib/useVp";
import type { SharePageProps } from "./sharePages";
import { readGlLimits, viewSize } from "./snapshotCapture";
import { canRecord, runTurntable } from "./turntableRecord";
import "./snapshot.css";

/** The video format this browser records (null = none) and how big the clip's frames will be. Read once when the page opens. */
function useVideoFacts() {
  return useMemo(() => {
    const format = canRecord() ? pickVideoFormat((m) => MediaRecorder.isTypeSupported(m)) : null;
    const state = sceneBridge.get?.();
    const frame = state ? planSnapshotSize(viewSize(state), state.gl.getPixelRatio(), readGlLimits(state), VIDEO_PIXEL_BUDGET) : null;
    return { format, frame };
  }, []);
}

/** Share > Record a turntable video: one slow turn round the home, saved as a video file. The dialog closes while it records (SnapshotProgress shows the progress). */
export default function VideoPage({ onClose }: SharePageProps) {
  const { format, frame } = useVideoFacts();
  const tier = useQuality((s) => s.tier);
  const { vp, kiosk } = useVp();
  const planName = useActivePlan((s) => s.list?.find((x) => x.id === s.id)?.name ?? "");
  const weak = isConstrained({ tier, vp, kiosk });
  const [seconds, setSeconds] = useState(weak ? VIDEO_SECONDS_WEAK : VIDEO_SECONDS.default);
  const [ease, setEase] = useState(false);

  if (!format) {
    return (
      <p className="snp-note warn">
        This browser cannot record video from the 3D view. Chrome, Edge, Firefox and Safari can: open Doshy there, or take a picture instead.
      </p>
    );
  }
  if (!frame) return <p className="snp-note warn">The 3D view is not on screen, so there is nothing to record.</p>;

  const start = () => {
    const fileLength = clampSeconds(seconds);
    const name = fileName(planName, new Date(), `${fileLength}s`, format.ext);
    onClose();
    void runTurntable({ seconds: fileLength, ease, format, fileName: name });
  };

  return (
    <>
      <section className="shr-section">
        <label className="snp-field">
          <span className="snp-range">
            Length
            <output>{seconds} seconds</output>
          </span>
          <input type="range" min={VIDEO_SECONDS.min} max={VIDEO_SECONDS.max} step={1} value={seconds} onChange={(e) => setSeconds(clampSeconds(Number(e.target.value)))} />
        </label>
        <p className="snp-note">
          One full turn round the home, saved as a {format.label} video ({frame.width.toLocaleString("en-US")} × {frame.height.toLocaleString("en-US")} px, {VIDEO_FPS} frames a second). The buttons and panels are hidden while it records.
        </p>
        {weak && (
          <p className="snp-note warn">
            Recording is heavy on small screens and on the Eco and Light graphics settings, and the clip can come out choppy. A short clip ({VIDEO_SECONDS_WEAK} seconds) is the safest choice here.
          </p>
        )}
        <p className="snp-note">Keep this tab in front while it records: browsers pause drawing in a background tab, and the recording stops. Press Esc or Cancel to stop early.</p>
      </section>

      <details className="shr-adv">
        <summary>More options</summary>
        <label className="snp-check">
          <input type="checkbox" checked={ease} onChange={(e) => setEase(e.target.checked)} />
          <span>
            Start and stop gently
            <small>The spin speeds up at the start and slows down at the end. Off keeps one steady speed, which also repeats without a jump when the video is looped.</small>
          </span>
        </label>
      </details>

      <div className="shr-actions">
        <button type="button" className="btn primary" onClick={start}>
          Start recording
        </button>
      </div>
    </>
  );
}
