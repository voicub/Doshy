"use client";
import { useId, useState } from "react";
import { PolyHavenBrowser } from "@/components/lazyPanels";
import { useLighting } from "@/lib/lightingStore";
import { hdriResFor, PH_SITE, type PhItem } from "@/lib/polyhaven";
import { INTENSITY_RANGE, lightingCredit, ROTATION_RANGE, sanitizeHdri } from "@/lib/polyhavenEnv";
import { downloadAsset, keepAsResource, thumbSrc } from "@/lib/polyhavenClient";
import { knobsOf, TIER_LABEL, useQuality } from "@/lib/quality";
import { useStore } from "@/lib/store";
import "./hdriPicker.css";

const NEEDS_TIER = `Real sky needs ${TIER_LABEL.medium} or higher; your current setting keeps the built-in light.`;

/** Graphics panel: the light of the 3D view comes from the built-in sky or from a real one (a free Poly Haven picture, kept on this server so it keeps working offline). */
export default function HdriPicker() {
  const hdri = useLighting((s) => s.hdri);
  const status = useLighting((s) => s.status);
  const setHdri = useLighting((s) => s.setHdri);
  const patch = useLighting((s) => s.patchHdri);
  const tier = useQuality((s) => s.tier);
  const studio = useStore((s) => s.environment) === "studio";
  const [browsing, setBrowsing] = useState(false);
  const id = useId();
  const available = knobsOf(tier).ibl; // image based light is drawn from Balanced up
  const res = hdriResFor(tier) ?? "1k";

  const pick = async (item: PhItem) => {
    const bytes = await downloadAsset("hdri", item.id, res);
    const resourceId = await keepAsResource("hdri", item, bytes);
    // a new picture keeps the owner's sliders and ticks; its sun is looked for again
    const next = sanitizeHdri({ ...hdri, resourceId, assetId: item.id, name: item.name, authors: item.authors, credit: lightingCredit(item.name), res, sun: undefined });
    if (!next) throw new Error("That lighting picture could not be kept.");
    setHdri(next);
    setBrowsing(false);
  };

  const tick = (key: "background" | "matchSun" | "alsoLive", label: string, about?: string) => (
    <label className="hp-tick">
      <input type="checkbox" checked={hdri?.[key] ?? false} onChange={(e) => patch({ [key]: e.target.checked })} />
      <span>
        {label}
        {about && <small>{about}</small>}
      </span>
    </label>
  );

  return (
    <div className="gp-list hp" role="group" aria-labelledby={`${id}-t`}>
      <div className="gp-legend gp-legend-vis" id={`${id}-t`}>
        Lighting<small>{hdri ? "now a real sky" : "now the default"}</small>
      </div>
      <div className="gp-list gp-row">
        <label className="gp-opt">
          <input type="radio" name="graphics-lighting" checked={hdri === null} onChange={() => setHdri(null)} />
          <span className="gp-box"><span className="gp-name">Default</span></span>
        </label>
        <label className="gp-opt">
          <input type="radio" name="graphics-lighting" checked={hdri !== null} disabled={!available} onChange={() => setBrowsing(true)} />
          <span className="gp-box"><span className="gp-name">Real sky...</span></span>
        </label>
      </div>
      {!available && <p className="hint hp-tier">{NEEDS_TIER}</p>}
      {!hdri && available && <p className="hint">Light the building with a real sky photographed outdoors or in a studio. It changes the soft light and the reflections. Free pictures from Poly Haven.</p>}
      {hdri && (
        <div className="hp-now">
          <div className="hp-head">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small preview from our own server, no optimiser needed */}
            <img className="hp-thumb" src={thumbSrc({ id: hdri.assetId }, 128)} alt="" width={96} height={48} loading="lazy" />
            <div className="hp-name">
              <b>{hdri.name}</b>
              <span>{hdri.credit}</span>
            </div>
          </div>
          {status.state === "loading" && <p className="hint" role="status">Loading the sky...</p>}
          {status.state === "failed" && <p className="hint hp-bad" role="alert">{status.message} The built-in light is used until it works.</p>}
          <div className="hp-buttons">
            <button type="button" className="btn" disabled={!available} onClick={() => setBrowsing(true)}>Change...</button>
            <button type="button" className="btn" onClick={() => setHdri(null)}>Back to the default</button>
          </div>
          {tick("background", "Show the sky behind the building", studio ? undefined : "Shown in the Studio view; switch Environment to Studio to see it.")}
          {tick("matchSun", "Match the sun", "Turns the sky so its sun stands where the sun is now.")}
          {hdri.matchSun && hdri.sun === null && <p className="hint">No clear sun was found in this picture, so this changes nothing. Cloudy skies and plain studio lights have none.</p>}
          {tick("alsoLive", "Also use in Live for reflections (static)", "Dimmed by daylight so night stays dark. The Live view keeps its own sun, weather and sky.")}
          <details className="hp-more">
            <summary>More</summary>
            <Slider label="Brightness" value={hdri.intensity} min={INTENSITY_RANGE.min} max={INTENSITY_RANGE.max} step={0.05} show={`${Math.round(hdri.intensity * 100)}%`} onChange={(intensity) => patch({ intensity })} />
            <Slider label="Turn the sky" value={hdri.rotation} min={ROTATION_RANGE.min} max={ROTATION_RANGE.max} step={5} show={`${Math.round(hdri.rotation)}°`} onChange={(rotation) => patch({ rotation })} />
          </details>
          <p className="hp-credit">
            {hdri.credit} · <a href={`${PH_SITE}/a/${encodeURIComponent(hdri.assetId)}`} target="_blank" rel="noreferrer noopener">Poly Haven</a>
          </p>
        </div>
      )}
      {browsing && (
        <PolyHavenBrowser
          type="hdris"
          title="Choose a real sky"
          initialFilter="outdoor"
          pickLabel="Use this lighting"
          onPick={pick}
          onClose={() => setBrowsing(false)}
          detail={() => ({ text: res === "2k" ? "Downloads a large 2k picture (about 6 MB) once and keeps it on this server." : "Downloads a 1k picture (about 2 MB) once and keeps it on this server." })}
        />
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <label className="hp-slider">
      <span>{label}<b>{show}</b></span>
      <input type="range" className="rng" min={min} max={max} step={step} value={value} aria-valuetext={show} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
