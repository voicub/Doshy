"use client";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { clamp } from "@/lib/mathUtil";
import NumField from "./ui/NumField";

export const toCm = (m: number) => Math.round(m * 1000) / 10;
export const toM = (cm: number) => Math.round(cm * 100) / 10000;

/** A number field with big minus / plus buttons either side (44 px on touch screens). Values are centimetres. */
export function Step({ label, value, onChange, step = 5, min = -3000, max = 3000, unit = "cm" }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string }) {
  const nudge = (dir: number) => onChange(clamp(Math.round((value + dir * step) * 10) / 10, min, max));
  return (
    <div className="pb-step">
      <button type="button" className="pb-bump" aria-label={`${label} less`} onClick={() => nudge(-1)}>
        <MinusIcon size={14} />
      </button>
      <NumField label={label} unit={unit} value={value} onChange={onChange} step={step} min={min} max={max} steppers={false} />
      <button type="button" className="pb-bump" aria-label={`${label} more`} onClick={() => nudge(1)}>
        <PlusIcon size={14} />
      </button>
    </div>
  );
}
