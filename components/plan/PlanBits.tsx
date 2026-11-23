import { RulerIcon } from "@phosphor-icons/react";
import { clamp } from "@/lib/mathUtil";
import type { Def } from "@/lib/catalog";
import type { Item, Pt } from "@/lib/types";
import { PillarShape } from "./Pillars";
import type { Box } from "@/lib/viewInset";
import { ACCENT, HALO, MONO } from "./planStyle";

const signed = (v: number) => `${v < -0.005 ? "-" : "+"}${Math.abs(v).toFixed(2)}`;

/** Fit the plan to the view, and show or hide the dimensions: the two buttons in the top-left corner of the plan. */
export function PlanCorner({ onFit, dims, onDims }: { onFit: () => void; dims: boolean; onDims: () => void }) {
  return (
    <div className="plan-corner">
      <button className="kbd" onClick={onFit} aria-label="Fit the plan to the view" title="Fit the plan to the view" style={{ height: 26, background: "rgba(5,7,10,0.85)", cursor: "pointer" }}>
        Fit <span className="plan-key" style={{ color: ACCENT, marginLeft: 6 }}>0</span>
      </button>
      <button className="kbd" onClick={onDims} aria-pressed={dims} aria-label="Show dimensions, axes and tags" title="Show dimensions, grid axes and door/window tags" style={{ height: 26, gap: 6, background: "rgba(8,31,58,0.9)", cursor: "pointer", color: dims ? ACCENT : undefined }}>
        <RulerIcon size={14} /> Dimensions
      </button>
    </div>
  );
}

/** Dimension label centred on a segment, offset to the side so it does not sit on the wall. */
export function Dim({ a, b, text, u }: { a: Pt; b: Pt; text: string; u: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const side = ny > 0 || (ny === 0 && nx > 0) ? -1 : 1; // always lift the label above the line
  const off = 0.42 * Math.max(u, 0.5);
  return (
    <text x={(a.x + b.x) / 2 + nx * off * side} y={(a.y + b.y) / 2 + ny * off * side + 0.08 * u} fontSize={0.26 * u} textAnchor="middle" fill="#e8f1f7" style={{ ...MONO, ...HALO, strokeWidth: HALO.strokeWidth * u }} pointerEvents="none">{text}</text>
  );
}

/** A structural element standing in the plan (column, riser): hatched like cut concrete. Furniture is not drawn in plan mode. */
export function SolidShape({ it, def }: { it: Item; def: Def }) {
  return def.solid ? <PillarShape it={it} /> : null;
}

/** Multiples of 5 m inside [from, from + span]. */
export function ticks(from: number, span: number): number[] {
  const first = Math.ceil(from / 5) * 5;
  return Array.from({ length: Math.max(0, Math.floor((from + span - first) / 5) + 1) }, (_, i) => first + i * 5);
}

type Cursor = {
  /** The snapped plan point under the pointer. */
  cur: Pt;
  /** The visible plan rectangle (metres) and `u`, `px`: screen-constant unit and metres per screen pixel. */
  vb: { x: number; y: number; w: number; h: number };
  u: number;
  px: number;
  /** A finger: the readout sits clear of the fingertip, with a ring marking the point. */
  finger: boolean;
  /** The visible part of the canvas (px): a finger's readout stays inside it, and goes below the fingertip when above would run under the top strip. */
  free: Box;
  /** Move or drag offsets to show, and the length of the wall being drawn, if any. */
  delta: Pt | null;
  wallLen: number | null;
};

/** The snap cursor: dashed crosshair and a small square at the snapped point, a coordinate readout beside it (above a finger, clear of the fingertip), then the drag offset and the wall length being drawn. */
export function SnapCursor({ cur, vb, u, px, finger, free, delta, wallLen }: Cursor) {
  const flipX = cur.x > vb.x + vb.w - 4.5 * u;
  const half = 76 * px; // half the widest readout
  const x = finger ? clamp(cur.x, vb.x + free.x0 * px + half, vb.x + free.x1 * px - half) : cur.x + (flipX ? -0.25 : 0.25) * u;
  const top = free.y0 + 14 + ((x - vb.x) / px - 76 < 196 ? 44 : 0); // the Fit and Dimensions buttons sit in the top-left corner
  const lift = finger && cur.y - 78 * px < vb.y + top * px ? 1 : -1;
  const y = finger ? cur.y + lift * 58 * px : cur.y - 0.25 * u;
  const anchor = finger ? "middle" : flipX ? "end" : "start";
  const yUp = y + (finger ? lift : -1) * 0.3 * u;
  const halo = { ...HALO, strokeWidth: HALO.strokeWidth * u };
  const dash = `${0.1 * u} ${0.1 * u}`;
  return (
    <g pointerEvents="none">
      <line x1={vb.x} y1={cur.y} x2={vb.x + vb.w} y2={cur.y} stroke={ACCENT} strokeOpacity={0.22} strokeWidth={0.015 * u} strokeDasharray={dash} />
      <line x1={cur.x} y1={vb.y} x2={cur.x} y2={vb.y + vb.h} stroke={ACCENT} strokeOpacity={0.22} strokeWidth={0.015 * u} strokeDasharray={dash} />
      <rect x={cur.x - 0.07 * u} y={cur.y - 0.07 * u} width={0.14 * u} height={0.14 * u} fill="none" stroke={ACCENT} strokeWidth={0.03 * u} />
      {finger && <circle cx={cur.x} cy={cur.y} r={20 * px} fill="none" stroke={ACCENT} strokeOpacity={0.65} strokeWidth={1.5 * px} />}
      {delta && (
        <text x={x} y={yUp} fontSize={0.22 * u} textAnchor={anchor} fill="#e8f1f7" style={{ ...MONO, ...halo }}>
          {`DX ${signed(delta.x)}  DY ${signed(delta.y)}`}
        </text>
      )}
      {finger && wallLen !== null && (
        <text x={x} y={yUp} fontSize={0.22 * u} textAnchor="middle" fill="#e8f1f7" style={{ ...MONO, ...halo }}>
          {`${wallLen.toFixed(2)} m`}
        </text>
      )}
      <text x={x} y={y} fontSize={0.22 * u} textAnchor={anchor} fill={ACCENT} style={{ ...MONO, ...halo }}>
        {`X ${cur.x.toFixed(2)}  Y ${cur.y.toFixed(2)}`}
      </text>
    </g>
  );
}
