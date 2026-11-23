import { CATALOG } from "@/lib/catalog";
import type { HAState } from "@/lib/ha";
import type { Plan } from "@/lib/types";
import type { Cand } from "./editStore";

/** Plain-words name of a pick target, plus its Home Assistant link (entity and state) when it has one. */
export function describePick(plan: Plan, states: Record<string, HAState>, c: Cand): { name: string; sub?: string } {
  if (c.type === "room") return { name: plan.rooms.find((r) => r.id === c.id)?.name ?? "Room" };
  if (c.type === "opening") {
    const o = plan.openings.find((x) => x.id === c.id);
    const name = o ? o.type[0].toUpperCase() + o.type.slice(1) : "Door or window";
    return { name, sub: o?.entity && `${o.entity} / ${states[o.entity]?.state ?? "not found"}` };
  }
  const it = plan.items.find((i) => i.id === c.id);
  if (!it) return { name: "Item" };
  const st = it.entity ? states[it.entity] : undefined;
  const label = CATALOG[it.kind]?.label ?? it.kind;
  return { name: st?.attributes.friendly_name ?? label, sub: it.entity && `${it.entity} / ${st?.state ?? "not found"}` };
}
