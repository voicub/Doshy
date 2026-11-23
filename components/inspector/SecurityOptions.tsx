"use client";
import { FOV_MAX, FOV_MIN, FOV_PRESETS, RANGE_MAX, RANGE_MIN, fovOf, presetOf } from "@/lib/cameraFov";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { calibrationOf, reportedPosition } from "@/lib/vacuumDrive";
import NumField from "../ui/NumField";
import { Group } from "./shared";
import "./securityOptions.css";

const MOUNTS = [
  { label: "Shelf", elev: 1.5 },
  { label: "High on the wall", elev: 2.3 },
];
const UNITS = [
  { label: "Metres", scale: 1 },
  { label: "Centimetres", scale: 0.01 },
  { label: "Millimetres", scale: 0.001 },
];

/** Set one or more per-piece options without losing the others. */
function useParams(it: Item) {
  const patch = useStore((s) => s.patch);
  return (p: Record<string, number>) => patch("item", it.id, { params: { ...it.params, ...p } });
}

/** What a camera sees (shown as a cone while furnishing): Wide / Normal / Narrow, with the exact angle and range under Advanced. */
export function CameraOptions({ item }: { item: Item }) {
  const set = useParams(item);
  const patch = useStore((s) => s.patch);
  const { fov, range } = fovOf(item);
  const preset = presetOf(fov, range);
  return (
    <>
      <Group label="What it sees">
        <div className="presets" role="group" aria-label="Field of view">
          {FOV_PRESETS.map((p) => (
            <button key={p.id} type="button" className="preset" aria-pressed={preset === p.id} onClick={() => set({ fov: p.fov, range: p.range })}>
              {p.label}
            </button>
          ))}
        </div>
        <small className="field-note">The cyan cone on the floor shows the view. Turn the camera to aim it.</small>
        <details className="sec-adv">
          <summary>Advanced</summary>
          <div className="grid3">
            <NumField label="Angle" unit="deg" value={fov} min={FOV_MIN} max={FOV_MAX} step={5} onChange={(v) => set({ fov: v })} />
            <NumField label="Range" unit="m" value={range} min={RANGE_MIN} max={RANGE_MAX} step={0.5} onChange={(v) => set({ range: v })} />
          </div>
        </details>
      </Group>
      <Group label="Mount">
        <div className="presets" role="group" aria-label="Camera height">
          {MOUNTS.map((m) => (
            <button key={m.label} type="button" className="preset" aria-pressed={(item.elev ?? 0) === m.elev} onClick={() => patch("item", item.id, { elev: m.elev })}>
              {m.label}
            </button>
          ))}
        </div>
      </Group>
    </>
  );
}

/**
 * Linking a vacuum: say whether the robot follows a made-up route or the vacuum's own position. Only a vacuum that reports a position has anything to set;
 * `calScale` (metres per reported unit) and `calX` / `calY` (offset, m) map its numbers onto the plan.
 */
export function VacuumPosition({ item }: { item: Item }) {
  const attrs = useStore((s) => (item.entity ? s.states[item.entity]?.attributes : undefined));
  const set = useParams(item);
  const raw = reportedPosition(attrs);
  const cal = calibrationOf(item.params);
  if (!item.entity) return null;
  if (!raw) {
    return (
      <Group label="Robot movement">
        <small className="field-note">Simulated path: this vacuum does not report where it is, so the robot follows a made-up route that matches what it is doing.</small>
      </Group>
    );
  }
  return (
    <Group label="Robot movement">
      <small className="field-note">Live position: this vacuum reports where it is. Pick the unit it uses; the robot follows it on the plan.</small>
      <div className="presets" role="group" aria-label="Position unit">
        {UNITS.map((u) => (
          <button key={u.label} type="button" className="preset" aria-pressed={cal.scale === u.scale} onClick={() => set({ calScale: u.scale })}>
            {u.label}
          </button>
        ))}
      </div>
      <details className="sec-adv">
        <summary>Advanced</summary>
        <div className="grid3">
          <NumField label="Shift X" unit="m" value={cal.x} step={0.1} onChange={(v) => set({ calX: v })} />
          <NumField label="Shift Y" unit="m" value={cal.y} step={0.1} onChange={(v) => set({ calY: v })} />
        </div>
        <small className="field-note">Reported now: {raw.x}, {raw.y}</small>
      </details>
    </Group>
  );
}
