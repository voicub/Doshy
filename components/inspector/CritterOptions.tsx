"use client";
import { CATALOG } from "@/lib/catalog";
import { BEHAVIOUR, ROAM_MAX, SCALE_MAX, SCALE_MIN, coatSwatches, critterParams, type Pose } from "@/lib/critters";
import { clamp } from "@/lib/mathUtil";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import MonoLabel from "../ui/MonoLabel";
import { withParams } from "./itemParams";
import { ColorPicker, Group } from "./shared";
import "./critterOptions.css";

const POSES: { id: Pose; label: string }[] = [
  { id: "stand", label: "Stand" },
  { id: "sit", label: "Sit" },
  { id: "lie", label: "Lie" },
];
const SPEEDS = [
  { v: 0.6, label: "Slow" },
  { v: 1, label: "Normal" },
  { v: 1.5, label: "Quick" },
];

/** What an animal looks like and does: coat, pose, whether it wanders (live view) and how far, size. Plain words, one chip each. */
export default function CritterOptions({ item }: { item: Item }) {
  const patch = useStore((s) => s.patch);
  const def = CATALOG[item.kind];
  const spec = def?.critter;
  if (!def || !spec) return null;
  const par = critterParams(item.params, spec);
  const start = spec.roam ?? BEHAVIOUR[spec.kind].roam;
  const setParams = (o: Record<string, number | string | undefined>) => patch("item", item.id, { params: withParams(item.params, o) });
  const scale = Math.round(clamp(item.w / def.w, SCALE_MIN, SCALE_MAX) * 100) / 100;
  const setScale = (k: number) => patch("item", item.id, { w: Math.round(def.w * k * 1000) / 1000, d: Math.round(def.d * k * 1000) / 1000, h: Math.round(def.h * k * 1000) / 1000 });
  const value = item.color ?? spec.coats[0];
  const swatches = coatSwatches(spec.coats);
  /** One slider drag is one undo step. */
  const gesture = { onPointerDown: () => useStore.getState().beginEdit(), onPointerUp: () => useStore.getState().endEdit(), onBlur: () => useStore.getState().gesture && useStore.getState().endEdit() };
  return (
    <div className="critter-opts">
      <Group label="Coat">
        <ColorPicker value={value} swatches={swatches} onChange={(c) => patch("item", item.id, { color: c === spec.coats[0] ? undefined : c })} />
        {item.color && item.color !== spec.coats[0] && (
          <button type="button" className="preset" onClick={() => patch("item", item.id, { color: undefined })}>
            Back to natural
          </button>
        )}
      </Group>
      {spec.roam !== 0 && (
        <Group label="Moving about">
          <div className="presets" role="group" aria-label="Wandering">
            <button type="button" className="preset" aria-pressed={par.roam > 0} onClick={() => setParams({ roam: par.roam > 0 ? undefined : start })}>
              Let it wander
            </button>
          </div>
          {par.roam > 0 ? (
            <>
              <label className="critter-slider">
                <MonoLabel>Wanders within {par.roam.toFixed(1)} m</MonoLabel>
                <input type="range" className="rng" min={0.5} max={ROAM_MAX} step={0.25} value={par.roam} aria-valuetext={`${par.roam.toFixed(1)} metres`} onChange={(e) => setParams({ roam: Number(e.target.value) })} {...gesture} />
              </label>
              <div className="presets" role="group" aria-label="Walking speed">
                {SPEEDS.map((s) => (
                  <button key={s.v} type="button" className="preset" aria-pressed={par.speed === s.v} onClick={() => setParams({ speed: s.v === 1 ? undefined : s.v })}>
                    {s.label}
                  </button>
                ))}
              </div>
              <small className="field-note">The dashed ring shows how far it goes. In Live view it walks round walls and furniture, rests by its house and sleeps at night.</small>
            </>
          ) : (
            <small className="field-note">Off: it stays where you put it.</small>
          )}
        </Group>
      )}
      {par.roam === 0 && spec.poses.length > 1 && (
        <Group label="Pose">
          <div className="presets" role="group" aria-label="Pose">
            {POSES.filter((p) => spec.poses.includes(p.id)).map((p) => (
              <button key={p.id} type="button" className="preset" aria-pressed={par.pose === p.id} onClick={() => setParams({ pose: p.id === "stand" ? undefined : p.id })}>
                {p.label}
              </button>
            ))}
          </div>
        </Group>
      )}
      <Group label="Size">
        <label className="critter-slider">
          <MonoLabel>{Math.round(scale * 100)} % of normal</MonoLabel>
          <input type="range" className="rng" min={SCALE_MIN} max={SCALE_MAX} step={0.05} value={scale} aria-valuetext={`${Math.round(scale * 100)} percent`} onChange={(e) => setScale(Number(e.target.value))} {...gesture} />
        </label>
      </Group>
    </div>
  );
}
