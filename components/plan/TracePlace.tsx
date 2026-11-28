"use client";
import { ArrowArcLeftIcon, ArrowArcRightIcon, CornersOutIcon, CrosshairIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { Trace } from "@/lib/designTypes";
import { SCALE_RANGE, turnOf } from "@/lib/trace";
import { fitToView, imageWidthM, turnedBy, withImageWidth } from "@/lib/traceGeom";
import MonoLabel from "../ui/MonoLabel";
import NumField from "../ui/NumField";
import { Block } from "../ui/SiteBits";
import { putTrace } from "./traceEdit";
import { traceView } from "./traceUi";

const SPOT = 1000; // x and y can be typed up to this many metres from the plan's origin (the stored limit)

/** Metres per pixel as a plain text box: NumField shows three decimals, and this number is often 0.005. */
function PerPixel({ t }: { t: Trace }) {
  const shown = String(Number(t.scale.toPrecision(4)));
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]); // undo, a drag or a new scale changes it from outside
  const commit = () => {
    const v = Number(text.trim().replace(",", "."));
    if (Number.isFinite(v) && v >= SCALE_RANGE.min && v <= SCALE_RANGE.max) putTrace({ ...t, scale: v });
    else setText(shown);
  };
  return (
    <label className="field">
      <MonoLabel>Metres per pixel</MonoLabel>
      <input inputMode="decimal" enterKeyHint="done" value={text} aria-invalid={!(Number(text.replace(",", ".")) >= SCALE_RANGE.min)} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </label>
  );
}

/** Where it sits: fit it to the view, turn it a quarter, and exact numbers for people who want them. */
export default function TracePlace({ t }: { t: Trace }) {
  /** The view is read when the button is pressed (it is where the plan is looking now), not when the panel last drew. */
  const fit = (resize: boolean) => {
    const view = traceView.rect;
    if (view) putTrace(fitToView(t, view, resize));
  };
  return (
    <Block title="Where it sits" name="place">
      <div className="tr-two">
        <button type="button" className="btn" title="Makes the picture as big as the screen shows. This changes its size, so set the scale afterwards." onClick={() => fit(true)}><CornersOutIcon size={16} aria-hidden /> Fill the screen</button>
        <button type="button" className="btn" onClick={() => fit(false)}><CrosshairIcon size={16} aria-hidden /> Centre it</button>
        <button type="button" className="btn" onClick={() => putTrace(turnedBy(t, -90))}><ArrowArcLeftIcon size={16} aria-hidden /> Turn left 90°</button>
        <button type="button" className="btn" onClick={() => putTrace(turnedBy(t, 90))}><ArrowArcRightIcon size={16} aria-hidden /> Turn right 90°</button>
      </div>
      <details className="sp-adv">
        <summary>Advanced: exact numbers</summary>
        <div className="sp-adv-grid">
          <NumField label="Centre, east" unit="m" value={t.x} min={-SPOT} max={SPOT} step={0.1} live={false} onChange={(x) => putTrace({ ...t, x })} />
          <NumField label="Centre, south" unit="m" value={t.y} min={-SPOT} max={SPOT} step={0.1} live={false} onChange={(y) => putTrace({ ...t, y })} />
          <NumField label="Image width" unit="m" value={imageWidthM(t)} min={0.1} max={500} step={0.1} live={false} onChange={(w) => { const next = withImageWidth(t, w); if (next) putTrace(next); }} />
          <PerPixel t={t} />
          <NumField label="Turn" unit="deg" value={t.rotation} min={-180} max={180} step={0.1} live={false} onChange={(r) => putTrace({ ...t, rotation: turnOf(Math.round(r * 10) / 10) })} />
        </div>
        <p className="field-note">The plan's top is up. Turn is clockwise; the arrows nudge it by 0.1 degree.</p>
      </details>
    </Block>
  );
}
