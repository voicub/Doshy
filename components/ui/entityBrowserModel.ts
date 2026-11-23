import { CATALOG } from "@/lib/catalog";
import { domainOf, isActive, TOGGLEABLE, type HAState } from "@/lib/ha";
import { entitiesOfRoom, roomAreaIds, type DevicePlacement, type HaArea } from "@/lib/haAreas";
import { uid, useStore } from "@/lib/store";
import type { Plan, Room, Sel } from "@/lib/types";

const HEAD_H = 38;
const ENT_H = 54;
const TINY_HEAD_H = 52; // a head holds 44 px buttons
const TINY_ENT_H = 68;
const TINY_ACT_H = 60; // the button row a tapped entity unfolds
const OVERSCAN = 6;
export const CHIPS = ["light", "switch", "media_player", "climate", "humidifier", "sensor", "binary_sensor", "other"];
/** Domains that are mostly HA bookkeeping: hidden until "Diagnostics" is on, or until their chip / a search asks for them. */
const DIAG = ["sensor", "binary_sensor", "select", "number", "button", "update", "event", "text", "datetime", "time", "date", "tts", "stt", "wake_word", "conversation", "ai_task", "todo", "device_tracker"];

export type Group = { key: string; label: string; tag: string; roomId?: string; all: string[]; shown: string[]; on: number };
export type Row = { t: "head"; g: Group; collapsed: boolean } | { t: "ent"; id: string; g: Group };

const chipOf = (id: string) => (CHIPS.includes(domainOf(id)) ? domainOf(id) : "other");
export const nameOf = (id: string, states: Record<string, HAState>) => states[id]?.attributes.friendly_name ?? id;

