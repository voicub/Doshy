"use client";
import { useMemo, useState } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { useKnobs, useQuality } from "@/lib/quality";
import { sceneBridge } from "@/lib/snapshotBridge";
import { defaultCaption, fileName } from "@/lib/snapshotName";
import { DEFAULT_SNAPSHOT_SCALE, isConstrained, maxSide, pixelBudget, planSnapshotSize, SNAPSHOT_SCALES, type SnapshotScale } from "@/lib/snapshotSize";
import { useVp } from "@/lib/useVp";
import { saveBlob } from "./saveBlob";
import { captureSnapshot, liveScene, readGlLimits, viewSize } from "./snapshotCapture";
import "./snapshot.css";

const SCALE_NAME: Record<SnapshotScale, string> = { 1: "As on screen", 2: "Sharp", 4: "Poster" };
/** Long enough for the browser to paint the hidden dialog before the picture takes the processor for a moment. */
const HIDE_DIALOG_MS = 60;
const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
const px = (w: number, h: number): string => `${w.toLocaleString("en-US")} × ${h.toLocaleString("en-US")} px`;

type Status = { ok: boolean; text: string };

/** The graphics chip's facts and the view's size, read once when the page opens (null while there is no 3D view). */
function useSceneFacts() {
  return useMemo(() => {
    const state = sceneBridge.get?.();
    return state ? { limits: readGlLimits(state), view: viewSize(state) } : null;
  }, []);
}

/** Share > Take a picture: a PNG of the 3D view at 1x, 2x or 4x the screen size, optionally on a transparent background and with a caption. */
export default function SnapshotPage() {
  const facts = useSceneFacts();
  const tier = useQuality((s) => s.tier);
  const fx = useKnobs().fx;
  const { vp, kiosk } = useVp();
  const planName = useActivePlan((s) => s.list?.find((x) => x.id === s.id)?.name ?? "");
  const constrained = isConstrained({ tier, vp, kiosk });
  const budget = pixelBudget(constrained, fx);
  const [scale, setScale] = useState<SnapshotScale>(DEFAULT_SNAPSHOT_SCALE);
  const [transparent, setTransparent] = useState(false);
  const [captionOn, setCaptionOn] = useState(false);
  const [captionText, setCaptionText] = useState<string | null>(null); // null = the default, which follows the plan's name
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const sizes = facts && SNAPSHOT_SCALES.map((s) => ({ scale: s, size: planSnapshotSize(facts.view, s, facts.limits, budget) }));
  const chosen = sizes?.find((s) => s.scale === scale)?.size;
  const caption = captionText ?? defaultCaption(planName);

  async function take() {
    setBusy(true);
    setStatus(null);
    const root = document.documentElement;
    root.setAttribute("data-snapping", "");
    try {
      await new Promise((r) => setTimeout(r, HIDE_DIALOG_MS));
      const state = liveScene();
      const size = planSnapshotSize(viewSize(state), scale, readGlLimits(state), budget);
      const text = captionOn ? caption.trim() : "";
      const shot = await captureSnapshot({ size, transparent, caption: text || null });
      const name = fileName(planName, new Date(), `${shot.width}x${shot.height}${transparent ? "-clear" : ""}`, "png");
      saveBlob(shot.blob, name);
      setStatus({ ok: true, text: `Saved ${name}: ${px(shot.width, shot.height)}, ${megabytes(shot.blob.size)}.` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "The picture could not be made." });
    } finally {
      root.removeAttribute("data-snapping");
      setBusy(false);
    }
  }

  if (!facts) return <p className="snp-note warn">The 3D view is not on screen, so there is nothing to take a picture of.</p>;
  return (
    <>
      <section className="shr-section">
        <h3 className="snp-h">Picture size</h3>
        <div className="snp-sizes" role="radiogroup" aria-label="Picture size">
          {sizes?.map(({ scale: s, size }) => (
            <button key={s} type="button" role="radio" aria-checked={s === scale} className="snp-size" onClick={() => setScale(s)}>
              <b>{SCALE_NAME[s]}</b>
              <span>{px(size.width, size.height)}</span>
              {size.clamped && <small>Reduced</small>}
            </button>
          ))}
        </div>
        {chosen?.clamped && (
          <p className="snp-note">
            <b>Made smaller than {scale}×:</b> {chosen.limit === "gpu" ? "this graphics chip cannot draw a bigger picture." : "a bigger picture would use more graphics memory than is safe on this device."}
          </p>
        )}
        {constrained && <p className="snp-note warn">Small screens and the Eco and Light graphics settings have little memory to spare. Big pictures can freeze the page for a moment or fail: 1× or 2× is the safe choice here.</p>}
      </section>

      <section className="shr-section">
        <label className="snp-check">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
          <span>
            Transparent background
            <small>The home on see-through ground, without the floor and the backdrop colour. Corner shading, glow and light rays are drawn without their finishing effects.</small>
          </span>
        </label>
        <label className="snp-check">
          <input type="checkbox" checked={captionOn} onChange={(e) => setCaptionOn(e.target.checked)} />
          <span>
            Add a caption
            <small>A small label in the lower left corner. Off unless you turn it on.</small>
          </span>
        </label>
        {captionOn && (
          <label className="snp-field">
            <span className="sr-only">Caption text</span>
            <input type="text" value={caption} maxLength={80} onChange={(e) => setCaptionText(e.target.value)} />
          </label>
        )}
      </section>

      <details className="shr-adv">
        <summary>Details</summary>
        <ul className="snp-facts">
          <li>The view is {px(facts.view.width, facts.view.height)} on screen.</li>
          <li>Largest picture this graphics chip draws: {maxSide(facts.limits).toLocaleString("en-US")} px on a side.</li>
          <li>Memory limit used here: {(budget / 1e6).toFixed(1)} million pixels in all.</li>
          <li>Only the 3D view is in the picture, never the buttons or panels. Selection outlines and notes drawn in 3D are: click an empty spot first.</li>
        </ul>
      </details>

      <div className="shr-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={take}>
          {busy ? "Taking the picture..." : "Save picture"}
        </button>
      </div>
      {status && (
        <p className={`snp-status ${status.ok ? "" : "error"}`} role="status">
          {status.text}
        </p>
      )}
    </>
  );
}
