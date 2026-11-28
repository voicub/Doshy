import type { ReactNode } from "react";
import type { SnapKind } from "@/lib/measureSnap";
import type { Frame } from "@/lib/planView";
import type { Pt } from "@/lib/types";
import type { LayerPointer } from "./MeasurePointer";
import { ACCENT, HALO, INK, MONO } from "./planStyle";

export const LABEL = "var(--text)";
export const OK = "var(--ok)";
export const AMBER = "var(--lg-ffb347)";
export const RED = "var(--bad)";

const haloOf = (u: number) => ({ ...HALO, strokeWidth: HALO.strokeWidth * u });

/** The transparent rectangle that takes the pointer over the whole visible plan: a tool layer's hit area. */
export function Catcher({ vb, handlers, onDoubleClick, cursor = "crosshair" }: { vb: Frame; handlers: LayerPointer; onDoubleClick?: () => void; cursor?: string }) {
  return <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" style={{ cursor }} onDoubleClick={onDoubleClick} {...handlers} />;
}

/** Plan text with the paper-coloured outline, so it reads over hatches and rulings. `u` is the screen-constant unit. */
export function Tag({ x, y, text, u, fill = LABEL, anchor = "middle", size = 0.22 }: { x: number; y: number; text: string; u: number; fill?: string; anchor?: "start" | "middle" | "end"; size?: number }) {
  return (
    <text x={x} y={y} fontSize={size * u} textAnchor={anchor} fill={fill} style={{ ...MONO, ...haloOf(u) }} pointerEvents="none">
      {text}
    </text>
  );
}

/** Points as an SVG `points` string. */
export const pointsOf = (pts: readonly Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

const KIND_TEXT: Record<SnapKind, string> = { corner: "wall corner", end: "wall end", room: "room corner", grid: "", free: "" };

/** Where a click would land: a square on corners, a ring on wall ends and room corners, a small cross on the grid or when free. A word names what it locked onto. */
export function SnapMarker({ at, kind, u, px }: { at: Pt; kind: SnapKind; u: number; px: number }) {
  const r = 6 * px;
  const locked = kind === "corner" || kind === "end" || kind === "room";
  return (
    <g pointerEvents="none" fill="none" stroke={ACCENT} strokeWidth={1.5 * px}>
      {kind === "corner" && <rect x={at.x - r} y={at.y - r} width={2 * r} height={2 * r} />}
      {(kind === "end" || kind === "room") && <circle cx={at.x} cy={at.y} r={r} />}
      {!locked && <path d={`M${at.x - r} ${at.y}H${at.x + r}M${at.x} ${at.y - r}V${at.y + r}`} />}
      {locked && <Tag x={at.x + 9 * px} y={at.y - 9 * px} text={KIND_TEXT[kind]} u={u} fill={ACCENT} anchor="start" size={0.18} />}
    </g>
  );
}

/** A small button drawn on the plan (a kept measure's "Keep in plan" and remove cross). `width` and `height` are in screen pixels; a finger gets a 44 px target. */
export function ChipButton({ x, y, width, label, title, onPress, px, touch, children }: { x: number; y: number; width: number; label: string; title: string; onPress: () => void; px: number; touch: number; children?: ReactNode }) {
  const h = 20 * px;
  const hit = Math.max(h, touch > 1 ? 44 * px : 0);
  const w = width * px;
  const hw = Math.max(w, touch > 1 ? 44 * px : 0);
  return (
    <g role="button" aria-label={title} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onPress(); }} style={{ cursor: "pointer" }}>
      <title>{title}</title>
      <rect x={x - hw / 2} y={y - hit / 2} width={hw} height={hit} fill="transparent" />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={INK} fillOpacity={0.92} stroke={ACCENT} strokeWidth={px} />
      {children ?? (
        <text x={x} y={y + 3.5 * px} fontSize={10 * px} textAnchor="middle" fill={ACCENT} style={MONO} pointerEvents="none">
          {label}
        </text>
      )}
    </g>
  );
}
