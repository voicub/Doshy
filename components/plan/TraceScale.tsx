"use client";
import { RulerIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { Trace } from "@/lib/designTypes";
import { calibrate, imageWidthM, straighten } from "@/lib/traceGeom";
import { lenText, parseDistance } from "@/lib/traceDistance";
import MonoLabel from "../ui/MonoLabel";
import { Block } from "../ui/SiteBits";
import { putTrace } from "./traceEdit";
import { calibHint, useTraceUi } from "./traceUi";

/** "Set the scale": click two points on the picture, type the real distance between them, and the picture is resized to match (the first point stays put). */
export default function TraceScale({ t }: { t: Trace }) {
  const calib = useTraceUi((s) => s.calib);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!calib) setText(""); // done or cancelled (also by Esc, in TraceLayer): the next round starts empty
  }, [calib]);
  const stop = () => useTraceUi.getState().stopCalib();

  const width = `Image is now ${lenText(imageWidthM(t))} wide`;
  if (!calib) {
    return (
      <Block title="Real size" name="size">
        <p className="sp-status">{width}<small>{t.scale.toPrecision(3)} m per pixel</small></p>
        <p className="hint">Pictures rarely come at the right size. Click two points on it that you know the distance between and Doshy sets the size for you.</p>
        <button type="button" className="btn sp-wide primary" onClick={() => { useStore.getState().setTool("select"); /* a measuring or notes tool would catch the clicks first */ useTraceUi.getState().startCalib(); }}><RulerIcon size={16} aria-hidden /> Set the scale</button>
      </Block>
    );
  }

  const { a, b } = calib;
  const metres = parseDistance(text);
  const next = a && b && metres !== null ? calibrate(t, a, b, metres) : null;
  const problem = text.trim() && metres === null ? "Type a length such as 4.2, 4,2, 4.2 m or 420 cm." : metres !== null && a && b && !next ? "That would make the picture far too big or too small. Check the length." : null;
  const apply = () => {
    if (!next) return;
    putTrace(next);
    stop();
  };
  return (
    <Block title="Set the scale" name="size">
      <p className="hint" role="status">{calibHint(calib)}</p>
      {a && b && (
        <>
          <label className="field">
            <MonoLabel>How long is it really?</MonoLabel>
            <input inputMode="decimal" enterKeyHint="done" placeholder="4.20 m" value={text} aria-invalid={!!problem} aria-describedby={problem ? "tr-len-err" : undefined} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} autoFocus />
          </label>
          {problem && <p id="tr-len-err" className="field-note warn" role="alert">{problem}</p>}
          {next && <p className="sp-status" role="status">Image will be {lenText(imageWidthM(next))} wide<small>{next.scale.toPrecision(3)} m per pixel</small></p>}
          <button type="button" className="btn sp-wide primary" disabled={!next} onClick={apply}>Set the scale</button>
          <button type="button" className="btn sp-wide" onClick={() => { const s = straighten(t, a, b); if (s) putTrace(s); }}>Straighten along these two points</button>
          <p className="field-note">Straighten turns the picture so the line between the two points runs level (or upright, whichever is closer).</p>
        </>
      )}
      <button type="button" className="btn sp-wide" onClick={stop}>Cancel (Esc)</button>
    </Block>
  );
}
