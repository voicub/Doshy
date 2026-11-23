"use client";
import { useStore } from "@/lib/store";
import { levelsOf } from "@/lib/levels";
import MonoLabel from "./MonoLabel";
import "./LevelViewToggle.css";

const OPTIONS = [["all", "All"], ["upTo", "Up to here"], ["only", "Only here"]] as const;

/** Which storeys the Live scene shows. Only offered when the building has more than one level. */
export default function LevelViewToggle() {
  const many = useStore((s) => levelsOf(s.plan).length > 1);
  const mode = useStore((s) => s.levelView);
  const setMode = useStore((s) => s.setLevelView);
  if (!many) return null;
  return (
    <div className="hud levelview brackets" role="group" aria-label="Levels shown">
      <MonoLabel>Levels</MonoLabel>
      <div className="seg">
        {OPTIONS.map(([v, label]) => (
          <button key={v} type="button" aria-pressed={v === mode} onClick={() => setMode(v)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
