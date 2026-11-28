"use client";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useRef, type PointerEvent as RPE } from "react";
import type { Trace } from "@/lib/designTypes";
import { useStore } from "@/lib/store";
import { withTrace } from "@/lib/trace";
import { dragTrace, imageToPlan, traceCorners, type DragMode } from "@/lib/traceGeom";
import type { Pt } from "@/lib/types";
import { PAPER } from "./BlueprintPaper";
import { hitOf } from "./hit";
import { ACCENT } from "./planStyle";
import { svgPoint } from "./traceSvg";

type Drag = { mode: DragMode; pointer: number; from: Pt; t0: Trace };

/**
 * The handles of an unlocked floor plan image: drag the picture to move it, a corner to make it bigger or smaller about its centre, the knob to turn it.
 * Self-contained: its own pointer handlers (pointer capture, so a drag that leaves the shape carries on), one undo step per drag, and a second finger
 * (pinch) ends the drag. Drawn above the walls, so while it shows the picture takes the pointer; lock it to draw over it.
 */
export default function TraceHandles({ t, px, touch }: { t: Trace; px: number; touch: number }) {
  const drag = useRef<Drag | null>(null);
  const finish = () => {
    if (!drag.current) return;
    drag.current = null;
    useStore.getState().endEdit();
  };
  const start = (mode: DragMode) => (e: RPE<SVGElement>) => {
    if (e.button !== 0) return;
    if (drag.current) return finish(); // another finger: that is a pinch
    const from = svgPoint(e);
    if (!from) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    useStore.getState().beginEdit();
    drag.current = { mode, pointer: e.pointerId, from, t0: t };
  };
  const move = (e: RPE<SVGElement>) => {
    const d = drag.current;
    const to = d && d.pointer === e.pointerId ? svgPoint(e) : null;
    if (d && to) useStore.getState().editPlan((p) => withTrace(p, dragTrace(d.t0, d.mode, d.from, to, e.shiftKey)));
  };
  const end = (e: RPE<SVGElement>) => {
    if (drag.current?.pointer === e.pointerId) finish();
  };
  const grab = (mode: DragMode) => ({ onPointerDown: start(mode), onPointerMove: move, onPointerUp: end, onPointerCancel: end });

  const corners = traceCorners(t);
  const outline = corners.map((c) => `${c.x},${c.y}`).join(" ");
  const hs = 10 * px * touch;
  const hit = hitOf(hs * 2, px, touch);
  const edge = imageToPlan(t, { x: t.w / 2, y: 0 });
  const up = { x: Math.sin((t.rotation * Math.PI) / 180), y: -Math.cos((t.rotation * Math.PI) / 180) }; // where the picture's top points on the plan
  const knob = { x: edge.x + up.x * 28 * px * touch, y: edge.y + up.y * 28 * px * touch };
  const kr = 7 * px * touch;
  return (
    <g>
      <polygon points={outline} fill="transparent" stroke={ACCENT} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} style={{ cursor: "move" }} {...grab("move")}>
        <title>Drag to move the picture</title>
      </polygon>
      {corners.map((c, i) => (
        <g key={i} style={{ cursor: "nwse-resize" }} {...grab("scale")}>
          <title>Drag to make the picture bigger or smaller</title>
          <rect x={c.x - hit / 2} y={c.y - hit / 2} width={hit} height={hit} fill="transparent" />
          <rect x={c.x - hs / 2} y={c.y - hs / 2} width={hs} height={hs} fill={PAPER} stroke={ACCENT} strokeWidth={1.5 * px} />
        </g>
      ))}
      <line x1={edge.x} y1={edge.y} x2={knob.x} y2={knob.y} stroke={ACCENT} strokeWidth={px} pointerEvents="none" />
      <g style={{ cursor: "grab" }} {...grab("rotate")}>
        <title>Drag to turn the picture (Shift: 15 degree steps)</title>
        <circle cx={knob.x} cy={knob.y} r={hitOf(kr * 4, px, touch) / 2} fill="transparent" />
        <circle cx={knob.x} cy={knob.y} r={kr} fill={PAPER} stroke={ACCENT} strokeWidth={1.5 * px} />
        <g transform={`translate(${knob.x - 4 * px} ${knob.y - 4 * px}) scale(${(8 * px) / 256})`} pointerEvents="none"><ArrowsClockwiseIcon size={256} color={ACCENT} weight="bold" /></g>
      </g>
    </g>
  );
}
