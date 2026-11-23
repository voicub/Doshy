import { itemGrid, MODULE_MOUNT_H, snapTo, type Guide } from "@/lib/editMath";
import { collisionWalls } from "@/lib/placement";
import { floorY } from "@/lib/levels";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { floorAt, placing, st, ui, type Ctx, type Mods } from "./controllerCtx";
import type { Ghost } from "./editStore";
import { useInsets } from "./insetStore";
import { pickBridge } from "./pickBridge";
import { isCoarse } from "./pointerKind";
import { activeLv, familyOf, ghostAt } from "./place";

/** Show (or clear) the module snap guides and tag of the item being dragged. */
export function showSnap(sn: { label: string | null; guides: Guide[] } | null, it: Item) {
  const next = sn ? { label: sn.label, guides: sn.guides, lv: floorY(st().plan, it) } : null;
  if (next || ui().snap) ui().set({ snap: next });
}

export function updateGhost(c: Ctx, e: Mods, kind: string | null) {
  const p = kind ? floorAt(c, e, familyOf(kind) ? MODULE_MOUNT_H : 0) : null;
  if (!kind || !p) {
    if (ui().ghost) ui().set({ ghost: null });
    return null;
  }
  const grid = itemGrid(e);
  const at = { x: snapTo(p.x, grid), y: snapTo(p.y, grid) };
  const rot = ui().placeRot;
  const lv = activeLv();
  const plan = st().plan;
  const g = ghostAt(kind, at, rot, plan, lv.id, !e.altKey, collisionWalls(plan, undefined, lv.id));
  if (!g) return null;
  const ghost = { kind, x: g.x, y: g.y, rot: g.rot, blocked: g.blocked, elev: g.elev };
  ui().set({ ghost, cursor: at, snap: g.snap?.label ? { label: g.snap.label, guides: g.snap.guides, lv: lv.y } : null });
  return ghost;
}

/** Put the piece down at `g` (where its ghost stands). */
function commit(kind: string, g: Ghost, keep: boolean) {
  const s = st();
  s.beginEdit();
  s.addItem(kind, g.x, g.y); // the store stamps the active level
  const sel = st().sel;
  if (sel && (g.rot || g.elev)) st().patch("item", sel.id, { rot: g.rot, ...(g.elev ? { elev: g.elev } : {}) });
  st().endEdit();
  ui().remember(kind);
  ui().set({ snap: null });
  if (keep) st().setTool(`add:${kind}`);
  else ui().set({ ghost: null });
}

export function place(c: Ctx, kind: string, keep: boolean, e: Mods) {
  const g = updateGhost(c, e, kind);
  if (g) commit(kind, g, keep); // a blocked cursor still places: the item lands at the nearest valid spot, as the ghost shows
}

/**
 * Touch placement: the piece waits as a ghost in the middle of the visible canvas, a tap moves it, the placement bar confirms.
 * Returns the unsubscribe of the tool watcher.
 */
export function installTouchPlacement(c: Ctx): () => void {
  const middleOfView = (): Mods => {
    const r = c.el.getBoundingClientRect();
    const free = useInsets.getState().free ?? { x0: 0, y0: 0, x1: r.width, y1: r.height };
    return { clientX: r.left + (free.x0 + free.x1) / 2, clientY: r.top + (free.y0 + free.y1) / 2, shiftKey: false, altKey: false };
  };
  const armGhost = () => {
    const kind = placing();
    if (c.furniture && kind && isCoarse()) updateGhost(c, middleOfView(), kind);
  };
  pickBridge.confirmPlace = () => {
    const kind = placing();
    const g = ui().ghost; // not re-aimed from the screen: the view may have shifted since (a sheet closed)
    if (kind && g && g.kind === kind) commit(kind, g, false);
  };
  const unsubTool = useStore.subscribe((s, p) => s.tool !== p.tool && armGhost());
  armGhost();
  return unsubTool;
}
