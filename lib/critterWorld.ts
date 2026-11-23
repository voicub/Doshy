import type { Def } from "./catalog";
import { BEHAVIOUR, type Box, type CritterSpec, type Place, type Spot } from "./critters.ts";
import { WALL_T, roomAt } from "./geometry.ts";
import { levelIdOf, onLevel } from "./levels.ts";
import type { Item, Plan, Wall } from "./types";

// What an animal bumps into, read from the plan once per change and expressed in the animal's own (item-local) frame.

const PEN = /^an_(chicken_run|dog_run|kennel_run|rabbit_run|paddock|hutch_run)/;
const SPOT_RANGE = 1; // spots this far beyond the wander radius still count
const OBSTACLE_MIN_H = 0.2; // lower things (rugs, paving, mats) are walked over
const LIFTED = 0.3; // things standing on furniture or hung on a wall are not on the floor

/** Plan-space rectangle (centre cx, cy; half sizes; x axis at `ang` rad) into the item's local frame. */
function toLocal(it: Pick<Item, "x" | "y" | "rot">, cx: number, cy: number, hx: number, hz: number, ang: number): Box {
  const r = (it.rot * Math.PI) / 180;
  const dx = cx - it.x;
  const dy = cy - it.y;
  const a = ang - r;
  return { x: dx * Math.cos(r) + dy * Math.sin(r), z: -dx * Math.sin(r) + dy * Math.cos(r), hx, hz, c: Math.cos(a), s: Math.sin(a) };
}

/** A wall as a box: its length plus half a thickness past each end (as wallSlab draws it) by its thickness. */
function wallBox(it: Item, w: Wall): Box {
  const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const t = w.thickness ?? WALL_T;
  return toLocal(it, (w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2, (len + t) / 2, t / 2, ang);
}

const itemBox = (home: Item, o: Item) => toLocal(home, o.x, o.y, o.w / 2, o.d / 2, (o.rot * Math.PI) / 180);

/**
 * The animal's surroundings for roaming: walls and floor-standing furniture it must walk around, water it will not cross, the room it is kept in,
 * the things it likes to be near, and a pen it lives in. Everything is on the animal's own level. Cheap enough to rebuild whenever the plan changes.
 */
export function buildWorld(plan: Plan, home: Item, spec: CritterSpec, radius: number, defs: Record<string, Def>): Place {
  const lv = onLevel(plan, levelIdOf(plan, home));
  const b = BEHAVIOUR[spec.kind];
  const reach = radius + SPOT_RANGE + 2;
  const near = (box: Box) => Math.hypot(box.x, box.z) <= reach + Math.hypot(box.hx, box.hz);
  const boxes: Box[] = [];
  for (const w of lv.walls) {
    const box = wallBox(home, w);
    if (near(box)) boxes.push(box);
  }
  const spots: Spot[] = [];
  const shelters: Spot[] = [];
  const mates: Item[] = [];
  let pen: Box | undefined;
  for (const o of lv.items) {
    if (o.id === home.id) continue;
    const d = defs[o.kind];
    if (!d || d.wall || (o.elev ?? 0) >= LIFTED) continue;
    const box = itemBox(home, o);
    if (d.critter) {
      if (d.critter.kind === spec.kind && Math.hypot(box.x, box.z) <= 3) mates.push(o);
      continue; // other animals are not walls
    }
    if (PEN.test(o.kind) && Math.abs(box.x) < box.hx && Math.abs(box.z) < box.hz) {
      pen = box;
      continue;
    }
    if (!near(box)) continue;
    if (b.likes.test(o.kind)) spots.push({ x: box.x, z: box.z, r: Math.min(o.w, o.d) / 2 });
    if (b.shelter.test(o.kind)) shelters.push({ x: box.x, z: box.z, r: Math.min(o.w, o.d) / 2 });
    if (d.h >= OBSTACLE_MIN_H) boxes.push(box);
  }
  const rooms = lv.rooms.map((r) => toLocal(home, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0));
  const here = roomAt({ ...plan, rooms: lv.rooms }, home.x, home.y);
  const indoor = !!here;
  const swims = spec.kind === "fowl" && /duck|goose/.test(home.kind);
  if (!swims) {
    for (const r of lv.rooms) {
      if (r.floor !== "water") continue;
      const box = toLocal(home, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0);
      if (near(box)) boxes.push(box);
    }
    for (const a of plan.ground ?? []) {
      if (a.kind !== "water") continue; // garden ponds (Plan.ground); the rest of the ground is walked freely
      const box = toLocal(home, a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, ((a.rot ?? 0) * Math.PI) / 180);
      if (near(box)) boxes.push(box);
    }
  }
  const place: Place = { boxes, rooms: indoor ? rooms : rooms.filter(near), indoor, pen, spots, shelters };
  if (mates.length) {
    const mx = mates.reduce((s, m) => s + itemBox(home, m).x, 0) / mates.length;
    const mz = mates.reduce((s, m) => s + itemBox(home, m).z, 0) / mates.length;
    place.flock = { x: mx, z: mz };
  }
  return place;
}
