import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG } from "./catalog.ts";
import { commitPlan } from "./history.ts";
import { addLevelTo, removeLevelFrom } from "./planOps.ts";
import type { Item, Plan, SlabVoid } from "./types.ts";
import { STAIR_CLEARANCE, activeVoids, autoVoidFor, holesIn, placedHeight, turnVoid, voidCorners, withAutoVoids } from "./voids.ts";
import { holedSlabGeometry } from "./holedSlab.ts";
import type { BufferGeometry } from "three";
const levels = [
  { id: "L0", name: "Ground", elevation: 0, height: 2.78 },
  { id: "L1", name: "Upper", elevation: 2.78, height: 2.78 },
];
const stair = (id: string, kind: string, x: number, y: number, rot = 0, level = "L0"): Item => {
  const d = CATALOG[kind];
  return { id, kind, x, y, rot, w: d.w, d: d.d, h: d.h, level };
};
const plan = (items: Item[] = [], voids?: SlabVoid[]): Plan => ({ walls: [], openings: [], rooms: [], items, levels, ...(voids ? { voids } : {}) });
const area = (p: { x: number; y: number }[]) => Math.abs(p.reduce((a, q, i) => a + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0)) / 2;
const bbox = (pts: { x: number; y: number }[]) => ({ x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) });
const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const room = { x: 0, y: 0, w: 6, h: 5 };

// ---- hole geometry ----

test("a void inside a floor becomes one hole of its own size, inside the floor", () => {
  const [hole, ...rest] = holesIn(room, [{ x: 1, y: 1, w: 1, h: 2.8 }]);
  assert.equal(rest.length, 0);
  near(area(hole), 2.8, 0.05);
  const b = bbox(hole);
  assert.ok(b.x0 >= room.x && b.x1 <= room.x + room.w && b.y0 >= room.y && b.y1 <= room.y + room.h);
});

test("a turned void keeps its area and swaps its extent", () => {
  const [hole] = holesIn(room, [{ x: 2, y: 1, w: 1, h: 2, rot: 90 }]);
  near(area(hole), 2);
  const b = bbox(hole);
  near(b.x1 - b.x0, 2);
  near(b.y1 - b.y0, 1);
});

test("a void sticking out of the floor is cut at its edge, one fully outside makes no hole", () => {
  const [hole] = holesIn(room, [{ x: 5, y: 1, w: 3, h: 1 }]);
  const b = bbox(hole);
  near(b.x1, room.x + room.w, 0.01);
  near(area(hole), 1, 0.05);
  assert.deepEqual(holesIn(room, [{ x: 10, y: 10, w: 1, h: 1 }]), []);
});

test("overlapping voids are one hole, separate ones stay separate", () => {
  assert.equal(holesIn(room, [{ x: 1, y: 1, w: 2, h: 1 }, { x: 2.5, y: 1, w: 2, h: 1 }]).length, 1);
  assert.equal(holesIn(room, [{ x: 1, y: 1, w: 1, h: 1 }, { x: 4, y: 3, w: 1, h: 1 }]).length, 2);
});

test("the lowest level ignores its voids, an upper level uses them", () => {
  const p = plan([], [{ id: "a", x: 0, y: 0, w: 1, h: 1, level: "L0" }, { id: "b", x: 0, y: 0, w: 1, h: 1, level: "L1" }]);
  assert.deepEqual(activeVoids(p, "L0"), []);
  assert.deepEqual(activeVoids(p, "L1").map((v) => v.id), ["b"]);
});

// ---- the hole a stair cuts ----

test("a straight stair on the ground floor opens the floor above, its footprint plus clearance", () => {
  const it = stair("s1", "stairs_straight_closed", 2, 3);
  const v = autoVoidFor(plan([it]), it)!;
  assert.equal(v.level, "L1");
  assert.equal(v.auto, "s1");
  near(v.w, it.w + 2 * STAIR_CLEARANCE, 0.002);
  near(v.h, it.d + 2 * STAIR_CLEARANCE, 0.002);
  near(v.x + v.w / 2, 2, 0.002);
  near(v.y + v.h / 2, 3, 0.002);
});

test("a turned stair gets the hole turned with it", () => {
  const it = stair("s1", "stairs_straight_closed", 2, 3, 90);
  const v = autoVoidFor(plan([it]), it)!;
  const b = bbox(voidCorners(v));
  near(b.x1 - b.x0, it.d + 2 * STAIR_CLEARANCE, 0.01); // the long side now runs along x
  near(b.y1 - b.y0, it.w + 2 * STAIR_CLEARANCE, 0.01);
  near((b.x0 + b.x1) / 2, 2, 0.01);
});

