import { roomAt } from "@/lib/geometry";
import { levelIdOf, planOfLevel } from "@/lib/levels";
import { LONG_PRESS_MS, nextCycle } from "@/lib/pickMath";
import { tabNext, tabTarget, type Cand } from "@/lib/pickRank";
import { roomItems } from "@/lib/rooms";
import { cursor, floorAt, gizmoUnderPointer, itemOf, picking, placing, rankAt, rel, st, ui, type Client, type Ctx } from "./controllerCtx";
import { finish } from "./controllerGesture";
import { describePick } from "./pickInfo";
import { pickIndex } from "./pickIndex";

const TIP_DELAY_MS = 250;

export function hideTip(c: Ctx) {
  clearTimeout(c.tipTimer);
  if (ui().tip) ui().set({ tip: null });
}

export function cancelLong(c: Ctx) {
  if (c.lp) clearTimeout(c.lp.timer);
  c.lp = null;
}

const openChooser = (c: Ctx, all: readonly Cand[], e: Client) => {
  ui().set({ chooser: { ...rel(c, e), picks: all.map(({ type, id }) => ({ type, id })) }, tip: null, cycle: null });
};

/** Hold still on the canvas: list what is under the pointer instead of starting a drag. */
export function armLong(c: Ctx, e: PointerEvent) {
  cancelLong(c);
  if (!picking(c)) return;
  const { clientX: x, clientY: y } = e;
  c.lp = {
    x,
    y,
    timer: window.setTimeout(() => {
      c.lp = null;
      if (c.active && (c.active.started || c.active.mode !== "move")) return; // dragging, or holding the ring / arrow
      const all = rankAt(c, { clientX: x, clientY: y });
      if (!all.length) return;
      finish(c, true); // an unmoved press may already hold a drag: drop it
      c.press = null;
      openChooser(c, all, { clientX: x, clientY: y });
    }, LONG_PRESS_MS),
  };
}

/**
 * A click that did not drag: select the best target, or the next one behind when the same spot is clicked again; Alt opens the chooser.
 * `hold`: the press was on the already-selected piece behind a better-ranked one: it stays selected, and the next click steps on from it.
 */
export function clickSelect(c: Ctx, e: PointerEvent, alt: boolean, hold = false) {
  const all = rankAt(c, e);
  if (alt && all.length) return openChooser(c, all, e);
  const at = rel(c, e);
  const cycle = nextCycle(c.cycle, all.map((p) => `${p.type}:${p.id}`), at, Date.now());
  c.cycle = cycle;
  const here = all.findIndex((p) => p.type === "item" && p.id === st().sel?.id);
  if (hold && !cycle.cycled && here >= 0) {
    c.cycle = { ...cycle, index: here };
    return;
  }
  const picked = all[cycle.index];
  if (cycle.cycled && picked) ui().set({ cycle: { ...at, n: cycle.index, text: `${cycle.index + 1} of ${all.length}: ${describePick(st().plan, st().states, picked).name}` } });
  st().select(picked ? { type: picked.type, id: picked.id } : null);
}

/** Tab / Shift+Tab with a piece selected: the next or previous piece under the pointer, else in its room. */
export function tabSelect(c: Ctx, e: KeyboardEvent) {
  const s = st();
  const it = s.sel?.type === "item" ? itemOf(s.sel.id) : undefined;
  if (!it || c.active || placing()) return false;
  const here = c.ptr.inside ? rankAt(c, c.ptr, true).filter((p) => p.type === "item").map((p) => p.id) : [];
  const room = roomAt(planOfLevel(s.plan, levelIdOf(s.plan, it)), it.x, it.y);
  const inRoomIds = room && new Set(roomItems(s.plan, room).map((i) => i.id));
  const inRoom = pickIndex.entries.filter((p) => !inRoomIds || inRoomIds.has(p.id)).map((p) => p.id);
  const next = tabTarget(here, inRoom, it.id, e.shiftKey ? -1 : 1);
  if (!next) return false;
  s.select({ type: "item", id: next });
  return true;
}

/** What the quick toolbar's "Pick another here" does: the next piece under the last press (or under the selection), wrapping. */
export function cycleHere(c: Ctx) {
  const s = st();
  if (!c.furniture || s.sel?.type !== "item") return;
  const r = c.el.getBoundingClientRect();
  const box = ui().selRect;
  const lastPress = ui().lastPress;
  const centre = box ? { clientX: r.left + (box.x0 + box.x1) / 2, clientY: r.top + (box.y0 + box.y1) / 2 } : null;
  const idsAt = (p: Client | null) => (p ? rankAt(c, p, true).filter((q) => q.type === "item").map((q) => q.id) : []);
  const press = lastPress ? { clientX: lastPress.x, clientY: lastPress.y } : null;
  let at = press;
  let ids = idsAt(press);
  if (!ids.includes(s.sel.id)) [at, ids] = [centre, idsAt(centre)];
  const next = tabNext(ids, s.sel.id, 1);
  const anchor = at ? rel(c, at) : { x: 0, y: 0 };
  if (!next || ids.length < 2) return void ui().set({ cycle: { ...anchor, n: 0, text: "Nothing else here" } });
  s.select({ type: "item", id: next });
  ui().set({ cycle: { ...anchor, n: ids.indexOf(next), text: `${ids.indexOf(next) + 1} of ${ids.length}: ${describePick(s.plan, s.states, { type: "item", id: next }).name}` } });
}

/** The frame's hover: the ring or arrow under the pointer, else what a click would select, outlined, with a name chip and a "+n behind" count. */
function hoverTick(c: Ctx) {
  c.hoverRaf = 0;
  if (c.active || !c.ptr.inside) return;
  const floor = floorAt(c, c.ptr);
  const u = ui();
  if (floor) u.set({ cursor: floor });
  const gz = gizmoUnderPointer(c); // the ray is still aimed by floorAt
  const all = gz ? [] : rankAt(c, c.ptr);
  const top = all[0];
  const now = u.hover;
  if (top?.id !== now?.id || (top && now && top.type !== now.type)) u.set({ hover: top ? { type: top.type, id: top.id } : null });
  const more = Math.max(0, all.length - 1);
  if (more !== u.hoverMore || gz !== u.hoverGizmo) u.set({ hoverMore: more, hoverGizmo: gz });
  cursor(c, gz ? (gz === "elev" ? "ns-resize" : "grab") : top ? (c.furniture ? "grab" : "pointer") : "");
  hideTip(c);
  if (ui().chooser) return;
  const at = rel(c, c.ptr);
  if (gz) return void ui().set({ tip: { ...at, text: gz === "elev" ? "Drag to lift" : "Drag to turn" } });
  if (top && c.ptr.pointerType !== "touch") {
    // a name tooltip once the pointer rests on something (never on touch: the chooser and the list are the touch way)
    const name = describePick(st().plan, st().states, top).name;
    c.tipTimer = window.setTimeout(() => ui().set({ tip: { ...at, text: more ? `${name}  +${more} behind` : name } }), TIP_DELAY_MS);
  }
}

/** What a click would select is worked out once per frame, however fast the pointer moves. */
export function scheduleHover(c: Ctx) {
  c.hoverRaf ||= requestAnimationFrame(() => hoverTick(c));
}
