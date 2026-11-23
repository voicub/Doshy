import test from "node:test";
import assert from "node:assert/strict";
import {
  EDGES, GARDEN_KINDS, GROUND_PRESETS, addGroundTo, addPathTo, areaCorners, cleanPoints, distToSegment, groundAt, groundBase, hasGround, hasOutdoor, isPlantable, keepPlantable,
  paintGround, pathLength, pathMidpoint, pathOutline, plantableAt, pointInArea, pointInPath, polygonArea, resizeArea, rotationToward,
} from "./ground.ts";
import { areaSurface, edgeTris, pathSurface, type Tris } from "./groundGeo.ts";
import { commitPlan, keepSel, undoStep, redoStep, type HistoryState } from "./history.ts";
import { FLOORS, FLOOR_KINDS, isOutdoorFloor } from "./materials.ts";
import type { GroundArea, GroundPath, Plan, Pt } from "./types.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const empty = (): Plan => ({ walls: [], openings: [], rooms: [], items: [] });
const area = (id: string, x: number, y: number, w: number, h: number, extra: Partial<GroundArea> = {}): GroundArea => ({ id, x, y, w, h, kind: "pavers_grey", ...extra });
const path = (id: string, points: Pt[], width = 1, extra: Partial<GroundPath> = {}): GroundPath => ({ id, points, width, kind: "gravel", ...extra });
const withGround = (ground: GroundArea[], paths: GroundPath[] = []): Plan => ({ ...empty(), ground, paths });
/** Area of the triangles of a flat surface (m2) and the smallest y of their normals. */
function trisArea(t: Tris) {
  let sum = 0;
  let minUp = 1;
  for (let i = 0; i < t.pos.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((o) => [t.pos[i + o], t.pos[i + o + 1], t.pos[i + o + 2]]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    sum += Math.abs(ny) / 2;
    minUp = Math.min(minUp, ny);
  }
  return { sum, minUp };
}

// ---- rectangles -----------------------------------------------------------------------------------------------------------

test("an unturned area has its corners where x, y, w, h say; a quarter turn swings it about its centre", () => {
  const a = area("a", 1, 2, 4, 2);
  assert.deepEqual(areaCorners(a).map((p) => [p.x, p.y]), [[1, 2], [5, 2], [5, 4], [1, 4]]);
  const turned = areaCorners({ ...a, rot: 90 });
  near(turned[0].x, 4); // centre (3, 3): the top-left corner swings to the top-right
  near(turned[0].y, 1);
  assert.ok(pointInArea({ ...a, rot: 90 }, { x: 3, y: 4.9 }));
  assert.ok(!pointInArea({ ...a, rot: 90 }, { x: 4.9, y: 3 }));
  assert.ok(pointInArea(a, { x: 4.9, y: 3 }));
});

test("dragging a corner keeps the opposite corner where it was, even when the area is turned", () => {
  const a = area("a", 0, 0, 2, 1);
  assert.deepEqual(resizeArea(a, "se", { x: 3, y: 2 }), { x: 0, y: 0, w: 3, h: 2 });
  const turned = area("t", 0, 0, 4, 2, { rot: 90 });
  const opp = areaCorners(turned)[0]; // nw stays while se is dragged
  const next = { ...turned, ...resizeArea(turned, "se", { x: 5, y: 6 }) };
  const after = areaCorners(next)[0];
  near(after.x, opp.x, 0.002);
  near(after.y, opp.y, 0.002);
});

test("a corner cannot be dragged past its opposite: the area keeps a minimum side", () => {
  const r = resizeArea(area("a", 0, 0, 2, 1), "se", { x: -5, y: -5 });
  assert.ok(r.w >= 0.3 && r.h >= 0.3);
});

test("the turn handle snaps and points the area's top toward the pointer", () => {
  const a = area("a", 0, 0, 2, 2); // centre (1, 1)
  assert.equal(rotationToward(a, { x: 1, y: -5 }, 5), 0);
  assert.equal(rotationToward(a, { x: 9, y: 1 }, 5), 90);
  assert.equal(rotationToward(a, { x: 9, y: 1.5 }, 15), 90);
  near(rotationToward(a, { x: 9, y: 2.3 }, 0), 90 + (Math.atan(1.3 / 8) * 180) / Math.PI, 0.01);
});

// ---- paths ---------------------------------------------------------------------------------------------------------------

test("a straight path is a strip as wide as asked with round ends", () => {
  const p = path("p", [{ x: 0, y: 0 }, { x: 6, y: 0 }], 1);
  const poly = pathOutline(p);
  const xs = poly.map((q) => q.x);
  const ys = poly.map((q) => q.y);
  near(Math.min(...xs), -0.5);
  near(Math.max(...xs), 6.5);
  near(Math.min(...ys), -0.5);
  near(Math.max(...ys), 0.5);
  const expected = 6 * 1 + Math.PI * 0.25;
  assert.ok(Math.abs(polygonArea(poly) - expected) / expected < 0.03, `${polygonArea(poly)} vs ${expected}`);
  assert.equal(pathLength(p), 6);
});

test("every point of a bent path's outline lies half a width from its centre line: rounded joins, no spikes", () => {
  const p = path("p", [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 9, y: 6 }], 1.2);
  const poly = pathOutline(p);
  const pts = cleanPoints(p.points);
  for (const q of poly) {
    const d = Math.min(...pts.slice(1).map((b, i) => distToSegment(q, pts[i], b)));
    near(d, 0.6, 1e-6);
  }
  const bend = poly.filter((q) => Math.hypot(q.x - 5, q.y - 0) < 0.6 + 1e-6 && q.x > 5 && q.y < 0); // the outer corner of the first bend is an arc of several points
  assert.ok(bend.length >= 3, `${bend.length}`);
  const expected = pathLength(p) * 1.2 + Math.PI * 0.36; // strip plus the two end caps (bends add roughly what they take)
  assert.ok(Math.abs(polygonArea(poly) - expected) / expected < 0.06, `${polygonArea(poly)} vs ${expected}`);
});

