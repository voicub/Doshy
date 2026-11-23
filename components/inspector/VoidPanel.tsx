"use client";
import { ArrowClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import { levelBelow, turnVoid } from "@/lib/voids";
import { levelIdOf } from "@/lib/levels";
import { useStore } from "@/lib/store";
import HudPanel from "../ui/HudPanel";
import NumField from "../ui/NumField";
import { LevelTag } from "./shared";
import { closeInspector } from "./closeInspector";
import "./VoidPanel.css";

const MIN = 0.3;

/** A hand-drawn stairs opening: how big it is, a quarter turn, delete. Positions sit under Advanced; the stairs themselves are catalog items. */
export default function VoidPanel({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const v = plan.voids?.find((x) => x.id === id);
  if (!v) return null;
  const set = (p: Partial<typeof v>) => patch("void", v.id, p);
  const lowest = !levelBelow(plan, levelIdOf(plan, v));
  return (
    <HudPanel title="Stairs opening" meta={<><LevelTag plan={plan} entity={v} />{`${(v.w * v.h).toFixed(1)} m2`}</>} onClose={closeInspector} className="inspector">
      <p className="hint">A hole in this floor for stairs to come up through. Put the stairs in with the Furniture catalog.</p>
      <div className="field">
        <NumField label="Width" unit="m" value={v.w} step={0.05} min={MIN} live={false} onChange={(w) => set({ w })} />
        <NumField label="Depth" unit="m" value={v.h} step={0.05} min={MIN} live={false} onChange={(h) => set({ h })} />
      </div>
      <button className="btn" onClick={() => set(turnVoid(v))}><ArrowClockwiseIcon size={14} /> Turn 90 degrees</button>
      {lowest && <small className="field-note" role="status">This is the lowest floor, so there is nothing below to open into. Add a floor underneath in Building and levels.</small>}
      <details className="void-adv">
        <summary>Advanced</summary>
        <NumField label="Left edge" unit="m" value={v.x} step={0.05} live={false} onChange={(x) => set({ x })} />
        <NumField label="Top edge" unit="m" value={v.y} step={0.05} live={false} onChange={(y) => set({ y })} />
      </details>
      <button className="btn danger" onClick={() => remove("void", v.id)}><TrashIcon size={14} /> Delete</button>
    </HudPanel>
  );
}
