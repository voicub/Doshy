"use client";
import { TrashIcon } from "@phosphor-icons/react";
import { CATALOG } from "@/lib/catalog";
import { MIN_PILLAR, fullHeight, isRoundPillar, shapeKind } from "@/lib/pillars";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import HudPanel from "../ui/HudPanel";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import { Group, LevelTag } from "./shared";
import { closeInspector } from "./closeInspector";
import "../plan/pillar.css";

const SHAPES = ["Square", "Round"] as const;
const TURNS = [0, 45, 90] as const;
const MAX_PILLAR = 5;
const MAX_HEIGHT = 8;

/** A pillar (column or plumbing riser) selected in Plan mode: its shape, size, height and turn; the exact position sits under Advanced. */
export default function PillarPanel({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const it = plan.items.find((i) => i.id === id);
  const def = it && CATALOG[it.kind];
  if (!it || !def) return null;

  const set = (p: Partial<Item>) => patch("item", it.id, p);
  const full = fullHeight(plan, it.level);
  const riser = it.kind !== "column" && it.kind !== "column_round";

  return (
    <HudPanel title="Pillar" meta={<LevelTag plan={plan} entity={it} />} onClose={closeInspector} className="inspector">
      <h3 className="hud-name">{def.label}</h3>
      <Group label="Shape">
        <Segmented
          label="Shape"
          options={SHAPES}
          value={isRoundPillar(it.kind) ? "Round" : "Square"}
          onChange={(s) => (s === "Round") !== isRoundPillar(it.kind) && set({ kind: shapeKind(s === "Round") })}
        />
        {riser && <small className="field-note">This is the plumbing riser. Pick a shape to turn it into a plain column.</small>}
      </Group>
      <Group label="Size">
        <div className="grid3">
          <NumField label="Width" unit="m" value={it.w} step={0.05} min={MIN_PILLAR} max={MAX_PILLAR} live={false} onChange={(w) => set({ w })} />
          <NumField label="Depth" unit="m" value={it.d} step={0.05} min={MIN_PILLAR} max={MAX_PILLAR} live={false} onChange={(d) => set({ d })} />
          <NumField label="Height" unit="m" value={it.h} step={0.05} min={0.5} max={MAX_HEIGHT} live={false} onChange={(h) => set({ h })} />
        </div>
        <div className="presets" role="group" aria-label="Height">
          <button type="button" className="preset" aria-pressed={Math.abs(it.h - full) < 0.005} title={`${full} m: from the floor to the ceiling of this level`} onClick={() => set({ h: full })}>
            Full height
          </button>
        </div>
      </Group>
      <Group label="Rotation">
        <div className="presets" role="group" aria-label="Rotation">
          {TURNS.map((r) => (
            <button key={r} type="button" className="preset" aria-pressed={Math.abs(((it.rot % 180) + 180) % 180 - r) < 0.5} onClick={() => set({ rot: r })}>
              {r} deg
            </button>
          ))}
        </div>
      </Group>
      <details className="pillar-adv">
        <summary>Advanced</summary>
        <div className="grid3">
          <NumField label="X" unit="m" value={it.x} step={0.01} live={false} onChange={(x) => set({ x })} />
          <NumField label="Y" unit="m" value={it.y} step={0.01} live={false} onChange={(y) => set({ y })} />
        </div>
      </details>
      <p className="hint">Drag it in the plan; the corner handles resize it. Furniture keeps clear of it.</p>
      <button className="btn danger" onClick={() => remove("item", it.id)}>
        <TrashIcon size={14} /> Delete
      </button>
    </HudPanel>
  );
}
