"use client";
import { WALL_T } from "@/lib/geometry";
import { firstLevelId, levelsOf, onLevel } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { footprintArea, type Template } from "@/lib/templates";
import type { Plan } from "@/lib/types";
import { exportPlan } from "./planIO";

const PAD = 0.5; // metres of paper around the drawing

/** Tiny schematic of a plan's first level: floors, walls, and the doors (gaps) and windows (accent) cut into them. */
function Preview({ plan }: { plan: Plan }) {
  const { walls, rooms, openings } = onLevel(plan, firstLevelId(plan));
  if (!walls.length && !rooms.length)
    return (
      <svg viewBox="0 0 4 3" aria-hidden="true">
        <rect className="np-empty" x="0.5" y="0.5" width="3" height="2" />
        <path className="np-plus" d="M2 1.2v0.6M1.7 1.5h0.6" />
      </svg>
    );
  const xs = [...walls.flatMap((w) => [w.a.x, w.b.x]), ...rooms.flatMap((r) => [r.x, r.x + r.w])];
  const ys = [...walls.flatMap((w) => [w.a.y, w.b.y]), ...rooms.flatMap((r) => [r.y, r.y + r.h])];
  const [x0, y0] = [Math.min(...xs) - PAD, Math.min(...ys) - PAD];
  const stroke = WALL_T * 1.6;
  return (
    <svg viewBox={`${x0} ${y0} ${Math.max(...xs) + PAD - x0} ${Math.max(...ys) + PAD - y0}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {rooms.map((r) => <rect key={r.id} className={r.floor === "grass" ? "np-grass" : "np-room"} x={r.x} y={r.y} width={r.w} height={r.h} />)}
      {walls.map((w) => <line key={w.id} className="np-wall" strokeWidth={stroke} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />)}
      {openings.map((o) => {
        const w = walls.find((x) => x.id === o.wallId);
        if (!w) return null;
        const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        const [ux, uy] = [(w.b.x - w.a.x) / len, (w.b.y - w.a.y) / len];
        const [cx, cy] = [w.a.x + (w.b.x - w.a.x) * o.t, w.a.y + (w.b.y - w.a.y) * o.t];
        const h = o.width / 2;
        return <line key={o.id} className={o.type === "door" ? "np-door" : "np-win"} strokeWidth={o.type === "door" ? stroke * 1.15 : stroke * 0.5} x1={cx - ux * h} y1={cy - uy * h} x2={cx + ux * h} y2={cy + uy * h} />;
      })}
    </svg>
  );
}


const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** One template: schematic, name, summary, building type, footprint and levels. */
export function TemplateCard({ t, plan, compact, isMarked, onPick }: { t: Template; plan: Plan; compact: boolean; isMarked: boolean; onPick: () => void }) {
  const area = footprintArea(plan);
  return (
    <li>
      <button type="button" id={`np-${t.id}`} className="np-card" aria-pressed={compact ? isMarked : undefined} onClick={onPick}>
        <span className="np-prev"><Preview plan={plan} /></span>
        <span className="np-text">
          <span className="np-name">{t.name}</span>
          <span className="np-sum">{t.summary}</span>
          <span className="np-meta">
            <span className="np-tag">{plan.building?.type}</span>
            <span>{area ? `${Math.round(area)} m\u00b2` : "Empty"}</span>
            <span>{plural(levelsOf(plan).length, "level")}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** "This replaces your plan": export a copy first, then Replace or Back. Compact screens put the two buttons in a sticky footer. */
export function ReplaceConfirm({ picked, compact, exported, onExported, onReplace, onBack }: { picked: Template; compact: boolean; exported: boolean; onExported: () => void; onReplace: () => void; onBack: () => void }) {
  return (
    <section className="np-confirm" aria-label={`Replace the plan with ${picked.name}`}>
      <h2 className="hud-name">{picked.name}</h2>
      <p className="hint">{compact ? "Your current plan is replaced by this template. Right afterwards the Undo button brings it back. To keep a copy as a file, save it first." : "The current plan is replaced by this template. Undo brings it back, but export it first to keep a copy as a file."}</p>
      <div className="np-actions">
        <button type="button" className="btn" onClick={() => { exportPlan(useStore.getState().plan); onExported(); }}>{compact ? "Save a copy of my plan first" : "Export current plan first"}</button>
        {exported && <small className="field-note ok" role="status">Saved doshy-plan.json</small>}
        {!compact && (
          <>
            <button type="button" className="btn primary" onClick={onReplace}>Replace plan</button>
            <button type="button" className="btn" autoFocus onClick={onBack}>Back</button>
          </>
        )}
      </div>
      {compact && (
        <footer className="np-foot">
          <button type="button" className="btn" autoFocus onClick={onBack}>Back</button>
          <button type="button" className="btn primary" onClick={onReplace}>Replace my plan</button>
        </footer>
      )}
    </section>
  );
}
