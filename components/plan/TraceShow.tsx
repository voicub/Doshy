"use client";
import { useRef, useState } from "react";
import type { Trace } from "@/lib/designTypes";
import { useStore } from "@/lib/store";
import { OPACITY_RANGE } from "@/lib/trace";
import MonoLabel from "../ui/MonoLabel";
import { Block, Switch } from "../ui/SiteBits";
import { putTrace } from "./traceEdit";
import { useTraceUi } from "./traceUi";

/** A slider drag is one undo step: `beginEdit` when it is grabbed, `endEdit` when it is let go (however it ends). Keyboard steps are a step each. */
function useDragStep() {
  const open = useRef(false);
  const end = () => {
    if (!open.current) return;
    open.current = false;
    useStore.getState().endEdit();
  };
  return {
    onPointerDown: () => {
      if (open.current) return;
      open.current = true;
      useStore.getState().beginEdit();
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onBlur: end,
  };
}

/** How it shows (opacity, hidden, locked) and taking it away. */
export default function TraceShow({ t }: { t: Trace }) {
  const slider = useDragStep();
  const [asking, setAsking] = useState(false);
  const pct = Math.round(t.opacity * 100);
  const remove = () => {
    const ui = useTraceUi.getState();
    ui.clearSuggestions();
    ui.stopCalib();
    putTrace(null);
  };
  return (
    <Block title="How it shows" name="show">
      <label className="field">
        <MonoLabel>Picture strength {pct}%</MonoLabel>
        <input type="range" min={Math.round(OPACITY_RANGE.min * 100)} max={Math.round(OPACITY_RANGE.max * 100)} step={5} value={pct} aria-label="Picture strength under the plan" onChange={(e) => putTrace({ ...t, opacity: +e.target.value / 100 })} {...slider} />
      </label>
      <Switch on={!t.hidden} label="Show the picture" onChange={(on) => { const { hidden: _was, ...rest } = t; putTrace(on ? rest : { ...rest, hidden: true }); }} />
      <Switch on={t.locked} label="Lock it in place" onChange={(locked) => putTrace({ ...t, locked })} />
      <p className="field-note">{t.locked ? "Locked: it cannot be moved by accident, and walls can be drawn over it." : "Unlocked: drag the picture to move it, a corner to resize it, the round knob to turn it. Lock it to draw over it."}</p>
      {asking ? (
        <div className="tr-confirm" role="alert">
          <p className="hint">Remove the picture from this plan? The file stays stored on the server (other plans may use it). Undo brings it back.</p>
          <div className="tr-two">
            <button type="button" className="btn" onClick={remove}>Yes, remove it</button>
            <button type="button" className="btn" onClick={() => setAsking(false)}>Keep it</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn sp-wide" onClick={() => setAsking(true)}>Remove the picture</button>
      )}
    </Block>
  );
}