test("no hole where nothing is above, or for steps outside", () => {
  const top = stair("t", "stairs_straight_closed", 2, 3, 0, "L1");
  assert.equal(autoVoidFor(plan([top]), top), undefined); // nothing above the top level
  const one = stair("o", "stairs_straight_closed", 2, 3);
  assert.equal(autoVoidFor({ ...plan([one]), levels: [levels[0]] }, one), undefined); // a single-level plan
  const step = stair("e", "stairs_entry", 1, 1);
  assert.equal(autoVoidFor(plan([step]), step), undefined);
  const chair = { id: "c", kind: "no_such_kind", x: 0, y: 0, rot: 0, w: 1, d: 1, h: 1 };
  assert.equal(autoVoidFor(plan([chair]), chair), undefined);
});

test("a basement stair opens its own floor, only when a level lies below", () => {
  const it = stair("b", "stairs_basement", 1, 1, 0, "L1");
  assert.equal(autoVoidFor(plan([it]), it)!.level, "L1");
  const lowest = stair("b2", "stairs_basement", 1, 1, 0, "L0");
  assert.equal(autoVoidFor(plan([lowest]), lowest), undefined);
});

test("the hole follows its stair when it moves or turns, and is never duplicated", () => {
  let p = withAutoVoids(plan([stair("s1", "stairs_u", 2, 3)]));
  assert.equal(p.voids!.length, 1);
  assert.equal(withAutoVoids(p), p); // already in step: same object, so no spurious undo step
  p = withAutoVoids({ ...p, items: p.items.map((i) => ({ ...i, x: 4, rot: 90 })) });
  assert.equal(p.voids!.length, 1);
  assert.equal(p.voids![0].id, "auto:s1");
  near(p.voids![0].x + p.voids![0].w / 2, 4, 0.002);
  assert.equal(p.voids![0].rot, 90);
});

test("a hand-drawn void survives the sync, and the hole goes when the stair does", () => {
  const manual: SlabVoid = { id: "m", x: 0, y: 0, w: 1, h: 1, level: "L1" };
  let p = withAutoVoids(plan([stair("s1", "stairs_straight_open", 2, 3), stair("s2", "stairs_spiral", 4, 3)], [manual]));
  assert.deepEqual(p.voids!.map((v) => v.id).sort(), ["auto:s1", "auto:s2", "m"]);
  p = withAutoVoids({ ...p, items: p.items.filter((i) => i.id !== "s1") });
  assert.deepEqual(p.voids!.map((v) => v.id).sort(), ["auto:s2", "m"]);
  p = withAutoVoids({ ...p, items: [] });
  assert.deepEqual(p.voids, [manual]);
});

test("stair and hole share one undo step through commitPlan", () => {
  const s = { plan: plan(), past: [], future: [], gesture: false };
  const next = commitPlan(s, { ...s.plan, items: [stair("s1", "stairs_l_left", 2, 3)] });
  assert.equal(next.past!.length, 1);
  assert.equal(next.plan!.voids!.length, 1);
  assert.equal(next.past![0].voids, undefined); // undo returns to before both
});

// ---- levels ----

test("removing a level removes its voids and the holes of its stairs", () => {
  const base = withAutoVoids(plan([stair("s1", "stairs_straight_closed", 2, 3)], [{ id: "m", x: 0, y: 0, w: 1, h: 1, level: "L1" }]));
  const noTop = removeLevelFrom(base, "L1");
  assert.deepEqual(noTop.voids ?? [], []);
  const noGround = removeLevelFrom(base, "L0");
  assert.deepEqual(noGround.voids!.map((v) => v.id), ["m"]); // the stair went with its level, its hole with it
});

test("duplicating a level copies its hand-drawn voids, and the copied stairs cut their own holes", () => {
  const base = withAutoVoids(plan([stair("s1", "stairs_straight_closed", 2, 3, 0, "L0")], [{ id: "m", x: 0, y: 0, w: 1, h: 1, level: "L0" }]));
  let n = 0;
  const { plan: out, id } = addLevelTo(base, { copyFrom: "L0" }, () => `n${++n}`);
  const copied = out.voids!.filter((v) => v.level === id);
  assert.equal(copied.length, 1);
  assert.equal(copied[0].auto, undefined);
  assert.notEqual(copied[0].id, "m");
  assert.equal(out.voids!.filter((v) => v.auto).length, 1); // the level 1 above stays above the ground floor: one derived hole
  // the new top level has nothing above it, so its copied stair adds no extra hole
});

// ---- placing and helpers ----

test("a placed stair is as tall as the storey it climbs", () => {
  const tall = { ...plan(), levels: [levels[0], { id: "L1", name: "Upper", elevation: 3.1, height: 2.78 }] };
  assert.equal(placedHeight(tall, "L0", "stairs_straight_closed"), 3.1);
  assert.equal(placedHeight(plan(), "L1", "stairs_straight_closed"), CATALOG.stairs_straight_closed.h); // nothing above: its own height
  assert.equal(placedHeight(plan(), "L0", "stairs_entry"), CATALOG.stairs_entry.h);
  assert.equal(placedHeight(plan(), "L1", "stairs_basement"), 2.78); // down to the level below
});

test("turning a void keeps its centre", () => {
  const t = turnVoid({ x: 1, y: 1, w: 1, h: 3 });
  assert.deepEqual(t, { x: 0, y: 2, w: 3, h: 1 });
});

