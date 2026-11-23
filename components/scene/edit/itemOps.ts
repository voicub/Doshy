import { CATALOG } from "@/lib/catalog";
import { snapElev } from "@/lib/editMath";
import { clearWalls, collisionWalls } from "@/lib/placement";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { clsOf, fp } from "./place";

export const COPY_OFFSET = 0.3;
const LIFT = 0.05;
const LIFT_FINE = 0.01;

const itemById = (id: string): Item | undefined => useStore.getState().plan.items.find((i) => i.id === id);

/** One-shot edit: a single undo step even when it touches several things. */
export function once(fn: () => void) {
  const s = useStore.getState();
  if (s.gesture) return fn();
  s.beginEdit();
  fn();
  s.endEdit();
}

/** Add a copy of `src` at (x, y) as one undo step, the copy selected; the Home Assistant link is not copied (it would drive the same device twice). */
export function cloneItem(src: Item, x: number, y: number, rot = src.rot) {
  once(() => {
    const s = useStore.getState();
    s.addItem(src.kind, x, y);
    const id = useStore.getState().sel?.id;
    if (id) useStore.getState().patch("item", id, { rot, w: src.w, d: src.d, h: src.h, color: src.color, elev: src.elev });
  });
}

/** Copy of an item beside it: a modular piece flush along its wall, anything else 0.3 m diagonally. */
export function duplicateItem(src: Item) {
  const a = (src.rot * Math.PI) / 180;
  const modular = !!CATALOG[src.kind]?.family;
  cloneItem(src, src.x + (modular ? Math.cos(a) * src.w : COPY_OFFSET), src.y + (modular ? Math.sin(a) * src.w : COPY_OFFSET));
}

/** Turn an item by `deg` (negative = anticlockwise), pushed off any wall it would turn into. Locked items stay put. */
export function turnItem(id: string, deg: number) {
  const s = useStore.getState();
  const it = itemById(id);
  if (!it || it.locked) return;
  const rot = (((it.rot + deg) % 360) + 360) % 360;
  s.patch("item", id, { rot, ...clearWalls({ ...fp(it), rot }, collisionWalls(s.plan, id), clsOf(it.kind, it.h)) });
}

/** Raise (dir 1) or lower (-1) an item by 5 cm, 1 cm when `fine`; never below the floor. Locked items stay put. */
export function liftItem(id: string, dir: 1 | -1, fine: boolean) {
  const it = itemById(id);
  if (!it || it.locked) return;
  const elev = snapElev((it.elev ?? 0) + dir * (fine ? LIFT_FINE : LIFT), { shiftKey: false, altKey: true });
  if (elev !== (it.elev ?? 0)) useStore.getState().patch("item", id, { elev: elev || undefined });
}

/** Lock or unlock an item: one undo step. */
export function toggleLock(id: string) {
  const it = itemById(id);
  if (it) useStore.getState().patch("item", id, { locked: it.locked ? undefined : true });
}
