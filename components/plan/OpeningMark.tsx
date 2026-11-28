"use client";
import type { PointerEvent as RPE } from "react";
import { CATALOG } from "@/lib/catalog";
import { WALL_T, wallLen } from "@/lib/geometry";
import { inwardSign, swings } from "@/lib/openings";
import { doorSwing, swingHitsFootprint, type Footprint } from "@/lib/placement";
import type { Item, Opening, Plan, Pt, Wall } from "@/lib/types";
import { hitOf } from "./hit";
import { OpeningSymbol } from "./OpeningSymbols";
import { ACCENT, HALO, INK, MONO, WARN } from "./planStyle";

const fp = (it: Pick<Item, "x" | "y" | "w" | "d" | "rot">): Footprint => ({ x: it.x, y: it.y, w: it.w, d: it.d, rot: it.rot });

type OpeningDraw = Pick<Opening, "t" | "width" | "type" | "sill" | "height" | "hinge" | "swing" | "style">;

/** `quiet`: a window that is not selected carries no sill tag (small screens, where the dimensions are off). `touch`: handle size multiplier (1.7 on touchscreens). */
type Props = { o: OpeningDraw; wall: Wall; plan: Plan; on: boolean; ghost?: boolean; quiet?: boolean; u: number; px: number; touch: number; onDown?: (e: RPE) => void; onFlip?: (what: "hinge" | "side") => void };

/** A door or window drawn to scale on its wall: jambs, a double hairline and sill tag for windows, a leaf with swing arc for doors. */
export default function OpeningMark({ o, wall, plan, on, ghost, quiet, u, px, touch, onDown, onFlip }: Props) {
  const len = wallLen(wall) || 1;
  const ux = (wall.b.x - wall.a.x) / len;
  const uy = (wall.b.y - wall.a.y) / len;
  const nx = -uy;
  const ny = ux;
  const cx = wall.a.x + ux * o.t * len;
  const cy = wall.a.y + uy * o.t * len;
  const h = o.width / 2;
  const wallW = Math.max(wall.thickness ?? WALL_T, 3 * px) * 1.15;
  const P = (s: number, n = 0): Pt => ({ x: cx + ux * s + nx * n, y: cy + uy * s + ny * n });
  const run = (n: number) => ({ x1: P(-h, n).x, y1: P(-h, n).y, x2: P(h, n).x, y2: P(h, n).y });
  const door = o.type === "door";
  const sw = doorSwing(o, wall);
  const side = sw.normal.x * nx + sw.normal.y * ny > 0 ? 1 : -1; // which side of the wall (along +n or -n) the leaf opens to
  const blocked = door && !ghost && swings(o) && plan.items.some((it) => CATALOG[it.kind]?.solid && CATALOG[it.kind].stair !== "step" && swingHitsFootprint(sw, o.width, fp(it))); // furniture is not drawn in plan mode, so only visible structure (columns, stairs) flags a swing
  const edge = on ? ACCENT : "var(--text)";
  const hair = 0.03 * u;
  const tagSide = door ? -side : 1;
  const tagAt = P(0, tagSide * (wallW / 2 + (on ? 0.12 : 0.08) * Math.max(u, 0.5)));
  const sx = nx * tagSide; // on a north-south wall the label starts at the wall and runs away from it
  const anchor = Math.abs(sx) > 0.5 ? (sx > 0 ? "start" : "end") : "middle";
  const text = on
    ? `W ${o.width.toFixed(2)}  H ${o.height.toFixed(2)}  SILL ${o.sill.toFixed(2)}`
    : !door && !quiet
      ? `S ${o.sill.toFixed(2)}`
      : null;
  const hs = 12 * px * touch;
  const hit = hitOf(hs * 2, px, touch);
  const handle = (what: "hinge" | "side", at: Pt, label: string) => (
    <g key={what} onPointerDown={(e) => { e.stopPropagation(); onFlip?.(what); }} style={{ cursor: "pointer" }}>
      <title>{label}</title>
      <rect x={at.x - hit / 2} y={at.y - hit / 2} width={hit} height={hit} fill="transparent" />
      <rect x={at.x - hs / 2} y={at.y - hs / 2} width={hs} height={hs} fill={INK} stroke={ACCENT} strokeWidth={1.5 * px} />
    </g>
  );
  return (
    <g onPointerDown={onDown} style={{ cursor: "ew-resize" }} opacity={ghost ? 0.75 : 1} pointerEvents={ghost ? "none" : undefined}>
      <line {...run(0)} stroke="transparent" strokeWidth={Math.max(wallW + 0.14, (touch > 1 ? 44 : 0) * px)} />
      <line {...run(0)} stroke={INK} strokeWidth={wallW + 0.04} />
      {on && <line {...run(0)} stroke={ACCENT} strokeOpacity={0.22} strokeWidth={wallW + 0.14} />}
      {[-h, h].map((s) => (
        <line key={s} x1={P(s, -wallW / 2).x} y1={P(s, -wallW / 2).y} x2={P(s, wallW / 2).x} y2={P(s, wallW / 2).y} stroke={on ? ACCENT : "var(--plan-line)"} strokeWidth={hair} />
      ))}
      <OpeningSymbol o={o} P={P} sw={sw} side={side} inward={inwardSign(plan, wall, o.t)} edge={edge} accent={ACCENT} warn={WARN} blocked={blocked} hair={hair} u={u} wallW={wallW} />
      {on && !ghost && door && swings(o) && onFlip && (
        <>
          {handle("hinge", { x: sw.arcStart.x + sw.normal.x * 0.14, y: sw.arcStart.y + sw.normal.y * 0.14 }, "Flip hinge to the other end")}
          {handle("side", sw.leafEnd, "Open the door to the other side of the wall")}
        </>
      )}
      {text && (
        <text x={tagAt.x} y={tagAt.y + (Math.abs(sx) > 0.5 ? 0.06 : tagSide * ny > 0 ? 0.2 : -0.04) * u} fontSize={Math.max((on ? 0.2 : 0.16) * u, touch > 1 ? 12 * px : 0)} textAnchor={anchor} fill={on ? "var(--text)" : ACCENT} style={{ ...MONO, ...HALO, strokeWidth: HALO.strokeWidth * u }} pointerEvents="none">{text}</text>
      )}
    </g>
  );
}
