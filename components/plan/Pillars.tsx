"use client";
import type { PointerEvent as RPE, SVGProps } from "react";
import { CATALOG } from "@/lib/catalog";
import { isRoundPillar, type PillarPreset } from "@/lib/pillars";
import type { Item, Pt } from "@/lib/types";
import { LINE, PAPER } from "./BlueprintPaper";
import { TOUCH_HIT, hitOf } from "./hit"; // a pillar is a small target, so a finger gets at least this much to grab
import { ACCENT, MONO } from "./planStyle";

const HANDLE = 10; // px: corner handle
const SQRT_HALF = Math.SQRT1_2;

type Shape = Pick<Item, "kind" | "x" | "y" | "w" | "d" | "rot">;

/** A pillar in the plan: the concrete hatch inside a hairline, a rectangle or (round columns) an ellipse, turned about its centre. */
export function PillarShape({ it, fill = "url(#solid-hatch)", stroke = LINE, strokeWidth = 0.02, ...rest }: { it: Shape } & SVGProps<SVGRectElement & SVGEllipseElement>) {
  const props = { fill, stroke, strokeWidth, ...rest };
  return (
    <g transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`}>
      {isRoundPillar(it.kind) ? <ellipse rx={it.w / 2} ry={it.d / 2} {...props} /> : <rect x={-it.w / 2} y={-it.d / 2} width={it.w} height={it.d} {...props} />}
    </g>
  );
}

/** Where a handle of a pillar sits in the plan: a corner of its rectangle, or the matching point of its circle at 45 degrees. */
function corner(it: Shape, sx: number, sy: number): Pt {
  const k = isRoundPillar(it.kind) ? SQRT_HALF : 1;
  const [lx, ly] = [(sx * it.w * k) / 2, (sy * it.d * k) / 2];
  const a = (it.rot * Math.PI) / 180;
  return { x: it.x + lx * Math.cos(a) - ly * Math.sin(a), y: it.y + lx * Math.sin(a) + ly * Math.cos(a) };
}

const sizeText = (it: Shape) => `${it.w.toFixed(2)} x ${it.d.toFixed(2)} m`;

/** The size of a pillar in blueprint style: mono accent text above it, outlined in the sheet colour so it reads over hatches and walls. */
function SizeLabel({ it, u, px }: { it: Shape; u: number; px: number }) {
  const r = Math.hypot(it.w, it.d) / 2;
  return (
    <text x={it.x} y={it.y - r - 8 * px} fontSize={0.21 * u} textAnchor="middle" fill={ACCENT} pointerEvents="none" style={{ ...MONO, paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.09 * u, strokeLinejoin: "round" }}>
      {sizeText(it)}
    </text>
  );
}

/**
 * Pillars you can pick in the plan: a transparent target over each (never smaller than a finger), and for the selected one the accent outline,
 * four corner handles that resize it about its centre, and its size label. Drawn above the walls so a column in a facade is picked before the wall.
 */
export function PillarLayer({ items, selId, u, px, touch, onDown, onGrip }: { items: Item[]; selId: string | undefined; u: number; px: number; touch: number; onDown: (e: RPE, it: Item) => void; onGrip: (e: RPE, it: Item) => void }) {
  const hit = touch > 1 ? TOUCH_HIT * px : 0;
  return (
    <>
      {items.map((it) => {
        const on = it.id === selId;
        const hs = HANDLE * px * touch;
        const gh = hitOf(hs * 1.6, px, touch);
        return (
          <g key={it.id}>
            <g onPointerDown={(e) => onDown(e, it)} style={{ cursor: "move" }}>
              <title>Drag to move this pillar</title>
              <rect x={it.x - Math.max(it.w, hit) / 2} y={it.y - Math.max(it.d, hit) / 2} width={Math.max(it.w, hit)} height={Math.max(it.d, hit)} fill="transparent" transform={`rotate(${it.rot} ${it.x} ${it.y})`} />
            </g>
            {on && (
              <>
                <PillarShape it={it} fill={ACCENT} fillOpacity={0.14} stroke={ACCENT} strokeWidth={2 * px} pointerEvents="none" />
                <SizeLabel it={it} u={u} px={px} />
                {([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
                  const p = corner(it, sx, sy);
                  return (
                    <g key={`${sx}${sy}`} onPointerDown={(e) => onGrip(e, it)} style={{ cursor: "nwse-resize" }}>
                      <title>Drag to make this pillar bigger or smaller</title>
                      <rect x={p.x - gh / 2} y={p.y - gh / 2} width={gh} height={gh} fill="transparent" />
                      <rect x={p.x - hs / 2} y={p.y - hs / 2} width={hs} height={hs} fill={PAPER} stroke={ACCENT} strokeWidth={1.5 * px} pointerEvents="none" />
                    </g>
                  );
                })}
              </>
            )}
          </g>
        );
      })}
    </>
  );
}

/** The pillar the next click drops, shown under the pointer while the Pillar tool is active. */
export function PillarGhost({ preset, at, u, px }: { preset: PillarPreset; at: Pt; u: number; px: number }) {
  const def = CATALOG[preset.kind];
  const it: Shape = { kind: preset.kind, x: at.x, y: at.y, w: preset.w ?? def.w, d: preset.d ?? def.d, rot: 0 };
  return (
    <g pointerEvents="none">
      <PillarShape it={it} fill={ACCENT} fillOpacity={0.18} stroke={ACCENT} strokeWidth={2 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
      <SizeLabel it={it} u={u} px={px} />
    </g>
  );
}
