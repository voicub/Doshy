"use client";
import { useStore } from "@/lib/store";
import { findLevel, sortedLevels } from "@/lib/levels";
import "./LevelSwitcher.css";

const m = (n: number) => `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(2)} M`;

/** Level chips under the brand, lowest storey first. One level: a quiet tag with its name and elevation. */
export default function LevelSwitcher() {
  const plan = useStore((s) => s.plan);
  const active = useStore((s) => s.activeLevel);
  const setActive = useStore((s) => s.setActiveLevel);
  const levels = sortedLevels(plan);
  const current = findLevel(plan, active);

  if (levels.length < 2) {
    return <div className="levels single" role="status" aria-label={`${current.name}, elevation ${current.elevation.toFixed(2)} metres`}>{`${current.name} ${m(current.elevation)}`}</div>;
  }
  return (
    <div className="levels" role="group" aria-label="Level">
      {levels.map((l) => (
        <button key={l.id} type="button" className={`level-chip ${l.id === current.id ? "active brackets" : ""}`} aria-pressed={l.id === current.id} onClick={() => setActive(l.id)} title="PageUp / PageDown change level">
          <span>{l.name}</span>
          <small>{m(l.elevation)}</small>
        </button>
      ))}
    </div>
  );
}
