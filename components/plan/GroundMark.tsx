"use client";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import type { PointerEvent as RPE } from "react";
import { CORNERS, areaCenter, areaCorners, areaM2, cleanPoints, groundColor, groundKind, groundLabel, groundPolygon, marksOf, pathLength, pathLine, pathMidpoint, pavementOf, pavementWidthOf } from "@/lib/ground";
import { pavementBands, roadMarkStrips, stoneRects } from "@/lib/lineGeometry";
import { FLOORS } from "@/lib/materials";
import type { GroundArea, GroundPath, Plan, Pt, Sel } from "@/lib/types";
import { LINE, PAPER, floorFill } from "./BlueprintPaper";
import { useGroundDraft, type GrabSpec } from "./groundTool";
import { hitOf } from "./hit";
import { useGroundUi } from "./groundUi";
import { ACCENT, MONO } from "./planStyle";
type Common = { u: number; px: number; touch: number };
const pts = (poly: Pt[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");

/** The drafting symbols of a road or path: its pavement strips (lighter, hatched, dashed outline), stepping stones (small rounded rectangles) and lane markings (thin white or yellow lines). */
function roadSymbols(g: GroundPath, u: number) {
  const line = pathLine(g);
  const bands = pavementBands(line, g.width, pavementWidthOf(g), pavementOf(g)).map((b) => {
    const strip = pts([...b.inner, ...[...b.outer].reverse()]);
    return (
      <g key={b.side} pointerEvents="none">
        <polygon points={strip} fill="var(--text)" fillOpacity={0.12} />
        <polygon points={strip} fill={floorFill("slabs")} stroke={LINE} strokeOpacity={0.6} strokeWidth={0.02 * u} strokeDasharray={`${0.12 * u} ${0.08 * u}`} strokeLinejoin="round" />
      </g>
    );
  });
  if (g.stones) {
    const stones = stoneRects(line, g.width).map((s, i) => (
      <rect key={i} x={-s.l / 2} y={-s.w / 2} width={s.l} height={s.w} rx={0.2 * Math.min(s.l, s.w)} transform={`translate(${s.x} ${s.y}) rotate(${(s.angle * 180) / Math.PI})`} fill={groundColor(g)} fillOpacity={0.55} stroke={LINE} strokeOpacity={0.7} strokeWidth={0.02 * u} pointerEvents="none" />
    ));
    return { bands, stones: <g pointerEvents="none">{stones}</g>, marks: null };
  }
  const marks = roadMarkStrips(line, g.width, marksOf(g)).map((s, i) => (
    <polyline key={i} points={pts(s.pts)} fill="none" stroke={s.color} strokeOpacity={0.9} strokeWidth={Math.max(s.width, 0.03 * u)} pointerEvents="none" />
  ));
  return { bands, stones: null, marks: <g pointerEvents="none">{marks}</g> };
}

/** Ground areas and paths on the blueprint: tinted with their own colour, hatched with their surface's drafting symbol, dashed outline, a name and a measure. Drawn under the rooms. */
export function GroundLayer({ plan, selId, tool, u, onGrab }: { plan: Plan; selId?: string; tool: string; u: number; onGrab: (e: RPE, g: GrabSpec) => void }) {
  const move = tool === "select";
  const shape = (g: GroundArea | GroundPath, c: Pt, grab: GrabSpec) => {
    const poly = groundPolygon(g);
    const on = g.id === selId;
    const kind = groundKind(g);
    const road = "points" in g ? roadSymbols(g, u) : null;
    return (
      <g key={g.id} onPointerDown={move ? (e) => onGrab(e, grab) : undefined} style={{ cursor: move ? "move" : undefined }} pointerEvents={move ? undefined : "none"}>
        {road?.stones ? (
          <polygon points={pts(poly)} fill="transparent" stroke={on ? ACCENT : "none"} strokeWidth={0.05 * u} strokeLinejoin="round" /> // stepping stones: the strip is only there to be picked
        ) : (
          <>
            <polygon points={pts(poly)} fill={groundColor(g)} fillOpacity={kind === "water" ? 0.35 : 0.22} />
            <polygon points={pts(poly)} fill={floorFill(kind)} stroke={on ? ACCENT : LINE} strokeOpacity={on ? 1 : 0.6} strokeWidth={(on ? 0.05 : 0.025) * u} strokeDasharray={on ? undefined : `${0.16 * u} ${0.1 * u}`} strokeLinejoin="round" />
          </>
        )}
        {road?.bands}
        {road?.stones}
        {road?.marks}
        {on && <polygon points={pts(poly)} fill={ACCENT} fillOpacity={0.08} pointerEvents="none" />}
        <g pointerEvents="none" fontSize={0.2 * u} textAnchor="middle" style={MONO}>
          <text x={c.x} y={c.y - 0.04 * u} fill="var(--text)" style={{ ...MONO, textTransform: "uppercase", paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.08 * u, strokeLinejoin: "round" }}>{g.name ?? FLOORS[kind].label}</text>
          <text x={c.x} y={c.y + 0.22 * u} fill={ACCENT} style={{ ...MONO, paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.08 * u, strokeLinejoin: "round" }}>{groundLabel(g)}</text>
        </g>
      </g>
    );
  };
  return (
    <>
      {(plan.ground ?? []).map((g) => shape(g, areaCenter(g), { mode: "move", type: "ground", id: g.id, orig: g }))}
      {(plan.paths ?? []).map((g) => shape(g, pathMidpoint(g), { mode: "move", type: "path", id: g.id, orig: g }))}
    </>
  );
}

/** Handles and measures of the selected area or path, drawn above the walls so they can always be grabbed. */
export function GroundHandles({ plan, sel, tool, u, px, touch, onGrab }: { plan: Plan; sel: Sel; tool: string; onGrab: (e: RPE, g: GrabSpec) => void } & Common) {
  if (tool !== "select" || !sel) return null;
  const hs = 10 * px * touch;
  const grip = (key: string, at: Pt, g: GrabSpec, title: string, cursor: string) => (
    <g key={key} onPointerDown={(e) => onGrab(e, g)} style={{ cursor }}>
      <title>{title}</title>
      <rect x={at.x - hitOf(hs * 2, px, touch) / 2} y={at.y - hitOf(hs * 2, px, touch) / 2} width={hitOf(hs * 2, px, touch)} height={hitOf(hs * 2, px, touch)} fill="transparent" />
      <rect x={at.x - hs / 2} y={at.y - hs / 2} width={hs} height={hs} fill={PAPER} stroke={ACCENT} strokeWidth={1.5 * px} />
    </g>
  );
  const text = (x: number, y: number, s: string, rot = 0) => (
    <text x={x} y={y} fontSize={0.22 * u} textAnchor="middle" fill="var(--text)" transform={`rotate(${rot} ${x} ${y})`} pointerEvents="none" style={{ ...MONO, paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.09 * u, strokeLinejoin: "round" }}>{s}</text>
  );
  if (sel.type === "ground") {
    const a = plan.ground?.find((g) => g.id === sel.id);
    if (!a) return null;
    const rot = a.rot ?? 0;
    const [cos, sin] = [Math.cos((rot * Math.PI) / 180), Math.sin((rot * Math.PI) / 180)];
    const c = areaCenter(a);
    const at = (lx: number, ly: number): Pt => ({ x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos });
    const knob = at(0, -a.h / 2 - 28 * px * touch);
    const top = at(0, -a.h / 2);
    const gap = 0.3 * Math.max(u, 0.5);
    const [tw, lh] = [at(0, -a.h / 2 - gap), at(-a.w / 2 - gap, 0)];
    const kr = 7 * px * touch;
    return (
      <g>
        {CORNERS.map((k, i) => grip(k, areaCorners(a)[i], { mode: "corner", type: "ground", id: a.id, orig: a, corner: k }, "Drag to resize", "nwse-resize"))}
        <line x1={top.x} y1={top.y} x2={knob.x} y2={knob.y} stroke={ACCENT} strokeWidth={px} pointerEvents="none" />
        <g onPointerDown={(e) => onGrab(e, { mode: "rotate", type: "ground", id: a.id, orig: a })} style={{ cursor: "grab" }}>
          <title>Drag to turn (Shift: 15 degree steps, Alt: free)</title>
          <circle cx={knob.x} cy={knob.y} r={hitOf(kr * 4, px, touch) / 2} fill="transparent" />
          <circle cx={knob.x} cy={knob.y} r={kr} fill={PAPER} stroke={ACCENT} strokeWidth={1.5 * px} />
          <g transform={`translate(${knob.x - 4 * px} ${knob.y - 4 * px}) scale(${(8 * px) / 256})`} pointerEvents="none"><ArrowsClockwiseIcon size={256} color={ACCENT} weight="bold" /></g>
        </g>
        {text(tw.x, tw.y, `${a.w.toFixed(2)} m`, rot)}
        {text(lh.x, lh.y, `${a.h.toFixed(2)} m`, rot - 90)}
        {text(c.x, c.y + 0.5 * u, `${areaM2(a).toFixed(1)} m2${rot ? `  ${Math.round(rot)} deg` : ""}`)}
      </g>
    );
  }
  const p = plan.paths?.find((g) => g.id === sel.id);
  if (!p) return null;
  const line = cleanPoints(p.points); // the grips sit on the control points; the dashed centre line is the curve the road really follows
  const mid = pathMidpoint(p);
  return (
    <g>
      <polyline points={pts(pathLine(p))} fill="none" stroke={ACCENT} strokeOpacity={0.8} strokeWidth={px} strokeDasharray={`${4 * px} ${4 * px}`} pointerEvents="none" />
      {line.map((q, i) => grip(`v${i}`, q, { mode: "vertex", type: "path", id: p.id, orig: p, index: i }, "Drag to bend the line here", "crosshair"))}
      {text(mid.x, mid.y - 0.45 * u, `${pathLength(p).toFixed(1)} m long, ${p.width.toFixed(2)} m wide`)}
    </g>
  );
}

/** What the Garden tool is about to lay: the rectangle being dragged, or the preset stamp under the pointer. */
export function GroundDraft({ cur, hover, u }: { cur: Pt; hover: boolean; u: number }) {
  const { rect } = useGroundDraft();
  const ui = useGroundUi();
  const label = { fontSize: 0.26 * u, textAnchor: "middle" as const, fill: "var(--text)", pointerEvents: "none" as const, style: { ...MONO, paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.09 * u, strokeLinejoin: "round" as const } };
  const ghost = { fill: ACCENT, fillOpacity: 0.12, stroke: ACCENT, strokeWidth: 0.04 * u, strokeDasharray: `${0.14 * u} ${0.1 * u}`, pointerEvents: "none" as const };
  if (rect) {
    const [x, y, w, h] = [Math.min(cur.x, rect.x), Math.min(cur.y, rect.y), Math.abs(cur.x - rect.x), Math.abs(cur.y - rect.y)];
    return (
      <>
        <rect x={x} y={y} width={w} height={h} {...ghost} />
        <text x={x + w / 2} y={y + h / 2} {...label}>{`${w.toFixed(2)} x ${h.toFixed(2)} m`}</text>
      </>
    );
  }
  if (hover && ui.size) return <rect x={cur.x - ui.size.w / 2} y={cur.y - ui.size.h / 2} width={ui.size.w} height={ui.size.h} {...ghost} />;
  return null;
}
