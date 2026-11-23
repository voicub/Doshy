"use client";
import { LockSimpleIcon, LockSimpleOpenIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CATALOG, FINISHES, type Def } from "@/lib/catalog";
import { WALL_H } from "@/lib/geometry";
import { levelIdOf, planOfLevel } from "@/lib/levels";
import { collisionWalls } from "@/lib/placement";
import { typedItemPatch } from "@/lib/planOps";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import HudPanel from "../ui/HudPanel";
import NumField from "../ui/NumField";
import { Group } from "./shared";
import CarPaint from "./CarPaint";
import { CameraOptions } from "./SecurityOptions";
import CritterOptions from "./CritterOptions";
import RailingStyle, { isRailing } from "./RailingStyle";
import { isCarKind } from "@/lib/cars";
import { ColourField } from "./PaintPanel";
import RoomItems from "./RoomItems";
import { toggleLock } from "../scene/edit/itemOps";
import { useVp } from "@/lib/useVp";
import { closeInspector } from "./closeInspector";
import "./lock.css";

/** Common heights above the floor for things sitting on furniture or hung on a wall. */
const ELEV_PRESETS = [
  { v: 0, label: "Floor" },
  { v: 0.75, label: "Desk top" },
  { v: 0.9, label: "Worktop" },
  { v: 1.85, label: "Fridge top" },
];

/** Lock a rug or a fixed piece so clicks and drags go to what stands on it. */
function LockGroup({ item }: { item: Item }) {
  return (
    <Group label="Lock" className="ins-lock">
      <div className="lock-row">
        <p className="hint">{item.locked ? "Locked: the mouse and the keys leave it alone. Pick it from the list below, or unlock it here." : "Lock a rug or a fixed piece so clicks and drags go to what stands on it."}</p>
        <button type="button" className="btn" aria-pressed={!!item.locked} onClick={() => toggleLock(item.id)}>
          {item.locked ? <LockSimpleIcon size={14} aria-hidden /> : <LockSimpleOpenIcon size={14} aria-hidden />}
          {item.locked ? "Unlock" : "Lock"}
        </button>
      </div>
    </Group>
  );
}

type TypedProps = { item: Item; typed: (p: Partial<Item>) => void };

/** Where it stands and which way it faces; `notice` says when a typed spot was moved out of a wall. */
function PositionGroup({ item: it, typed, notice }: TypedProps & { notice: string | null }) {
  return (
    <Group label="Position" className="ins-pos">
      <div className="grid3">
        <NumField label="X" unit="m" value={it.x} step={0.01} live={false} onChange={(x) => typed({ x })} />
        <NumField label="Y" unit="m" value={it.y} step={0.01} live={false} onChange={(y) => typed({ y })} />
        <NumField label="Rotation" unit="deg" value={it.rot} step={15} live={false} onChange={(rot) => typed({ rot: ((rot % 360) + 360) % 360 })} />
      </div>
      <div className="presets compact-only" role="group" aria-label="Turn">
        <button type="button" className="preset" onClick={() => typed({ rot: (it.rot + 90) % 360 })}>Turn 90 deg</button>
      </div>
      {notice && <small className="field-note warn" role="status">{notice}</small>}
    </Group>
  );
}

/** Width, depth and height, and what the stairs do to the floors around them. */
function SizeGroup({ item: it, def, typed, set }: TypedProps & { def: Def; set: (p: Partial<Item>) => void }) {
  return (
    <>
      <Group label="Size" className="ins-size">
        <div className="grid3">
          <NumField label="Width" unit="m" value={it.w} min={0.05} live={false} onChange={(w) => typed({ w })} />
          <NumField label="Depth" unit="m" value={it.d} min={0.05} live={false} onChange={(d) => typed({ d })} />
          <NumField label="Height" unit="m" value={it.h} min={0.01} onChange={(h) => set({ h })} />
        </div>
      </Group>
      {def.stair && def.stair !== "step" && <p className="hint ins-size">{def.stair === "up" ? "The floor above gets its opening automatically and keeps up when you move or turn these stairs." : "Opens this floor for the way down, and follows these stairs."} Height is the storey it spans.</p>}
    </>
  );
}

/** How high above the floor it sits. */
function ElevationGroup({ item, set }: { item: Item; set: (p: Partial<Item>) => void }) {
  const elev = item.elev ?? 0;
  return (
    <Group label="Elevation" className="ins-elev">
      <NumField label="Height from floor" unit="m" value={elev} min={0} max={WALL_H} step={0.05} onChange={(v) => set({ elev: v || undefined })} />
      <div className="presets" role="group" aria-label="Elevation presets">
        {ELEV_PRESETS.map((p) => (
          <button key={p.v} type="button" className="preset" aria-pressed={Math.abs(elev - p.v) < 1e-6} onClick={() => set({ elev: p.v || undefined })}>
            {p.label} {p.v}
          </button>
        ))}
      </div>
    </Group>
  );
}

/** What it looks like: paint (cars), critter options, railing style, or a plain finish. */
function LookGroup({ item: it, def, set }: { item: Item; def: Def; set: (p: Partial<Item>) => void }) {
  return (
    <div className="ins-look">
      {isCarKind(it.kind) && <CarPaint item={it} set={set} />}
      {def.critter && <CritterOptions item={it} />}
      {isRailing(it.kind) && <RailingStyle item={it} />}
      {!isCarKind(it.kind) && !def.critter && (it.color || def.parts.some((p) => p.m)) && (
        <Group label="Finish">
          <ColourField undoable lead={FINISHES} value={it.color ?? null} reset="Original" onChange={(color) => set({ color: color ?? undefined })} />
        </Group>
      )}
    </div>
  );
}

/** A piece of furniture: where it stands, how big it is, how high it sits and what it looks like. Home Assistant links live in the Home Assistant mode. */
export default function FurnitureInspector({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const compact = useVp().vp !== "regular";
  const [notice, setNotice] = useState<string | null>(null);
  const it = plan.items.find((i) => i.id === id);
  const def = it && CATALOG[it.kind];
  if (!it || !def) return null;

  const set = (p: Partial<Item>) => patch("item", it.id, p);
  /** Typed position, size or rotation: stopped by walls and solid items exactly like a drag. */
  const typed = (p: Partial<Item>) => {
    const { patch: out, moved } = typedItemPatch(collisionWalls(planOfLevel(plan, levelIdOf(plan, it)), it.id), it, def, p);
    set(out);
    setNotice(moved ? `Moved to X ${out.x?.toFixed(2)} Y ${out.y?.toFixed(2)} m: that spot is inside a wall.` : null);
  };
  const lock = <LockGroup item={it} />;
  const camera = /^sec_(cam|doorbell)/.test(it.kind) && <CameraOptions item={it} />;

  return (
    <HudPanel title="Furniture" meta={def.brand} onClose={closeInspector} className="inspector">
      <h3 className="hud-name">{def.label}</h3>
      <PositionGroup item={it} typed={typed} notice={notice} />
      <SizeGroup item={it} def={def} typed={typed} set={set} />
      <ElevationGroup item={it} set={set} />
      {!compact && lock}
      {!compact && camera}
      <LookGroup item={it} def={def} set={set} />
      {compact ? (
        <details className="adv">
          <summary>Advanced</summary>
          <div className="adv-body">
            {lock}
            {camera}
            <RoomItems type="item" id={it.id} />
          </div>
        </details>
      ) : (
        <RoomItems type="item" id={it.id} />
      )}
      <button className="btn danger ins-del" onClick={() => remove("item", it.id)}>
        <TrashIcon size={14} /> Delete
      </button>
    </HudPanel>
  );
}
