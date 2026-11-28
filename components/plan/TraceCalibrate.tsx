"use client";
import { useRef, useState, type PointerEvent as RPE } from "react";
import type { Trace } from "@/lib/designTypes";
import type { Frame } from "@/lib/planView";
import { imageToPlan, planToImage } from "@/lib/traceGeom";
import type { Pt } from "@/lib/types";
import { PAPER } from "./BlueprintPaper";
import { ACCENT, MONO } from "./planStyle";
import { svgPoint } from "./traceSvg";
import { useTraceUi } from "./traceUi";

/**
 * "Set the scale": two points are clicked on the picture and the panel asks how far apart they really are. A mouse press places a point at once; a
 * finger places it where it lifts (so it can slide to adjust), and a second finger (a pinch) places nothing. Drawn above everything while it runs.
 * Space or the middle button still pan; the points are kept in picture pixels, so they stay on the picture.
 */
export default function TraceCalibrate({ t, vb, px, touch }: { t: Trace; vb: Frame; px: number; touch: number }) {
  const calib = useTraceUi((s) => s.calib);
  const [hover, setHover] = useState<Pt | null>(null);
  const finger = useRef<number | null>(null); // the pointer of a finger that is down

  const down = (e: RPE<SVGRectElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.pointerType !== "touch") return place(e);
    if (finger.current !== null) {
      finger.current = null; // a second finger: a pinch, not a point
      setHover(null);
      return;
    }
    finger.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHover(svgPoint(e));
  };
  const place = (e: RPE<SVGRectElement>) => {
    const p = svgPoint(e);
    if (p) useTraceUi.getState().placePoint(planToImage(t, p));
  };
  const move = (e: RPE<SVGRectElement>) => {
    if (e.pointerType === "touch" && finger.current !== e.pointerId) return;
    setHover(svgPoint(e));
  };
  const up = (e: RPE<SVGRectElement>) => {
    if (finger.current !== e.pointerId) return;
    finger.current = null;
    place(e);
    setHover(null);
  };
  const cancel = (e: RPE<SVGRectElement>) => {
    if (finger.current !== e.pointerId) return;
    finger.current = null;
    setHover(null);
  };

  const [a, b] = [calib?.a && imageToPlan(t, calib.a), calib?.b && imageToPlan(t, calib.b)];
  const to = b ?? (a && hover) ?? null; // the line follows the pointer until the second point is placed
  const r = 6 * px * Math.max(1, touch * 0.8);
  const end = calib?.b ?? (hover ? planToImage(t, hover) : null); // the length shown is in picture pixels: what the scale will be worked from
  const label = calib?.a && end ? `${Math.round(Math.hypot(end.x - calib.a.x, end.y - calib.a.y))} px` : null;
  const dot = (p: Pt, key: string, ghost = false) => (
    <g key={key} pointerEvents="none" opacity={ghost ? 0.6 : 1}>
      <circle cx={p.x} cy={p.y} r={r} fill={PAPER} fillOpacity={0.6} stroke={ACCENT} strokeWidth={1.5 * px} />
      <line x1={p.x - r * 1.6} y1={p.y} x2={p.x + r * 1.6} y2={p.y} stroke={ACCENT} strokeWidth={px} />
      <line x1={p.x} y1={p.y - r * 1.6} x2={p.x} y2={p.y + r * 1.6} stroke={ACCENT} strokeWidth={px} />
    </g>
  );
  return (
    <g>
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" style={{ cursor: "crosshair" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={() => finger.current === null && setHover(null)} />
      {a && to && <line x1={a.x} y1={a.y} x2={to.x} y2={to.y} stroke={ACCENT} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} pointerEvents="none" />}
      {a && to && label && (
        <text x={(a.x + to.x) / 2} y={(a.y + to.y) / 2 - 10 * px} fontSize={12 * px} textAnchor="middle" fill="var(--text)" pointerEvents="none" style={{ ...MONO, paintOrder: "stroke", stroke: PAPER, strokeWidth: 3 * px, strokeLinejoin: "round" }}>{label}</text>
      )}
      {a && dot(a, "a")}
      {b && dot(b, "b")}
      {hover && !b && dot(hover, "h", true)}
    </g>
  );
}