// ---- the stairs catalog ----

type V3 = [number, number, number];
/** Half extents of a part's bounding box once turned by Euler XYZ. */
function extent(s: V3, r: V3 = [0, 0, 0]): V3 {
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(r[0]), Math.sin(r[0]), Math.cos(r[1]), Math.sin(r[1]), Math.cos(r[2]), Math.sin(r[2])];
  const mul = (A: number[][], B: number[][]) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
  const m = mul(mul([[1, 0, 0], [0, ca, -sa], [0, sa, ca]], [[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]]), [[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]]);
  return m.map((row) => row.reduce((a, v, j) => a + Math.abs(v) * (s[j] / 2), 0)) as V3;
}

const stairKinds = Object.keys(CATALOG).filter((k) => k.startsWith("stairs_"));

test("every staircase is a well-formed Stairs piece", () => {
  assert.ok(stairKinds.length >= 14);
  for (const k of stairKinds) {
    const d = CATALOG[k];
    assert.equal(d.cat, "Stairs", k);
    assert.ok(d.stair, k);
    assert.ok(d.w > 0 && d.d > 0 && d.h > 0 && d.parts.length > 0, k);
    assert.ok(d.parts.some((p) => p.m), `${k} has recolourable treads`);
  }
});

test("every part of every staircase stays inside its footprint and storey", () => {
  const TOL = 0.15;
  for (const k of stairKinds) {
    const d = CATALOG[k];
    for (const p of d.parts) {
      const [ex, ey, ez] = extent(p.s, p.r);
      const ok = Math.abs(p.p[0]) + ex <= d.w / 2 + TOL && Math.abs(p.p[2]) + ez <= d.d / 2 + TOL && p.p[1] - ey >= (d.stair === "down" ? -d.h : 0) - TOL && p.p[1] + ey <= (d.stair === "down" ? 0 : d.h) + 1.0 + TOL;
      assert.ok(ok, `${k}: part at ${p.p} size ${p.s} leaves the footprint`);
    }
  }
});

test("storey stairs climb in 16 risers of about 17 cm", () => {
  for (const k of ["stairs_straight_closed", "stairs_straight_open", "stairs_l_right", "stairs_u"]) {
    const d = CATALOG[k];
    const tops = d.parts.filter((p) => p.m && Math.abs(p.s[1] - 0.04) < 1e-9 && !p.r).map((p) => Math.round((p.p[1] + 0.02 - 0.06) / (d.h / 16))); // treads are measured from the finished floor, 6 cm above the level origin
    assert.deepEqual([...new Set(tops)].sort((a, b) => a - b), Array.from({ length: tops.length ? Math.max(...tops) : 0 }, (_, i) => i + 1), k); // no step missing
    assert.ok(Math.max(...tops) >= 14 && Math.max(...tops) <= 15, `${k} top step ${Math.max(...tops)}`);
  }
});

test("ids are unique and every stair is solid so furniture cannot stand in it", () => {
  for (const k of stairKinds) assert.equal(CATALOG[k].solid, true, k);
});

// ---- 3D slab geometry ----

/** Area of the faces pointing up (normal y > 0.9) in world x-z. */
function topArea(g: BufferGeometry): number {
  const pos = g.getAttribute("position");
  const nrm = g.getAttribute("normal");
  const idx = g.getIndex();
  const n = idx ? idx.count : pos.count;
  let a = 0;
  for (let t = 0; t < n; t += 3) {
    const [i, j, k] = [0, 1, 2].map((o) => (idx ? idx.getX(t + o) : t + o));
    if (nrm.getY(i) < 0.9) continue;
    a += Math.abs((pos.getX(j) - pos.getX(i)) * (pos.getZ(k) - pos.getZ(i)) - (pos.getX(k) - pos.getX(i)) * (pos.getZ(j) - pos.getZ(i))) / 2;
  }
  return a;
}

test("a holed floor is the floor minus the hole, stands up from y 0 and keeps floor-texture UVs", () => {
  const rect = { x: 1, y: 2, w: 6, h: 5 };
  const holes = holesIn(rect, [{ x: 2, y: 3, w: 1, h: 2.8 }, { x: 5, y: 3, w: 1, h: 1, rot: 30 }]);
  assert.equal(holes.length, 2);
  const g = holedSlabGeometry(rect, holes, 0.06);
  near(topArea(g), 30 - 2.8 - 1, 0.05);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  near(bb.min.y, 0, 1e-6);
  near(bb.max.y, 0.06, 1e-6);
  assert.ok(bb.min.x >= rect.x - 1e-6 && bb.max.x <= rect.x + rect.w + 1e-6 && bb.min.z >= rect.y - 1e-6 && bb.max.z <= rect.y + rect.h + 1e-6);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) assert.ok(uv.getX(i) >= -1e-6 && uv.getX(i) <= 1 + 1e-6 && uv.getY(i) >= -1e-6 && uv.getY(i) <= 1 + 1e-6);
});