test("hit testing a path: on the strip, round at the ends and bends, off to the side", () => {
  const p = path("p", [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], 1);
  assert.ok(pointInPath(p, { x: 2, y: 0.4 }));
  assert.ok(!pointInPath(p, { x: 2, y: 0.6 }));
  assert.ok(pointInPath(p, { x: -0.4, y: 0 })); // round start
  assert.ok(!pointInPath(p, { x: -0.45, y: 0.4 })); // the corner of a square end would be inside, a round one is not
  assert.ok(pointInPath(p, { x: 4.3, y: -0.3 })); // outside of the bend
  assert.ok(!pointInPath(p, { x: 4.6, y: -0.6 }));
  assert.ok(!pointInPath(path("one", [{ x: 0, y: 0 }], 1), { x: 2, y: 0 }));
});

test("a double click leaves a repeated point that is dropped, and a path needs two real points", () => {
  assert.equal(cleanPoints([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]).length, 2);
  const plan = empty();
  assert.equal(addPathTo(plan, { points: [{ x: 1, y: 1 }, { x: 1, y: 1 }], width: 1, kind: "gravel" }, "n"), plan);
  const made = addPathTo(plan, { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 40, kind: "gravel" }, "n");
  assert.equal(made.paths![0].width, 6); // clamped
  assert.ok(made.paths![0].name);
});

test("a path's label sits half way along it", () => {
  const mid = pathMidpoint(path("p", [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 6 }]));
  near(mid.x, 2);
  near(mid.y, 2);
});

// ---- what lies where --------------------------------------------------------------------------------------------------------

test("the topmost ground wins: paths over areas, later over earlier", () => {
  const plan = withGround([area("lower", 0, 0, 6, 6), area("upper", 2, 2, 2, 2, { kind: "grass" })], [path("p", [{ x: 0, y: 3 }, { x: 6, y: 3 }], 1)]);
  assert.deepEqual(groundAt(plan, { x: 3, y: 3 }), { type: "path", id: "p" });
  assert.deepEqual(groundAt(plan, { x: 3, y: 2.3 }), { type: "ground", id: "upper" });
  assert.deepEqual(groundAt(plan, { x: 1, y: 1 }), { type: "ground", id: "lower" });
  assert.equal(groundAt(plan, { x: 9, y: 9 }), null);
});

test("plants never stand on a patio, a drive, a path or a pond, but may on a lawn, a flower bed and open ground", () => {
  const plan = withGround(
    [area("patio", 0, 0, 4, 4), area("pond", 10, 0, 2, 2, { kind: "water" }), area("bed", 20, 0, 2, 2, { kind: "soil" }), area("bark", 30, 0, 2, 2, { kind: "mulch" })],
    [path("walk", [{ x: 0, y: 8 }, { x: 8, y: 8 }], 1)],
  );
  assert.ok(!plantableAt(plan, { x: 2, y: 2 }));
  assert.ok(!plantableAt(plan, { x: 11, y: 1 }));
  assert.ok(!plantableAt(plan, { x: 4, y: 8.2 }));
  assert.ok(plantableAt(plan, { x: 21, y: 1 }));
  assert.ok(plantableAt(plan, { x: 31, y: 1 }));
  assert.ok(plantableAt(plan, { x: 50, y: 50 }));
  const kept = keepPlantable(plan, [{ x: 2, z: 2 }, { x: 21, z: 1 }, { x: 50, z: 50 }, { x: 4, z: 8.2 }]);
  assert.deepEqual(kept.map((q) => q.x), [21, 50]);
});

