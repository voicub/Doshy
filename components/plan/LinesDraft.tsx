"use client";
import { cleanPoints, pathOutline } from "@/lib/ground";
import { lineLength, stationsAlong } from "@/lib/lineGeometry";
import { lightKindOf, pathKindOf } from "@/lib/lineKinds";
import { lampPreview } from "@/lib/lineLights";
import type { Pt } from "@/lib/types";
import { PAPER } from "./BlueprintPaper";
import { useLinesDraft } from "./linesTool";
import { useLinesUi } from "./linesUi";
import { ACCENT, MONO } from "./planStyle";

const POST_GAP = 2; // metres between the post ticks drawn along a fence (the real posts are placed by the fence style)
const pts = (poly: Pt[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");

/**
 * What the Garden lines tool is about to make, drawn over the plan: the road or walkway outline, the fence line with ticks where posts would stand,
 * or dots where lamps will land, always with the running length. `cur` is the snapped pointer, `hover` whether it is over the plan.
 */
export default function LinesDraft({ cur, hover, u, px }: { cur: Pt; hover: boolean; u: number; px: number }) {
  const points = useLinesDraft((s) => s.points);
  const ui = useLinesUi();
  if (points.length === 0) return null;
  const line = cleanPoints([...points, ...(hover ? [cur] : [])]);
  const label = { fontSize: 0.26 * u, textAnchor: "middle" as const, fill: "var(--text)", pointerEvents: "none" as const, style: { ...MONO, paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.09 * u, strokeLinejoin: "round" as const } };
  const ghost = { fill: ACCENT, fillOpacity: 0.12, stroke: ACCENT, strokeWidth: 0.04 * u, strokeDasharray: `${0.14 * u} ${0.1 * u}`, pointerEvents: "none" as const };
  const guide = { fill: "none", stroke: ACCENT, strokeWidth: 0.05 * u, strokeLinejoin: "round" as const, pointerEvents: "none" as const };
  const two = line.length >= 2;

  let preview = null;
  if (two && (ui.family === "road" || ui.family === "walkway")) {
    const kind = pathKindOf(ui.pathKind);
    const outline = kind ? pathOutline({ points: line, width: ui.width, smooth: ui.smooth, ends: kind.look.ends }) : [];
    preview = outline.length > 0 && <polygon points={pts(outline)} {...ghost} />;
  } else if (two && ui.family === "fence") {
    const t = 0.1 * u; // half the length of a post tick
    preview = (
      <>
        <polyline points={pts(line)} {...guide} />
        {stationsAlong(line, POST_GAP).map((s, i) => {
          const [nx, ny] = [-Math.sin(s.angle) * t, Math.cos(s.angle) * t];
          return <line key={i} x1={s.x - nx} y1={s.y - ny} x2={s.x + nx} y2={s.y + ny} stroke={ACCENT} strokeWidth={0.06 * u} pointerEvents="none" />;
        })}
      </>
    );
  } else if (two && ui.family === "lights") {
    const kind = lightKindOf(ui.light);
    const spots = kind ? lampPreview(line, { spacing: ui.spacing, span: kind.span }) : [];
    preview = (
      <>
        <polyline points={pts(line)} {...guide} strokeOpacity={0.5} strokeDasharray={`${0.14 * u} ${0.1 * u}`} />
        {spots.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={0.07 * u} fill={PAPER} stroke={ACCENT} strokeWidth={0.04 * u} pointerEvents="none" />)}
      </>
    );
  }
  return (
    <>
      {preview}
      {points.map((q, i) => <rect key={i} x={q.x - 4 * px} y={q.y - 4 * px} width={8 * px} height={8 * px} fill={PAPER} stroke={ACCENT} strokeWidth={1.5 * px} pointerEvents="none" />)}
      {hover && <text x={cur.x} y={cur.y - 0.5 * u} {...label}>{`${lineLength(line).toFixed(1)} m   double-click to finish`}</text>}
    </>
  );
}