/** Rooms in plan order claim their entities first; unmatched areas follow, then entities without an area. */
export function buildGroups(opts: {
  plan: Plan;
  states: Record<string, HAState>;
  entityArea: Record<string, string | null>;
  areas: HaArea[];
  q: string;
  chips: string[];
  diag: boolean;
}): Group[] {
  const { plan, states, entityArea, areas, q, chips, diag } = opts;
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = (id: string) => {
    if (words.length) {
      const hay = `${id} ${nameOf(id, states)}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    const chip = chipOf(id);
    if (chips.length && !chips.includes(chip)) return false;
    return diag || words.length > 0 || (chips.length > 0 && chip !== "other") || !DIAG.includes(domainOf(id));
  };
  const make = (key: string, label: string, tag: string, all: string[], roomId?: string): Group => {
    const shown = all
      .filter(visible)
      .sort((a, b) => Number(!TOGGLEABLE.includes(domainOf(a))) - Number(!TOGGLEABLE.includes(domainOf(b))) || nameOf(a, states).localeCompare(nameOf(b, states)));
    return { key, label, tag, roomId, all, shown, on: all.filter((id) => isActive(states[id])).length };
  };

  const claimed = new Set<string>();
  const mapped = new Set<string>();
  const groups: Group[] = [];
  for (const room of plan.rooms.filter((r) => !r.parent)) {
    roomAreaIds(plan, room, areas).forEach((a) => mapped.add(a));
    const all = entitiesOfRoom(plan, room, entityArea, states, areas).filter((id) => !claimed.has(id));
    all.forEach((id) => claimed.add(id));
    groups.push(make(`room:${room.id}`, room.name, "Room", all, room.id));
  }
  const ids = Object.keys(states);
  for (const a of areas.filter((x) => !mapped.has(x.id))) {
    const all = ids.filter((id) => entityArea[id] === a.id);
    if (all.length) groups.push(make(`area:${a.id}`, a.name, "HA area", all));
  }
  const loose = ids.filter((id) => {
    const area = entityArea[id];
    return !claimed.has(id) && !(area && mapped.has(area)) && !areas.some((a) => a.id === area);
  });
  if (loose.length) groups.push(make("none", "No area", "Unassigned", loose));
  const filtering = words.length > 0 || chips.length > 0;
  return filtering ? groups.filter((g) => g.shown.length) : groups;
}

export function flatten(groups: Group[], collapsed: Record<string, boolean>, searching: boolean, heightOf: (r: Row) => number): { rows: Row[]; offsets: number[]; total: number } {
  const rows: Row[] = [];
  for (const g of groups) {
    // groups default open, except the long tail (unmatched areas, unassigned) which starts closed; a search opens everything
    const closed = searching ? false : (collapsed[g.key] ?? !g.roomId);
    rows.push({ t: "head", g, collapsed: closed });
    if (!closed) g.shown.forEach((id) => rows.push({ t: "ent", id, g }));
  }
  const offsets: number[] = [];
  let y = 0;
  for (const r of rows) {
    offsets.push(y);
    y += heightOf(r);
  }
  return { rows, offsets, total: y };
}

/** What a selection can be linked to in Home Assistant, using the same fields the link inspector edits. */
export function linkTarget(sel: Sel, plan: Plan, entityId: string, st: HAState | undefined): { current: boolean; apply: () => void } | null {
  if (!sel) return null;
  const patch = useStore.getState().patch;
  if (sel.type === "item") {
    const it = plan.items.find((i) => i.id === sel.id);
    return it ? { current: it.entity === entityId, apply: () => patch("item", it.id, { entity: entityId }) } : null;
  }
  if (sel.type === "opening") {
    const o = plan.openings.find((x) => x.id === sel.id);
    return o && ["binary_sensor", "cover", "sensor"].includes(domainOf(entityId)) ? { current: o.entity === entityId, apply: () => patch("opening", o.id, { entity: entityId }) } : null;
  }
  const r = sel.type === "room" ? plan.rooms.find((x) => x.id === sel.id) : undefined;
  const temp = domainOf(entityId) === "climate" || (domainOf(entityId) === "sensor" && (st?.attributes.device_class === "temperature" || /^°?[CF]$/.test(st?.attributes.unit_of_measurement ?? "")));
  return r && temp ? { current: r.tempEntity === entityId, apply: () => patch("room", r.id, { tempEntity: entityId }) } : null;
}

/** Row height: heads and entities differ, and on a finger-sized layout the tapped entity unfolds a button row. */
export function rowHeight(r: Row, tiny: boolean, openId: string | null): number {
  if (r.t === "head") return tiny ? TINY_HEAD_H : HEAD_H;
  return tiny ? TINY_ENT_H + (r.id === openId ? TINY_ACT_H : 0) : ENT_H;
}

/** Windowing: only the rows intersecting the viewport (plus overscan) are put in the DOM. Returns the index of the first one and the slice. */
export function visibleRows(rows: Row[], offsets: number[], heightOf: (r: Row) => number, scrollTop: number, viewH: number): { first: number; slice: Row[] } {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] + heightOf(rows[mid]) <= scrollTop) lo = mid + 1;
    else hi = mid;
  }
  const first = Math.max(0, lo - OVERSCAN);
  let last = lo;
  while (last < rows.length && offsets[last] < scrollTop + viewH) last++;
  return { first, slice: rows.slice(first, Math.min(rows.length, last + OVERSCAN)) };
}

/** The marker kind a device gets on the plan: Echo speakers have their own piece. */
const markerKind = (entityId: string) => (domainOf(entityId) === "media_player" && entityId.includes("echo") && CATALOG.echo_dot ? "echo_dot" : "marker");

/** Plan edit only (no device is switched): one marker per unlinked controllable device, inside its room. */
export function mapAllDevices(pending: DevicePlacement[]) {
  const s = useStore.getState();
  const added = pending.map((p) => {
    const kind = markerKind(p.entity);
    const d = CATALOG[kind];
    return { id: uid(), kind, x: p.x, y: p.y, rot: 0, w: d.w, d: d.d, h: d.h, entity: p.entity };
  });
  s.setPlan({ ...s.plan, items: [...s.plan.items, ...added] });
}

/** Drop a marker in the middle of `room` and link it to `entityId`. */
export function placeMarker(room: Room, entityId: string) {
  const s = useStore.getState();
  s.addItem(markerKind(entityId), room.x + room.w / 2, room.y + room.h / 2);
  const added = useStore.getState().sel;
  if (added) s.patch("item", added.id, { entity: entityId });
}
