import test from "node:test";
import assert from "node:assert/strict";
import { buildRoof, decomposeRects, normalizeRoof, roofBuffers, roofFootprint, roofForPlan, roofOf, type RoofFace } from "./roof.ts";
import type { Rect } from "./stairs.ts";
import type { Plan, Room, Roof } from "./types.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const area = (rs: Rect[]) => rs.reduce((s, r) => s + r.w * r.h, 0);
const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-9 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-9;
const pts = (faces: RoofFace[]) => faces.flatMap((f) => f.pts);
const R = (type: Roof["type"], pitch = 30, overhang = 0.4): Roof => ({ type, pitch, overhang });
const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);
const extent = (faces: RoofFace[]) => {
  const p = pts(faces);
  const xs = p.map((q) => q[0]);
  const zs = p.map((q) => q[2]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
};

/** Every point is covered exactly once: total area equals the union area and no two pieces overlap. */
function assertExactCover(pieces: Rect[], unionArea: number) {
  near(area(pieces), unionArea, 1e-6);
  pieces.forEach((a, i) => pieces.slice(i + 1).forEach((b) => assert.ok(!overlap(a, b))));
}

const L_SHAPE: Rect[] = [{ x: 0, y: 0, w: 8, h: 4 }, { x: 0, y: 4, w: 4, h: 4 }]; // area 48
const T_SHAPE: Rect[] = [{ x: 0, y: 0, w: 9, h: 3 }, { x: 3, y: 3, w: 3, h: 5 }]; // area 42
const U_SHAPE: Rect[] = [{ x: 0, y: 0, w: 3, h: 6 }, { x: 3, y: 3, w: 3, h: 3 }, { x: 6, y: 0, w: 3, h: 6 }]; // area 45

test("roof limits are clamped by normalizeRoof and bad values fall back to the defaults", () => {
  const d = normalizeRoof(undefined);
  assert.equal(normalizeRoof({ pitch: Number.NaN }).pitch, d.pitch);
  assert.deepEqual(normalizeRoof({ type: "hip", pitch: 200, overhang: -1 }), { type: "hip", pitch: 60, overhang: 0 });
  assert.equal(normalizeRoof({ type: "dome" as Roof["type"] }).type, "gable");
});

test("only a house has a roof", () => {
  assert.equal(roofOf({}), null);
  assert.equal(roofOf({ building: { type: "apartment", roof: R("hip") } }), null);
  assert.equal(roofOf({ building: { type: "house" } })!.type, "gable");
  assert.equal(roofOf({ building: { type: "house", roof: R("flat") } })!.type, "flat");
});

test("gable: ridge height is half the span times tan(pitch), ridge runs along the longer side", () => {
  const g = buildRoof([{ x: 2, y: 1, w: 8, h: 5 }], R("gable", 30, 0));
  near(g.peak, 2.5 * tan(30));
  const ridge = pts(g.faces).filter((p) => Math.abs(p[1] - g.peak) < 1e-9);
  assert.ok(ridge.every((p) => Math.abs(p[2] - 3.5) < 1e-9)); // centre line of the 5 m span
  assert.deepEqual([Math.min(...ridge.map((p) => p[0])), Math.max(...ridge.map((p) => p[0]))], [2, 10]);
  assert.equal(g.faces.length, 4); // two slopes, two gable ends
});

test("gable on a portrait footprint runs its ridge north-south", () => {
  const g = buildRoof([{ x: 0, y: 0, w: 4, h: 9 }], R("gable", 40, 0));
  near(g.peak, 2 * tan(40));
  const ridge = pts(g.faces).filter((p) => Math.abs(p[1] - g.peak) < 1e-9);
  assert.ok(ridge.every((p) => Math.abs(p[0] - 2) < 1e-9));
  assert.deepEqual([Math.min(...ridge.map((p) => p[2])), Math.max(...ridge.map((p) => p[2]))], [0, 9]);
});

test("overhang pushes the eaves out and down along the slope", () => {
  const g = buildRoof([{ x: 0, y: 0, w: 8, h: 4 }], R("gable", 30, 0.5));
  assert.deepEqual(extent(g.faces), [-0.5, 8.5, -0.5, 4.5]);
  near(Math.min(...pts(g.faces).map((p) => p[1])), -0.5 * tan(30));
  near(g.peak, 2 * tan(30)); // the overhang does not raise the ridge
});

test("hip: four slopes, ridge shortened by the span, same ridge height", () => {
  const g = buildRoof([{ x: 0, y: 0, w: 10, h: 6 }], R("hip", 35, 0));
  assert.equal(g.faces.length, 4);
  near(g.peak, 3 * tan(35));
  const ridge = pts(g.faces).filter((p) => Math.abs(p[1] - g.peak) < 1e-9).map((p) => p[0]);
  assert.deepEqual([Math.min(...ridge), Math.max(...ridge)], [3, 7]);
});

test("hip over a square is a pyramid of four triangles", () => {
  const g = buildRoof([{ x: 0, y: 0, w: 6, h: 6 }], R("hip", 30, 0));
  assert.equal(g.faces.length, 4);
  assert.ok(g.faces.every((f) => f.pts.length === 3));
  near(g.peak, 3 * tan(30));
});

test("shed: one slope across the short side, wall carried up to the high edge", () => {
  const g = buildRoof([{ x: 0, y: 0, w: 8, h: 4 }], R("shed", 20, 0));
  near(g.peak, 4 * tan(20));
  assert.equal(g.faces.length, 4); // slope, back wall, two end triangles
  near(g.faces.find((f) => f.normal[1] > 0.1)!.normal[1], Math.cos((20 * Math.PI) / 180));
});

test("flat: slab with a parapet around the outer edge", () => {
  const g = buildRoof([{ x: 0, y: 0, w: 6, h: 4 }], R("flat", 30, 0.3));
  const level = g.faces.filter((f) => f.normal[1] > 0.99);
  assert.equal(level.filter((f) => f.pts.every((p) => p[1] > 0.3)).length, 4); // parapet tops
  assert.equal(level.filter((f) => f.pts.every((p) => p[1] < 0.2)).length, 1); // the deck
  assert.ok(g.peak > 0.3 && g.peak < 0.6);
});

test("every face is flat, has a unit normal that matches its winding, and a gable has two upward slopes", () => {
  for (const type of ["gable", "hip", "shed", "flat"] as const) {
    for (const fp of [L_SHAPE, T_SHAPE, U_SHAPE, [{ x: 0, y: 0, w: 4, h: 9 }]]) {
      for (const f of buildRoof(fp, R(type)).faces) {
        near(Math.hypot(...f.normal), 1);
        const [a, b, c] = f.pts;
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        assert.ok(cross[0] * f.normal[0] + cross[1] * f.normal[1] + cross[2] * f.normal[2] > 0, `${type} winding`);
        for (const p of f.pts) near((p[0] - a[0]) * f.normal[0] + (p[1] - a[1]) * f.normal[1] + (p[2] - a[2]) * f.normal[2], 0);
      }
    }
  }
  assert.equal(buildRoof([{ x: 0, y: 0, w: 8, h: 4 }], R("gable")).faces.filter((f) => f.normal[1] > 0.1).length, 2);
});

test("L, T and U footprints decompose into rectangles without gaps or overlaps", () => {
  for (const [fp, a, n] of [[L_SHAPE, 48, 2], [T_SHAPE, 42, 2], [U_SHAPE, 45, 3]] as const) {
    const d = decomposeRects([...fp]);
    assertExactCover(d, a);
    assert.equal(d.length, n);
  }
});

test("overlapping and slightly misaligned rectangles still decompose into one clean cover", () => {
  // A and B overlap by 2 x 3; C starts 1 cm off B's edge and is snapped onto it
  const d = decomposeRects([{ x: 0, y: 0, w: 5, h: 4 }, { x: 3, y: 1, w: 5, h: 4 }, { x: 8.01, y: 1.005, w: 2, h: 4 }]);
  assertExactCover(d, 20 + 20 - 6 + 2.01 * 4);
  assert.deepEqual(decomposeRects([]), []);
});

test("a vertical cut wins when it needs fewer pieces", () => {
  // tall bar on the left with an arm to the right: 2 columns, but 3 rows
  const d = decomposeRects([{ x: 0, y: 0, w: 3, h: 9 }, { x: 3, y: 3, w: 5, h: 3 }]);
  assertExactCover(d, 27 + 15);
  assert.equal(d.length, 2);
});

test("each piece of an L gets its own roof; sides shared with the other piece get no overhang", () => {
  const g = buildRoof(L_SHAPE, R("gable", 30, 0.5));
  assert.equal(g.rects.length, 2);
  assert.equal(g.faces.length, 8);
  assert.deepEqual(extent(g.faces), [-0.5, 8.5, -0.5, 8.5]);
});

test("buffers triangulate every face", () => {
  const { faces } = buildRoof([{ x: 0, y: 0, w: 8, h: 4 }], R("gable"));
  const b = roofBuffers(faces);
  const verts = pts(faces).length;
  assert.equal(b.positions.length, verts * 3);
  assert.equal(b.uvs.length, verts * 2);
  assert.equal(b.indices.length, faces.reduce((s, f) => s + (f.pts.length - 2) * 3, 0));
  assert.ok(b.indices.every((i) => i < verts));
});

const room = (name: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id: name, name, x, y, w, h, color: "#fff", floor: "wood", ...extra });
const plan = (over: Partial<Plan>): Plan => ({ walls: [], openings: [], rooms: [], items: [], ...over });
const LEVELS = [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }];

