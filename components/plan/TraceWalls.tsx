"use client";
import { PencilSimpleLineIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Trace } from "@/lib/designTypes";
import { useStore } from "@/lib/store";
import type { Sensitivity } from "@/lib/traceDetect";
import { useVp } from "@/lib/useVp";
import { Block } from "../ui/SiteBits";
import { acceptSuggestions } from "./traceAccept";
import { detectInPicture } from "./traceDetectRun";
import { useTraceUi } from "./traceUi";

const CHOICES: { value: Sensitivity; label: string }[] = [
  { value: "few", label: "Few lines" },
  { value: "normal", label: "Normal" },
  { value: "many", label: "Many lines" },
];

type Run = { busy: boolean; progress: number; note: string | null };

/** Looks for walls in the picture, in slices so the screen keeps working; cancelled when the panel goes away. */
function useDetect(t: Trace) {
  const [run, setRun] = useState<Run>({ busy: false, progress: 0, note: null });
  const control = useRef<AbortController | null>(null);
  useEffect(() => () => control.current?.abort(), []);
  const start = async () => {
    control.current?.abort();
    const mine = new AbortController();
    control.current = mine;
    setRun({ busy: true, progress: 0, note: null });
    const ui = useTraceUi.getState();
    const got = await detectInPicture(t.resourceId, ui.sensitivity, mine.signal, (progress) => !mine.signal.aborted && setRun((r) => ({ ...r, progress })));
    if (mine.signal.aborted) return;
    if (!got.ok) return setRun({ busy: false, progress: 0, note: got.message });
    ui.setSuggestions(t.resourceId, got.segs);
    setRun({ busy: false, progress: 1, note: got.segs.length ? null : "No walls found. Try \"Many lines\", or trace by hand with the Wall tool." });
  };
  const cancel = () => {
    control.current?.abort();
    setRun({ busy: false, progress: 0, note: null });
  };
  return { run, start, cancel };
}

/** "Trace walls": the Wall tool over the picture, with its snapping to the suggestions; and "Look for walls", which suggests straight walls to accept or discard. */
export default function TraceWalls({ t, onClose }: { t: Trace; onClose: () => void }) {
  const compact = useVp().vp !== "regular";
  const { run, start, cancel } = useDetect(t);
  const count = useTraceUi((s) => (s.suggestionsFor === t.resourceId ? s.suggestions.length : 0));
  const sensitivity = useTraceUi((s) => s.sensitivity);
  const setSensitivity = useTraceUi((s) => s.setSensitivity);
  const [added, setAdded] = useState<number | null>(null);
  return (
    <Block title="Trace the walls" name="walls">
      <button type="button" className="btn sp-wide primary" onClick={() => { useStore.getState().setTool("wall"); if (compact) onClose(); }}>
        <PencilSimpleLineIcon size={16} aria-hidden /> Trace walls
      </button>
      <p className="hint">Switches to the Wall tool with the picture visible.{count ? " Wall ends snap to the suggestions." : ""} Lock the picture first so it cannot move while you draw.</p>

      <div className="tr-seg" role="group" aria-label="How many lines to look for">
        {CHOICES.map((c) => (
          <button key={c.value} type="button" aria-pressed={sensitivity === c.value} disabled={run.busy} onClick={() => setSensitivity(c.value)}>{c.label}</button>
        ))}
      </div>
      {run.busy ? (
        <>
          <p className="sp-status" role="status">Looking for walls... {Math.round(run.progress * 100)}%</p>
          <button type="button" className="btn sp-wide" onClick={cancel}>Cancel</button>
        </>
      ) : (
        <button type="button" className="btn sp-wide" onClick={() => { setAdded(null); void start(); }}>Look for walls</button>
      )}
      {run.note && <p className="field-note" role="status">{run.note}</p>}
      {added !== null && !count && <p className="field-note ok" role="status">{added} {added === 1 ? "wall" : "walls"} added. Undo takes them all back at once.</p>}

      {count > 0 && (
        <>
          <p className="sp-status" role="status">Suggestions: check them<small>{count} dashed {count === 1 ? "wall" : "walls"} on the plan. Tap one to add or discard it.</small></p>
          <button type="button" className="btn sp-wide primary" onClick={() => setAdded(acceptSuggestions())}>Accept all ({count})</button>
          <button type="button" className="btn sp-wide" onClick={() => useTraceUi.getState().clearSuggestions()}>Clear suggestions</button>
        </>
      )}
      <p className="field-note">Only straight horizontal and vertical walls are found, from dark lines on a light page. Nothing is added until you accept it.</p>
    </Block>
  );
}
