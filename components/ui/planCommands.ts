"use client";
import { createPlan } from "@/lib/activePlan";
import type { Dashboard } from "@/lib/dbApi";
import { countsText } from "@/lib/planLabels";
import type { Cmd } from "./paletteCommands";
import { copyPlanLink, goToPlan, say, type PlansIntent } from "./planUi";

type Ctx = { list: Dashboard[] | null; activeId: number | null; onPlans: (intent?: PlansIntent) => void; showPlans: () => void };

/** "Switch plan..." narrows the palette to one row per plan; picking a row shows that plan. */
export function switchCommands(list: Dashboard[] | null, activeId: number | null): Cmd[] {
  return (list ?? []).map((d) => ({
    id: `plan:${d.id}`,
    group: "Plans",
    label: d.name,
    hay: `switch plan ${d.name} ${d.description}`,
    meta: d.id === activeId ? "Shown now" : countsText(d.summary),
    run: () => void goToPlan(d.id),
  }));
}

/** The plan actions of the palette. Rename and Delete open the plan manager on that plan (a name needs a form, a delete needs its question). */
export function planCommands({ list, activeId, onPlans, showPlans }: Ctx): Cmd[] {
  const out: Cmd[] = [];
  const act = (id: string, label: string, run: () => void, meta?: string, stay?: boolean) => out.push({ id: `plans:${id}`, group: "Plans", label, hay: `${label} ${meta ?? ""} plan dashboard`, meta, run, stay });
  if ((list?.length ?? 0) > 1) act("switch", "Switch plan...", showPlans, "Pick another plan", true);
  act("new", "New plan", () => onPlans({ do: "new" }), "Blank, starter, copy or file");
  if (activeId !== null) {
    act("duplicate", "Duplicate this plan", () => void createPlan({ from: "duplicate", sourceId: activeId }).then((d) => say(`Copied as "${d.name}" and shown now.`), () => undefined), "A copy to try things on"); // a failure is shown by the plan messages
    act("rename", "Rename this plan", () => onPlans({ do: "edit", id: activeId }), "Name, icon, colour");
    act("delete", "Delete this plan", () => onPlans({ do: "delete", id: activeId }), "Asks first, Undo right after");
    act("link", "Copy link to this plan", () => void copyPlanLink(activeId), "Opens this plan on any device");
  }
  act("manage", "Manage plans", () => onPlans(), "All your plans");
  act("homes", "Manage homes", () => onPlans({ do: "homes" }), "Connect another Home Assistant, one per plan");
  return out;
}