test("footprint: rooms a wall apart merge into one rectangle; thresholds and open air are ignored", () => {
  const p = plan({
    rooms: [
      room("a", 0, 0, 4, 3),
      room("b", 4.12, 0, 3, 3), // a wall's thickness away
      room("door", 4, 1, 0.12, 0.9), // opening strip
      room("balcony", 0, 3.12, 4, 1.5, { name: "Balcony" }),
      room("lawn", 8, 0, 3, 3, { floor: "grass" }),
    ],
  });
  const d = decomposeRects(roofFootprint(p, "L0"));
  assert.equal(d.length, 1);
  near(d[0].x, -0.12);
  near(d[0].w, 7.12 + 0.24);
});

test("footprint falls back to the wall bounds, and is empty without either", () => {
  const w = plan({ walls: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, style: "plaster" }, { id: "w2", a: { x: 6, y: 0 }, b: { x: 6, y: 4 }, style: "plaster" }] });
  const [r] = roofFootprint(w, "L0");
  assert.equal(roofFootprint(w, "L0").length, 1);
  [r.x, r.y, r.w, r.h].forEach((v, i) => near(v, [-0.06, -0.06, 6.12, 4.12][i]));
  assert.deepEqual(roofFootprint(plan({}), "L0"), []);
});

test("apartment: no roof; house: roof on the top level's footprint only", () => {
  const rooms = [room("g", 0, 0, 10, 6), room("u", 0, 0, 5, 6, { level: "L1" })];
  assert.equal(roofForPlan(plan({ rooms, levels: LEVELS, building: { type: "apartment" } })), null);
  assert.equal(roofForPlan(plan({ rooms })), null);
  const r = roofForPlan(plan({ rooms, levels: LEVELS, building: { type: "house", roof: R("gable", 30, 0) } }))!;
  assert.equal(r.rects.length, 1);
  near(r.rects[0].w, 5.24);
  assert.equal(roofForPlan(plan({ levels: LEVELS, building: { type: "house" } })), null); // nothing built yet
});