test("a lawn laid over a patio is plantable again: the topmost surface decides", () => {
  const plan = withGround([area("patio", 0, 0, 6, 6), area("lawn", 1, 1, 2, 2, { kind: "grass" })]);
  assert.ok(plantableAt(plan, { x: 2, y: 2 }));
  assert.ok(!plantableAt(plan, { x: 5, y: 5 }));
  assert.ok(isPlantable("grass") && !isPlantable("gravel"));
});

test("a plan without ground behaves exactly as before", () => {
  const plan = empty();
  const placed = [{ x: 1, z: 1 }];
  assert.equal(keepPlantable(plan, placed), placed); // same array: nothing to filter
  assert.equal(groundAt(plan, { x: 0, y: 0 }), null);
  assert.equal(hasGround(plan), false);
  assert.equal(hasGround({ ground: [], paths: [] }), false);
  assert.equal(hasOutdoor(plan), false);
  assert.equal(hasOutdoor({ ...plan, rooms: [{ id: "g", name: "Lawn", x: 0, y: 0, w: 4, h: 4, color: "#7fae60", floor: "grass" }] }), true);
  assert.equal(hasOutdoor(withGround([area("a", 0, 0, 1, 1)])), true);
});

// ---- paint, labels, presets ---------------------------------------------------------------------------------------------------

test("painting ground lays a surface and a colour; the natural colour is stored as none; same brush, same plan", () => {
  const plan = withGround([area("a", 0, 0, 3, 3)]);
  const red = paintGround(plan, { type: "ground", id: "a" }, { material: { kind: "floor", id: "deck" }, color: "#aa3322" });
  assert.equal(red.ground![0].kind, "deck");
  assert.equal(red.ground![0].color, "#aa3322");
  assert.equal(paintGround(red, { type: "ground", id: "a" }, { material: { kind: "floor", id: "deck" }, color: "#aa3322" }), red);
  const natural = paintGround(red, { type: "ground", id: "a" }, { material: null, color: null });
  assert.equal(natural.ground![0].color, undefined);
  assert.equal(natural.ground![0].kind, "deck");
  assert.equal(paintGround(plan, { type: "ground", id: "a" }, { material: { kind: "wall", id: "brick" }, color: null }), plan);
  assert.equal(paintGround(plan, { type: "ground", id: "nope" }, { material: null, color: "#112233" }), plan);
  const onPath = paintGround(withGround([], [path("p", [{ x: 0, y: 0 }, { x: 1, y: 0 }])]), { type: "path", id: "p" }, { material: { kind: "floor", id: "slabs" }, color: null });
  assert.equal(onPath.paths![0].kind, "slabs");
});

test("presets and gallery only use surfaces that exist, with sensible sizes", () => {
  assert.equal(new Set(GROUND_PRESETS.map((p) => p.id)).size, GROUND_PRESETS.length);
  for (const p of GROUND_PRESETS) {
    assert.ok(FLOORS[p.kind], p.id);
    assert.ok(p.size ? p.size.w > 0 && p.size.h > 0 : (p.width ?? 0) > 0, p.id);
    assert.ok(EDGES[p.edge]);
  }
  assert.ok(GROUND_PRESETS.some((p) => p.mode === "path") && GROUND_PRESETS.some((p) => p.mode === "pond" && p.kind === "water"));
  assert.equal(new Set(GARDEN_KINDS).size, GARDEN_KINDS.length);
  for (const k of GARDEN_KINDS) assert.ok(FLOORS[k], k);
  for (const k of ["cobble", "flagstone", "pavers_grey", "pavers_sand", "pavers_red", "mulch", "soil", "turf", "rubber"] as const) assert.ok(isOutdoorFloor(k), k);
  for (const k of ["cobble", "flagstone", "pavers_grey", "pavers_sand", "pavers_red", "mulch", "soil", "turf", "rubber"] as const) assert.ok(FLOOR_KINDS.includes(k) && GARDEN_KINDS.includes(k), k);
});

// ---- undo and redo ----------------------------------------------------------------------------------------------------------------

test("laying ground and removing it are single undo steps that redo replays", () => {
  let s: HistoryState = { plan: empty(), past: [], future: [], gesture: false };
  const apply = (p: Partial<HistoryState>) => (s = { ...s, ...p });
  apply(commitPlan(s, addGroundTo(s.plan, { x: 0, y: 0, w: 3, h: 4, kind: "pavers_grey" }, "g1")));
  apply(commitPlan(s, addPathTo(s.plan, { points: [{ x: 0, y: 5 }, { x: 4, y: 5 }], width: 1, kind: "gravel" }, "p1")));
  assert.equal(s.past.length, 2);
  assert.deepEqual(keepSel({ type: "ground", id: "g1" }, s.plan), { type: "ground", id: "g1" });
  assert.deepEqual(keepSel({ type: "path", id: "p1" }, s.plan), { type: "path", id: "p1" });
  apply(undoStep(s));
  assert.equal(s.plan.paths, undefined);
  assert.equal(keepSel({ type: "path", id: "p1" }, s.plan), null);
  apply(undoStep(s));
  assert.equal(s.plan.ground, undefined); // back to a plan that never had ground
  apply(redoStep(s));
  assert.equal(s.plan.ground!.length, 1);
  apply(commitPlan(s, { ...s.plan, ground: [] }));
  apply(undoStep(s));
  assert.equal(s.plan.ground![0].id, "g1");
});

