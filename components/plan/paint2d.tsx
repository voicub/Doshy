import { groundAt, groundPolygon, paintGround, sampleGround } from "@/lib/ground";
import { planOfLevel } from "@/lib/levels";
import { paintHit, pickSurface, sampleHit } from "@/lib/materials";
import { usePaint } from "@/lib/paintStore";
import { activeLevelId, useStore } from "@/lib/store";
import type { Plan, Pt, Wall } from "@/lib/types";
import { ACCENT } from "./planStyle";
import { PillarShape } from "./Pillars";

/** How far from a wall's edge (metres) a click still counts as on the wall: 8 screen pixels, never less than 12 cm. */
const reach = (px: number) => Math.max(0.12, 8 * px);

/**
 * One touch of the paint bucket at plan point `p`: lay the current brush on the wall face or room under it (Shift: both faces of a wall), else on the
 * garden area or path under it, or with Alt pick the brush up from it (the eyedropper). Called inside the caller's gesture, so a click or a whole drag is one undo step.
 */
export function paintAt(p: Pt, mods: { altKey: boolean; shiftKey: boolean }, px: number) {
  const s = useStore.getState();
  const hit = pickSurface(planOfLevel(s.plan, activeLevelId(s)), p, reach(px));
  const ground = hit ? null : groundAt(s.plan, p);
  if (!hit && !ground) return;
  const paint = usePaint.getState();
  if (mods.altKey) {
    const picked = hit ? sampleHit(s.plan, hit) : ground && sampleGround(s.plan, ground);
    if (picked) {
      paint.setBrush(picked);
      paint.remember(picked.color);
    }
    return;
  }
  s.editPlan((plan) => (hit ? paintHit(plan, hit, paint.brush, mods.shiftKey) : ground ? paintGround(plan, ground, paint.brush) : plan));
  paint.remember(paint.brush.color);
}

const faceOffset = (w: Wall, face: "A" | "B") => {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
  const k = face === "A" ? 1 : -1;
  return { x: (-(w.b.y - w.a.y) / len) * k, y: ((w.b.x - w.a.x) / len) * k };
};

/** Shows what a click would paint: the room under the pointer, or the wall face nearest to it (both faces with Shift). */
export function PaintHover({ plan, at, px, both }: { plan: Plan; at: Pt; px: number; both: boolean }) {
  const hit = pickSurface(plan, at, reach(px));
  if (!hit) {
    const g = groundAt(plan, at);
    const shape = g && (g.type === "path" ? plan.paths?.find((x) => x.id === g.id) : plan.ground?.find((x) => x.id === g.id));
    return shape ? <polygon points={groundPolygon(shape).map((q) => `${q.x},${q.y}`).join(" ")} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={2 * px} pointerEvents="none" /> : null;
  }
  if (hit.type === "pillar") {
    const it = plan.items.find((x) => x.id === hit.id);
    return it ? <PillarShape it={it} fill={ACCENT} fillOpacity={0.2} stroke={ACCENT} strokeWidth={2 * px} pointerEvents="none" /> : null;
  }
  if (hit.type === "room") {
    const r = plan.rooms.find((x) => x.id === hit.id);
    return r ? <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={2 * px} pointerEvents="none" /> : null;
  }
  const w = plan.walls.find((x) => x.id === hit.id);
  if (!w) return null;
  const d = Math.max(w.thickness ?? 0.12, 3 * px) / 2 + 2 * px;
  return (
    <g pointerEvents="none">
      {(both ? (["A", "B"] as const) : ([hit.face] as const)).map((f) => {
        const o = faceOffset(w, f);
        return <line key={f} x1={w.a.x + o.x * d} y1={w.a.y + o.y * d} x2={w.b.x + o.x * d} y2={w.b.y + o.y * d} stroke={ACCENT} strokeWidth={3 * px} strokeLinecap="square" />;
      })}
    </g>
  );
}
