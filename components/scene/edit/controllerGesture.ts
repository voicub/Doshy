import { angleAround, dragTarget, grabOffset, itemGrid, rayPlane, rayVerticalPlane, ringRotation, snapElev } from "@/lib/editMath";
import { clearWalls, collisionWalls, settleItem, wallClearance } from "@/lib/placement";
import { floorY, levelIdOf } from "@/lib/levels";
import { pressTarget } from "@/lib/pickRank";
import type { Wall } from "@/lib/types";
import { aimAt, controls, cursor, gizmoUnderPointer, itemOf, rankAt, st, surfaceAt, ui, type Active, type Base, type Ctx } from "./controllerCtx";
import { showSnap } from "./controllerPlace";
import type { Clear } from "./editStore";
import { clsOf, familyOf, fp, snapModuleItem, type Snapped } from "./place";
import type { Item } from "@/lib/types";

export const CLICK_PX = 4; // a press that moves less than this is a click, not a drag
const RING_PLANE_Y = 0.09;
const RING_SNAP = 15;
const WALL_REACH = 8; // metres searched for clearance tags
const BLOCKED_EPS = 0.01;

const sameClear = (a: Clear | null, b: Clear) => !!a && a.n === b.n && a.e === b.e && a.s === b.s && a.w === b.w;
const cm = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

/** The edit begins and the camera controls step aside until the gesture ends. */
function lock(c: Ctx, a: Active, e: PointerEvent) {
  c.active = a;
  const ctl = controls(c);
  if (ctl) ctl.enabled = false;
  st().beginEdit();
  try {
    c.el.setPointerCapture(e.pointerId);
  } catch {
    /* the pointer is already gone: the window listeners still end the gesture */
  }
}

export function finish(c: Ctx, cancel: boolean) {
  const a = c.active;
  if (!a) return;
  c.active = null;
  c.pending = null;
  cancelAnimationFrame(c.raf);
  c.raf = 0;
  const ctl = controls(c);
  if (ctl) ctl.enabled = true;
  try {
    c.el.releasePointerCapture(a.pointer);
  } catch {
    /* already released */
  }
  st().endEdit();
  if (cancel && a.changed) st().undo(); // the gesture's single undo step, taken back
  ui().set({ gesture: null, clearance: null, snap: null });
  cursor(c, "");
}

/** A press on the selected piece's ring or arrow starts a rotate / lift; returns false when it cannot. */
function beginGizmo(c: Ctx, e: PointerEvent, g: "rotate" | "elev", base: Omit<Base, "id">): boolean {
  const s = st();
  const it = s.sel && itemOf(s.sel.id);
  if (!it) return false;
  const { o, d } = c.rayObj;
  const center = { x: it.x, y: it.y };
  if (g === "rotate") {
    const p = rayPlane(o, d, floorY(s.plan, it) + RING_PLANE_Y);
    if (!p) return false;
    lock(c, { ...base, mode: "rotate", id: it.id, center, startRot: it.rot, startAngle: angleAround(center, p) }, e);
    return true;
  }
  const len = Math.hypot(d.x, d.z) || 1;
  const normal = { x: -d.x / len, y: -d.z / len };
  const y = rayVerticalPlane(o, d, center, normal);
  if (y === null) return false;
  lock(c, { ...base, mode: "elev", id: it.id, center, normal, startElev: it.elev ?? 0, startY: y }, e);
  return true;
}

/** Shift-drag a module: leave the original in place and drag a copy (IKEA-style "add another"). */
function dragACopy(c: Ctx, it: Item) {
  const s = st();
  s.addItem(it.kind, it.x, it.y);
  const nid = st().sel?.id;
  if (!nid || !c.active) return;
  st().patch("item", nid, { rot: it.rot, w: it.w, d: it.d, h: it.h, color: it.color, elev: it.elev });
  c.active.id = nid;
  c.active.changed = true;
}

/** Pointer down in Furniture mode: grab a handle or the piece under the pointer (false: nothing to drag, the press is a click). */
export function beginAt(c: Ctx, e: PointerEvent): boolean {
  aimAt(c, e);
  const s = st();
  const base = { sx: e.clientX, sy: e.clientY, started: false, changed: false, pointer: e.pointerId };
  const g = gizmoUnderPointer(c);
  if (g && s.sel) return beginGizmo(c, e, g, base);
  const cands = rankAt(c, e);
  const hit = pressTarget(cands, s.sel?.id);
  c.sticky = !!hit && cands[0] !== hit;
  if (hit?.type !== "item") return false;
  const it = itemOf(hit.id);
  if (!it) return false;
  s.select({ type: "item", id: it.id });
  const lift = it.elev ?? 0;
  const p = rayPlane(c.rayObj.o, c.rayObj.d, floorY(s.plan, it) + lift); // the plane the item actually stands in: no parallax at the grab
  if (!p) return false;
  lock(c, { ...base, mode: "move", id: it.id, off: grabOffset(p, it), lift }, e);
  if (e.shiftKey && familyOf(it.kind) && c.active) dragACopy(c, it);
  return true;
}

