"use client";
import { useState } from "react";
import { CATALOG } from "@/lib/catalog";
import { levelIdOf } from "@/lib/levels";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { Group } from "./shared";
import "./railingStyle.css";

/** Every railing kind, as the chips offer them: the metal bars and the five glass fixings (all 1 m modules; the item keeps its own length). */
const STYLES: { kind: string; label: string }[] = [
  { kind: "balcony_railing", label: "Metal bars" },
  { kind: "gd_railing_glass_handrail_1", label: "Glass + steel rail" },
  { kind: "gd_railing_glass_frameless_1", label: "Frameless glass" },
  { kind: "gd_railing_glass_black_1", label: "Glass, black posts" },
  { kind: "gd_railing_glass_standoff_1", label: "Glass on stand-offs" },
  { kind: "gd_railing_glass_wood_1", label: "Glass + oak rail" },
];
const FAMILY = new Set<string>(["balcony_railing", ...Object.keys(CATALOG).filter((k) => k.startsWith("gd_railing_glass_"))]);

/** Is this kind a balcony railing (metal or glass)? */
export const isRailing = (kind: string) => FAMILY.has(kind);

/** Pick another look for a railing: this piece, or (default) every railing on the level at once, so a whole balcony changes in one click. One undo step. */
export default function RailingStyle({ item }: { item: Item }) {
  const editPlan = useStore((s) => s.editPlan);
  const [all, setAll] = useState(true);
  const current = STYLES.find((s) => item.kind === s.kind || (item.kind.startsWith("gd_railing_glass_") && s.kind.startsWith(item.kind.replace(/_[\d_]+$/, "")))) ?? STYLES[0];
  const apply = (kind: string) =>
    editPlan((plan) => {
      const lv = levelIdOf(plan, item);
      return { ...plan, items: plan.items.map((it) => ((all ? isRailing(it.kind) && levelIdOf(plan, it) === lv : it.id === item.id) ? { ...it, kind } : it)) };
    });
  return (
    <Group label="Railing style">
      <div className="rail-styles" role="group" aria-label="Railing style">
        {STYLES.map((s) => (
          <button key={s.kind} type="button" className="preset" aria-pressed={s.kind === current.kind} onClick={() => apply(s.kind)}>
            {s.label}
          </button>
        ))}
      </div>
      <label className="rail-all">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Change every railing on this level
      </label>
    </Group>
  );
}
