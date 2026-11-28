"use client";
import { memo, useEffect } from "react";
import type { Trace } from "@/lib/designTypes";
import type { Frame } from "@/lib/planView";
import { useStore } from "@/lib/store";
import TraceCalibrate from "./TraceCalibrate";
import TraceHandles from "./TraceHandles";
import TraceSuggestions from "./TraceSuggestions";
import { traceUrl } from "./traceImage";
import { traceView, useTraceUi } from "./traceUi";

/**
 * The floor plan image, drawn under the rooms and walls and above the paper: ONE <image> placed by one transform (centre, turn, metres per pixel), so
 * the picture is never resampled in script. It takes no pointer events, costs nothing in 3D and nothing while hidden. Plan view only (the 3D scene never reads `plan.trace`).
 */
export const TraceUnderlay = memo(function TraceUnderlay({ trace }: { trace: Trace | undefined }) {
  if (!trace || trace.hidden) return null;
  return (
    <image
      href={traceUrl(trace.resourceId)}
      x={-trace.w / 2}
      y={-trace.h / 2}
      width={trace.w}
      height={trace.h}
      preserveAspectRatio="none"
      transform={`translate(${trace.x} ${trace.y}) rotate(${trace.rotation}) scale(${trace.scale})`}
      opacity={trace.opacity}
      pointerEvents="none"
    />
  );
});

type Props = { vb: Frame; px: number; touch: number; tool: string };

/** What goes on top of the plan for the floor plan image: the wall suggestions, the handles of an unlocked picture while its panel is open, and "set the scale". */
export default function TraceLayer({ vb, px, touch, tool }: Props) {
  const trace = useStore((s) => s.plan.trace);
  const panel = useTraceUi((s) => s.panel);
  const calibrating = useTraceUi((s) => !!s.calib);
  const suggestionsFor = useTraceUi((s) => s.suggestionsFor);
  const id = trace?.resourceId;
  useEffect(() => {
    traceView.rect = vb; // "fit to the view" in the panel reads it
  });
  useEffect(() => {
    // the suggestions and points belong to one picture: another picture, or none, ends them
    const ui = useTraceUi.getState();
    if (suggestionsFor && suggestionsFor !== id) ui.clearSuggestions();
    if (!id) ui.stopCalib();
  }, [id, suggestionsFor]);
  useEffect(() => {
    if (!calibrating) return;
    // Esc leaves "set the scale" and nothing else: this runs before the plan's own keys and the panel's, and swallows it
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      useTraceUi.getState().stopCalib();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [calibrating]);
  if (!trace) return null;
  const handles = panel && !trace.locked && !trace.hidden && tool === "select" && !calibrating;
  return (
    <>
      {suggestionsFor === trace.resourceId && <TraceSuggestions t={trace} tool={tool} px={px} touch={touch} />}
      {handles && <TraceHandles t={trace} px={px} touch={touch} />}
      {calibrating && <TraceCalibrate t={trace} vb={vb} px={px} touch={touch} />}
    </>
  );
}
