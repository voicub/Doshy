"use client";
import { useMemo } from "react";
import { CATALOG } from "@/lib/catalog";
import { openingTags } from "@/lib/blueprint";
import { defaultSwing, doorSector, fitVerdict, snapFlush, wallObstacles, type DoorZone, type Obstacle, type Swing, type Verdict } from "@/lib/fit";
import { formatGap } from "@/lib/measure";
import { classify, corners, type Footprint } from "@/lib/placement";
import type { Plan, Pt } from "@/lib/types";
import { Catcher, AMBER, OK, RED, Tag, pointsOf } from "./MeasureMarks";
import { useLayerPointer } from "./MeasurePointer";
import type { LayerProps } from "./MeasureLayer";
import { useFitUi } from "./fitUi";
import { useMeasureSettings } from "./measureUi";
import { planGrid } from "./planPoint";

const LEVEL_COLOR = { ok: OK, tight: AMBER, blocked: RED } as const;
const LABEL_REACH_M = 0.6; // a piece's name shows while the ghost is within this many metres of it

/** The piece being tried: its size, name and whether its doors open outward (the piece's own default unless the owner chose). */
export type Trying = { w: number; d: number; label: string; swing: Swing | null };

/** What is being tried, from the chosen catalogue piece or the custom size. Null with nothing chosen. */
export function useTrying(): Trying | null {
  const piece = useFitUi((s) => s.piece);
  const custom = useFitUi((s) => s.custom);
  const cw = useFitUi((s) => s.cw);
  const cd = useFitUi((s) => s.cd);
  const opens = useFitUi((s) => s.opens);
  const leaf = useFitUi((s) => s.leaf);
  return useMemo(() => {
    const base = custom ? { kind: "", label: "your piece", w: cw, d: cd } : piece;
    if (!base || !(base.w > 0 && base.d > 0)) return null;
    const on = opens ?? defaultSwing(base.kind, base.label, base.w) !== null;
    const depth = leaf ?? (base.w >= 0.8 ? base.w / 2 : base.w);
    return { w: base.w, d: base.d, label: base.label, swing: on && depth > 0 ? { depth } : null };
  }, [piece, custom, cw, cd, opens, leaf]);
}

/** The floor furniture of the level (what takes room on the floor: not rugs, wall-mounted or ceiling pieces), and with the walls everything that stops a piece; the open-door areas of its doors. */
function useSurroundings(plan: Plan) {
  return useMemo(() => {
    const furniture: Obstacle[] = plan.items.flatMap((it) => {
      const def = CATALOG[it.kind];
      return def && classify(def, it.kind) === "floor" ? [{ id: it.id, label: def.label.toLowerCase(), wall: false, poly: corners({ x: it.x, y: it.y, w: it.w, d: it.d, rot: it.rot }) }] : [];
    });
    const tags = openingTags(plan);
    const doors: DoorZone[] = plan.openings.flatMap((o) => {
      const w = plan.walls.find((x) => x.id === o.wallId);
      return o.type === "door" && w ? [{ id: o.id, label: tags[o.id] ?? "door", poly: doorSector(o, w) }] : [];
    });
    return { furniture, doors, obstacles: [...wallObstacles(plan.walls), ...furniture] };
  }, [plan]);
}

export type FitResult = { trying: Trying | null; ghost: Footprint | null; verdict: Verdict | null; furniture: Obstacle[] };

/** The ghost where the pointer put it and what the check says about it. The plan layer and the bar both read it. */
export function useFitResult(plan: Plan): FitResult {
  const at = useFitUi((s) => s.at);
  const turned = useFitUi((s) => s.turned);
  const walkway = useMeasureSettings((s) => s.walkway);
  const trying = useTrying();
  const { furniture, doors, obstacles } = useSurroundings(plan);
  return useMemo(() => {
    if (!trying || !at) return { trying, ghost: null, verdict: null, furniture };
    const ghost: Footprint = { x: at.x, y: at.y, w: trying.w, d: trying.d, rot: turned ? 90 : 0 };
    return { trying, ghost, verdict: fitVerdict({ ghost, obstacles, doors, walkway, swing: trying.swing }), furniture };
  }, [trying, at, turned, walkway, furniture, doors, obstacles]);
}

