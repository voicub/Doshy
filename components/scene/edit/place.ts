import { CATALOG } from "@/lib/catalog";
import { MODULE_MOUNT_H, snapModule, type Guide, type ModuleBox } from "@/lib/editMath";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { classify, clearWalls, settleItem, type Footprint, type Placement, type Settled } from "@/lib/placement";
import { useStore } from "@/lib/store";
import type { Item, Plan, Pt, Wall } from "@/lib/types";

export const fp = (it: Pick<Item, "x" | "y" | "w" | "d" | "rot">): Footprint => ({ x: it.x, y: it.y, w: it.w, d: it.d, rot: it.rot });
export const clsOf = (kind: string, h?: number): Placement => (CATALOG[kind] ? classify(CATALOG[kind], kind) : classify({ h: h ?? 1 }, kind));

/** The level being edited and the height of its finished floor (world metres). */
export function activeLv(): { id: string; y: number } {
  const { plan, activeLevel } = useStore.getState();
  const id = levelIdOf(plan, { level: activeLevel });
  return { id, y: elevationOf(plan, id) };
}

/** The modular family of a catalog kind ("eket"), if any. */
export const familyOf = (kind: string): string | undefined => CATALOG[kind]?.family;

/** The modules a piece of `family` can snap to: same family, same level, not itself. */
function neighbours(plan: Plan, family: string, levelId: string, exceptId?: string): ModuleBox[] {
  return plan.items
    .filter((i) => i.id !== exceptId && CATALOG[i.kind]?.family === family && levelIdOf(plan, i) === levelId)
    .map((i) => ({ x: i.x, y: i.y, w: i.w, d: i.d, h: i.h, rot: i.rot, elev: i.elev ?? 0 }));
}

export type Snapped = { x: number; y: number; elev: number; label: string | null; guides: Guide[] };

/** Module snapping for a piece of a family at its settled spot (`axes` limits what may move; the elevation gizmo passes height only). */
export function snapModuleItem(it: Pick<Item, "w" | "d" | "h">, at: { x: number; y: number; rot: number; elev: number }, family: string, plan: Plan, levelId: string, exceptId: string | undefined, axes?: { u?: boolean; n?: boolean; v?: boolean }): Snapped {
  const s = snapModule({ ...at, w: it.w, d: it.d, h: it.h }, neighbours(plan, family, levelId, exceptId), { axes });
  return { x: s.x, y: s.y, elev: s.elev, label: s.label, guides: s.guides };
}

/**
 * Where a catalog item lands for this cursor point: settled against walls like a drag (the walls and solid items of `levelId`); `blocked` when the
 * cursor itself is not a valid spot. A modular piece also snaps to its neighbours and takes the default wall-mount height.
 */
export function ghostAt(kind: string, p: Pt, rot: number, plan: Plan, levelId: string, snap: boolean, walls: Wall[]): (Settled & { blocked: boolean; elev?: number; snap?: Snapped }) | null {
  const def = CATALOG[kind];
  if (!def) return null;
  const f: Footprint = { x: p.x, y: p.y, w: def.w, d: def.d, rot };
  const cls = classify(def, kind);
  // start from the cursor pushed out of any wall (not from the last ghost) so the ghost can follow the cursor into another room
  const from = { ...f, ...clearWalls(f, walls, cls) };
  const free = settleItem(from, p, walls, cls, false);
  const settled = settleItem(from, p, walls, cls, snap);
  const blocked = Math.hypot(free.x - p.x, free.y - p.y) > 0.01;
  if (!def.family) return { ...settled, blocked };
  const elev = MODULE_MOUNT_H;
  if (!snap) return { ...settled, blocked, elev };
  const m = snapModuleItem(def, { ...settled, elev }, def.family, plan, levelId, undefined);
  const fixed = clearWalls({ ...f, x: m.x, y: m.y, rot: settled.rot }, walls, cls);
  return { x: fixed.x, y: fixed.y, rot: settled.rot, blocked, elev: m.elev, snap: m };
}