test("a new area is named after its surface and never smaller than the minimum", () => {
  const plan = addGroundTo(empty(), { x: 0, y: 0, w: 0.01, h: 0.01, kind: "flagstone" }, "a");
  assert.equal(plan.ground![0].name, "Flagstone 1");
  assert.ok(plan.ground![0].w >= 0.3 && plan.ground![0].h >= 0.3);
  assert.notEqual(addGroundTo(plan, { x: 5, y: 5, w: 1, h: 1, kind: "flagstone" }, "b").ground![1].name, plan.ground![0].name, "numbered apart");
});

// ---- 3D geometry --------------------------------------------------------------------------------------------------------------------

test("an area's surface is two upward triangles covering exactly its rectangle, tiles following its turn", () => {
  const a = area("a", 1, 1, 4, 2, { rot: 30 });
  const t = areaSurface(a, 0.8);
  assert.equal(t.pos.length / 9, 2);
  const { sum, minUp } = trisArea(t);
  near(sum, 8, 1e-6);
  assert.ok(minUp > 0, "faces up");
  // the corner at the top-left of the unturned rectangle starts the texture
  const corner = areaCorners(a)[0];
  const i = Array.from({ length: t.pos.length / 3 }, (_, k) => k).find((k) => Math.abs(t.pos[k * 3] - corner.x) < 1e-6 && Math.abs(t.pos[k * 3 + 2] - corner.y) < 1e-6)!;
  near(t.uv[i * 2], 0);
  near(t.uv[i * 2 + 1], 0);
});

test("a bent path's surface covers its outline, face up, with no holes", () => {
  const p = path("p", [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }], 1);
  const t = pathSurface(p, 1);
  const { sum, minUp } = trisArea(t);
  near(sum, polygonArea(pathOutline(p)), 1e-6);
  assert.ok(minUp > 0);
});

test("a kerb is a row of low boxes standing just outside the area; no edge, no geometry", () => {
  const poly = areaCorners(area("a", 0, 0, 2, 1));
  assert.equal(edgeTris(poly, EDGES.none).pos.length, 0);
  const rim = edgeTris(poly, EDGES.kerb);
  assert.equal(rim.pos.length / 9, 4 * 10); // four boxes, ten triangles each (top and four sides)
  const ys = rim.pos.filter((_, i) => i % 3 === 1);
  near(Math.max(...ys), EDGES.kerb.h);
  near(Math.min(...ys), 0);
  // nothing of the rim lies inside the surface: it stands outside the rectangle (corners excepted, which close the ring)
  const inside = [];
  for (let i = 0; i < rim.pos.length; i += 3) if (rim.pos[i] > 0.001 && rim.pos[i] < 1.999 && rim.pos[i + 2] > 0.001 && rim.pos[i + 2] < 0.999) inside.push(i);
  assert.equal(inside.length, 0);
  // the same rim comes out whichever way the outline is wound
  assert.equal(edgeTris([...poly].reverse(), EDGES.kerb).pos.length, rim.pos.length);
});

test("ground over a lawn or terrace room on the ground rests on its floor; on open ground, or over a raised room, it starts at the ground", () => {
  const room = (floor: "grass" | "wood", level?: string) => ({ id: "r", name: "r", x: 0, y: 0, w: 10, h: 5, color: "#fff", floor, level });
  const levels = [{ id: "L0", name: "Ground", elevation: 0, height: 2.8 }, { id: "L1", name: "Raised", elevation: 1, height: 2.8 }];
  const a = area("a", 2, 2, 2, 2);
  assert.equal(groundBase({ rooms: [room("grass")], levels }, a), 0.06);
  assert.equal(groundBase({ rooms: [room("wood")], levels }, a), 0); // an indoor floor is not ground
  assert.equal(groundBase({ rooms: [room("grass", "L1")], levels }, a), 0); // a room lifted off the ground
  assert.equal(groundBase({ rooms: [room("grass")], levels }, area("far", 20, 20, 2, 2)), 0);
  assert.equal(groundBase({ rooms: [], levels }, path("p", [{ x: 0, y: 0 }, { x: 3, y: 0 }])), 0);
});
