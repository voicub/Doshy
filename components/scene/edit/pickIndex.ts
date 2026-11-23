import { CATALOG } from "@/lib/catalog";
import { WALL_CUT_H } from "@/lib/geometry";
import { floorY, levelIdOf } from "@/lib/levels";
import { buildEntry, type PickEntry } from "@/lib/pickRank";
import type { Item, Plan } from "@/lib/types";
import { clsOf } from "./place";

/** The pick entries of the items the current editing view lets you pick: written by `Proxies`, read by the pointer logic. */
export const pickIndex: { entries: PickEntry[] } = { entries: [] };

const cache = new WeakMap<Item, PickEntry>();

/** Entries of the pickable items, in plan order. Only an item that changed (or whose floor moved) is rebuilt: a plan of 300 items stays cheap while one is dragged. */
export function entriesOf(plan: Plan, activeLevel: string | undefined, all: boolean): PickEntry[] {
  const level = levelIdOf(plan, { level: activeLevel });
  const out: PickEntry[] = [];
  plan.items.forEach((it, order) => {
    const def = CATALOG[it.kind];
    if (!def || def.pillar) return; // pillars are edited in Plan mode: still solid, never picked here
    if (!all && levelIdOf(plan, it) !== level) return;
    const lv = floorY(plan, it);
    let e = cache.get(it);
    if (!e || e.y !== lv || e.order !== order) {
      e = buildEntry(def, it, lv, order, { ceiling: clsOf(it.kind, it.h) === "ceiling", cutH: def.solid ? WALL_CUT_H : undefined });
      cache.set(it, e);
    }
    out.push(e);
  });
  return out;
}