type Step = { c: Ctx; e: PointerEvent; it: Item; walls: Wall[] };

/** One drag step of a move; the blocked flag, or null when the pointer is off any surface. */
function stepMove(k: Step, a: Extract<Active, { mode: "move" }>): boolean | null {
  const { c, e, it, walls } = k;
  const s = st();
  const cls = clsOf(it.kind, it.h);
  const f = fp(it);
  const p = surfaceAt(c, levelIdOf(s.plan, it), a.lift)?.p;
  if (!p) return null;
  const to = dragTarget(p, a.off, itemGrid(e));
  const settled = settleItem(f, to, walls, cls, !e.altKey, true); // Alt: no snapping, walls and solid items still block; a free spot anywhere (another room, the garden) is reached straight across the walls
  const free = settleItem(f, to, walls, cls, false, true);
  const blocked = cls !== "ceiling" && cls !== "flat" && Math.hypot(free.x - to.x, free.y - to.y) > BLOCKED_EPS;
  let at = { x: settled.x, y: settled.y, rot: settled.rot, elev: it.elev ?? 0 };
  const fam = familyOf(it.kind);
  let sn: Snapped | null = null;
  if (fam && !e.altKey) {
    // modules snap flush to neighbours of their family (side by side, stacked, back planes, 0.35 m grid); Alt disables
    sn = snapModuleItem(it, at, fam, s.plan, levelIdOf(s.plan, it), it.id);
    const fixed = clearWalls({ ...f, x: sn.x, y: sn.y, rot: settled.rot }, walls, cls);
    at = { x: fixed.x, y: fixed.y, rot: settled.rot, elev: sn.elev };
  }
  showSnap(sn?.label ? sn : null, it);
  if (at.x !== it.x || at.y !== it.y || at.rot !== it.rot || at.elev !== (it.elev ?? 0)) {
    s.patch("item", it.id, fam ? at : { x: at.x, y: at.y, rot: at.rot });
    a.changed = true;
  }
  const w = wallClearance({ ...f, ...settled }, walls, WALL_REACH);
  const clear = { n: cm(w.n), e: cm(w.e), s: cm(w.s), w: cm(w.w) };
  if (!sameClear(ui().clearance, clear)) ui().set({ clearance: clear });
  return blocked;
}

function stepRotate(k: Step, a: Extract<Active, { mode: "rotate" }>): boolean | null {
  const { c, e, it, walls } = k;
  const s = st();
  const p = rayPlane(c.rayObj.o, c.rayObj.d, floorY(s.plan, it) + RING_PLANE_Y);
  if (!p) return null;
  const rot = ringRotation(a.startRot, a.startAngle, angleAround(a.center, p), e.shiftKey ? 1 : e.altKey ? 0 : RING_SNAP);
  const pos = clearWalls({ ...fp(it), rot }, walls, clsOf(it.kind, it.h));
  const blocked = Math.hypot(pos.x - it.x, pos.y - it.y) > BLOCKED_EPS;
  if (rot !== it.rot || pos.x !== it.x || pos.y !== it.y) {
    s.patch("item", it.id, { rot, x: pos.x, y: pos.y });
    a.changed = true;
  }
  return blocked;
}

function stepElev(k: Step, a: Extract<Active, { mode: "elev" }>): boolean | null {
  const { c, e, it } = k;
  const s = st();
  const y = rayVerticalPlane(c.rayObj.o, c.rayObj.d, a.center, a.normal);
  if (y === null) return null;
  let elev = snapElev(a.startElev + (y - a.startY), e);
  const fam = familyOf(it.kind);
  if (fam && !e.altKey) {
    // a lifted module sticks to the heights of its neighbours (stacking, aligned edges, 0.35 m grid), else to the common mounting heights
    const sn = snapModuleItem(it, { x: it.x, y: it.y, rot: it.rot, elev: a.startElev + (y - a.startY) }, fam, s.plan, levelIdOf(s.plan, it), it.id, { u: false, n: false, v: true });
    elev = sn.elev;
    showSnap(sn.label ? sn : null, it);
  } else showSnap(null, it);
  if (elev !== (it.elev ?? 0)) {
    s.patch("item", it.id, { elev });
    a.changed = true;
  }
  return false;
}

/** Apply the latest pointer position to the gesture in progress (once per frame). */
export function apply(c: Ctx, e: PointerEvent) {
  const a = c.active;
  if (!a) return;
  if (!a.started) {
    if (Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < CLICK_PX) return;
    a.started = true;
    ui().set({ gesture: { id: a.id, mode: a.mode, blocked: false } });
    cursor(c, a.mode === "elev" ? "ns-resize" : "grabbing");
  }
  aimAt(c, e);
  const s = st();
  const it = itemOf(a.id);
  if (!it) return;
  const k: Step = { c, e, it, walls: collisionWalls(s.plan, it.id) };
  const blocked = a.mode === "move" ? stepMove(k, a) : a.mode === "rotate" ? stepRotate(k, a) : stepElev(k, a);
  if (blocked === null) return;
  if (blocked !== !!ui().gesture?.blocked) ui().set({ gesture: { id: a.id, mode: a.mode, blocked } });
}
