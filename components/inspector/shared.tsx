"use client";
import type { ReactNode } from "react";
import { findLevel, levelIdOf } from "@/lib/levels";
import type { Swatch } from "@/lib/palette";
import type { Plan } from "@/lib/types";
import MonoLabel from "../ui/MonoLabel";
import "./compactInspector.css";

export function Group({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className ? `field ${className}` : "field"} role="group" aria-label={label}>
      <MonoLabel>{label}</MonoLabel>
      {children}
    </div>
  );
}

export function ColorPicker({ value, swatches, onChange }: { value: string; swatches: Swatch[]; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {swatches.map((s) => (
        <button key={s.name} title={s.name} aria-label={s.name} aria-pressed={value.toLowerCase() === s.c} className={value.toLowerCase() === s.c ? "swatch active" : "swatch"} style={{ background: s.c }} onClick={() => onChange(s.c)} />
      ))}
      <input className="swatch-custom" type="color" value={value} onChange={(e) => onChange(e.target.value)} title="Custom colour" aria-label="Custom colour" />
    </div>
  );
}

/** Small mono tag with the name of the level an entity is on. */
export function LevelTag({ plan, entity }: { plan: Plan; entity: { level?: string } }) {
  return <span className="level-tag" title="Level">{findLevel(plan, levelIdOf(plan, entity)).name}</span>;
}