/** "Does it fit here?": the level's floor furniture as faint outlines, and the piece as a ghost that follows the pointer (a finger: tap or drag) with its verdict. */
export default function MeasureFit({ plan, vb, u, px }: LayerProps) {
  const { trying, ghost, verdict, furniture } = useFitResult(plan);
  const turned = useFitUi((s) => s.turned);

  // the ghost sits on the 5 cm grid and is pulled flush to a wall within 5 cm; Alt means exactly under the pointer
  const place = (raw: Pt, e: { altKey: boolean; shiftKey: boolean }): Pt => {
    if (!trying) return raw;
    const g = planGrid(e);
    const snapped = g > 0 ? { x: +(Math.round(raw.x / g) * g).toFixed(4), y: +(Math.round(raw.y / g) * g).toFixed(4) } : raw;
    if (e.altKey) return snapped;
    const f = snapFlush({ ...snapped, w: trying.w, d: trying.d, rot: turned ? 90 : 0 }, plan.walls);
    return { x: f.x, y: f.y };
  };
  const handlers = useLayerPointer({
    defer: false,
    hover: (pt, e) => {
      const ui = useFitUi.getState();
      if (!ui.held) ui.set({ at: place(pt, e) });
    },
    press: (pt, e) => {
      const ui = useFitUi.getState();
      // a mouse click holds the ghost still (so its numbers can be read) and the next one lets it go; a finger just puts it where it touched
      ui.set({ at: place(pt, e), held: e.pointerType === "touch" ? false : !ui.held });
    },
    drag: (pt, e) => useFitUi.getState().set({ at: place(pt, e) }),
    leave: () => {
      const ui = useFitUi.getState();
      if (!ui.held) ui.set({ at: null });
    },
  });

  const colour = verdict ? LEVEL_COLOR[verdict.level] : OK;
  const poly = ghost ? corners(ghost) : null;
  const top = poly ? Math.min(...poly.map((p) => p.y)) : 0;
  const midX = poly ? (Math.min(...poly.map((p) => p.x)) + Math.max(...poly.map((p) => p.x))) / 2 : 0;

  return (
    <>
      <g pointerEvents="none" fill="rgb(var(--dim-rgb) / 0.08)" stroke="var(--plan-line)" strokeOpacity={0.7} strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`}>
        {furniture.map((o) => <polygon key={o.id} points={pointsOf(o.poly)} />)}
      </g>
      {ghost && (
        <g pointerEvents="none">
          {furniture.map((o) => {
            const xs = o.poly.map((p) => p.x);
            const ys = o.poly.map((p) => p.y);
            const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
            const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
            // names only for what the piece is close to: all of them at once would bury the room labels
            const close = ghost.x > x0 - LABEL_REACH_M && ghost.x < x1 + LABEL_REACH_M && ghost.y > y0 - LABEL_REACH_M && ghost.y < y1 + LABEL_REACH_M;
            return close ? <Tag key={o.id} x={(x0 + x1) / 2} y={(y0 + y1) / 2} text={o.label} u={u} size={0.16} fill="var(--plan-line)" /> : null;
          })}
        </g>
      )}
      <Catcher vb={vb} handlers={handlers} />
      {poly && verdict && (
        <g pointerEvents="none">
          {verdict.swing && <polygon points={pointsOf(verdict.swing)} fill={colour} fillOpacity={0.07} stroke={colour} strokeWidth={px} strokeDasharray={`${3 * px} ${3 * px}`} />}
          <polygon points={pointsOf(poly)} fill={colour} fillOpacity={0.2} stroke={colour} strokeWidth={2 * px} strokeLinejoin="round" />
          {verdict.gap && verdict.gap.dist > 0.004 && (
            <>
              <line x1={verdict.gap.from.x} y1={verdict.gap.from.y} x2={verdict.gap.to.x} y2={verdict.gap.to.y} stroke={colour} strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />
              <Tag x={(verdict.gap.from.x + verdict.gap.to.x) / 2} y={(verdict.gap.from.y + verdict.gap.to.y) / 2 - 5 * px} text={formatGap(verdict.gap.dist)} u={u} fill={colour} size={0.22} />
            </>
          )}
          <Tag x={midX} y={top - 12 * px} text={verdict.text} u={u} fill={colour} size={0.24} />
        </g>
      )}
    </>
  );
}
