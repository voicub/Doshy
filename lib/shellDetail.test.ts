import test from "node:test";
import assert from "node:assert/strict";
import { CASING, CASING_W, SKIRTING, SKIRT_H, casingAround, hasCasing, mergeMeshData, metricUv, openingSpans, runsAround, buttEnds, stripAlongWall, sweepProfile, trimFaces, wallSlab, wallTrims, type MeshData, type Span, type TrimFaces } from "./shellDetail.ts";
import { WALL_CUT_H, WALL_H, WALL_T, wallLen } from "./geometry.ts";
import { isFence, wallHeight } from "./fences.ts";
import { starterPlan } from "./starterPlan.ts";
import { TEMPLATES } from "./templates.ts";
import type { Opening, Plan, Wall } from "./types.ts";

const door: Span = { s0: 1, s1: 1.9, sill: 0, top: 2.1, casing: true };
const win: Span = { s0: 3, s1: 4.2, sill: 0.9, top: 2.1, casing: true };

const bounds = (m: MeshData) => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.positions[i + k]); hi[k] = Math.max(hi[k], m.positions[i + k]); }
  return { lo, hi };
};

test("skirting runs skip a door and its casing but pass under a raised window", () => {
  const runs = runsAround(6, [door, win], 0, SKIRT_H, CASING_W);
  assert.deepEqual(runs.map((r) => [+r.s0.toFixed(3), +r.s1.toFixed(3)]), [[0, 1 - CASING_W], [1.9 + CASING_W, 6]].map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]));
});

test("a casing-less opening (arch) cuts the skirting exactly at its edges", () => {
  const runs = runsAround(4, [{ ...door, casing: false }], 0, SKIRT_H, CASING_W);
  assert.deepEqual(runs, [{ s0: 0, s1: 1 }, { s0: 1.9, s1: 4 }]);
});

test("overlapping openings and openings at the wall ends leave no negative or empty runs", () => {
  const runs = runsAround(3, [{ ...door, s0: -0.2, s1: 1.2, casing: false }, { ...door, s0: 1, s1: 2, casing: false }], 0, SKIRT_H, 0);
  assert.deepEqual(runs, [{ s0: 2, s1: 3 }]);
  assert.deepEqual(runsAround(3, [{ ...door, s0: 0, s1: 3, casing: false }], 0, SKIRT_H, 0), []);
});

test("a full-length strip measures the wall length and stands proud by the profile", () => {
  const m = stripAlongWall(SKIRTING, [{ s0: 0, s1: 4 }], 0.06, 0.12, 1);
  const { lo, hi } = bounds(m);
  assert.ok(Math.abs(hi[0] - lo[0] - 4) < 1e-5);
  assert.ok(Math.abs(lo[1] - 0.06) < 1e-5 && Math.abs(hi[1] - (0.06 + SKIRT_H)) < 1e-5);
  assert.ok(Math.abs(lo[2] - 0.06) < 1e-5 && Math.abs(hi[2] - (0.06 + 0.016)) < 1e-5);
});

test("the strip on face B stands on the other side of the wall", () => {
  const { lo, hi } = bounds(stripAlongWall(SKIRTING, [{ s0: 0, s1: 1 }], 0, 0.2, -1));
  assert.ok(Math.abs(hi[2] + 0.1) < 1e-5 && Math.abs(lo[2] + 0.116) < 1e-5);
});

test("every triangle winds the way its stored normal says (lit from outside)", () => {
  const m = mergeMeshData([stripAlongWall(SKIRTING, [{ s0: 0, s1: 2 }], 0, 0.12, 1), stripAlongWall(CASING, [{ s0: 0, s1: 2 }], 0, 0.12, -1, true), casingAround(win, 0.06, 0.12, -1)]);
  assert.ok(m.indices.length > 100);
  for (let t = 0; t < m.indices.length; t += 3) {
    const p = [0, 1, 2].map((k) => Array.from(m.positions.slice(m.indices[t + k] * 3, m.indices[t + k] * 3 + 3)));
    const n = Array.from(m.normals.slice(m.indices[t] * 3, m.indices[t] * 3 + 3));
    const e1 = p[1].map((v, i) => v - p[0][i]);
    const e2 = p[2].map((v, i) => v - p[0][i]);
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    assert.ok(c[0] * n[0] + c[1] * n[1] + c[2] * n[2] >= -1e-12, `triangle ${t / 3} faces inward`);
    assert.ok(Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) < 1e-5);
  }
});

test("a casing is mitred: head and jambs meet on the diagonal of the corner", () => {
  const w = bounds(casingAround(win, 0.06, 0.12, 1));
  assert.ok(Math.abs(w.lo[0] - (win.s0 - CASING_W)) < 1e-5 && Math.abs(w.hi[0] - (win.s1 + CASING_W)) < 1e-5);
  assert.ok(Math.abs(w.lo[1] - win.sill) < 1e-5, "a window casing starts at the sill, no bottom strip");
  assert.ok(Math.abs(w.hi[1] - (win.top + CASING_W)) < 1e-5);
  const d = bounds(casingAround(door, 0.06, 0.12, 1));
  assert.ok(Math.abs(d.lo[1] - 0.06) < 1e-5, "a door casing stands on the floor");
});

test("a jamb's top end is cut at 45 degrees (outer edge reaches one casing width higher than the inner)", () => {
  const m = sweepProfile(CASING, 0, 2, 0, 1, { o: [0, 0, 0], s: [0, 1, 0], d: [-1, 0, 0], z: [0, 0, 1] });
  let innerTop = -Infinity;
  let outerTop = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i];
    if (Math.abs(x) < 1e-6) innerTop = Math.max(innerTop, m.positions[i + 1]);
    if (Math.abs(x + CASING_W) < 1e-6) outerTop = Math.max(outerTop, m.positions[i + 1]);
  }
  assert.ok(Math.abs(innerTop - 2) < 1e-5 && Math.abs(outerTop - (2 + CASING_W)) < 1e-5);
});

test("hasCasing: arches, gates and garage doors keep their own surround", () => {
  for (const s of ["arch", "arched", "round", "bay", "garageSectional", "gate", "shopfront"]) assert.equal(hasCasing(s), false);
  for (const s of ["single", "double", "casement", "picture", "passage"]) assert.equal(hasCasing(s), true);
});

test("metric uvs: a tile is a fixed number of metres whatever the box size, and they line up through the world offset", () => {
  const pos = [0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0];
  const nor = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uv = new Float32Array(8);
  metricUv(pos, nor, uv, [1, 0, 0], () => ({ tile: 0.5 }));
  assert.deepEqual(Array.from(uv), [2, 0, 6, 0, 6, 6, 2, 6]);
  metricUv(pos, nor, uv, [0, 0, 0], () => ({ tile: 1, swap: true }));
  assert.deepEqual(Array.from(uv), [0, 0, 0, 2, 3, 2, 3, 0]);
});

test("buttEnds: a collinear continuation or a T stops a wall at its point; an L corner and a free end still overshoot", () => {
  const w = { id: "a", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
  const next = { id: "b", a: { x: 4, y: 0 }, b: { x: 7, y: 0 } };
  const prevReversed = { id: "c", a: { x: 0, y: 0 }, b: { x: -2, y: 0 } };
  const corner = { id: "d", a: { x: 4, y: 0 }, b: { x: 4, y: 3 } };
  assert.deepEqual(buttEnds(w, [w, next]), [false, true]);
  assert.deepEqual(buttEnds(w, [prevReversed, next]), [true, true]);
  assert.deepEqual(buttEnds(w, [corner]), [false, false]);
  assert.deepEqual(buttEnds(w, []), [false, false]);
  const through = { id: "e", a: { x: 4, y: -2 }, b: { x: 4, y: 3 } };
  assert.deepEqual(buttEnds(w, [through]), [false, true], "ending in the middle of another wall: a T");
});

test("wallSlab: a w x h x t slab, ends flat, top edges rounded, grouped like a box, every face looks outward", () => {
  const m = wallSlab(3, 2.5, 0.12, 0.012, 2);
  const { lo, hi } = bounds(m);
  assert.deepEqual(lo.map((v) => +v.toFixed(4)), [-1.5, -1.25, -0.06]);
  assert.deepEqual(hi.map((v) => +v.toFixed(4)), [1.5, 1.25, 0.06]);
  assert.deepEqual(m.groups?.map((g) => g.tag), [0, 1, 2, 3, 4, 5]);
  assert.equal(m.groups?.reduce((a, g) => a + g.count, 0), m.indices.length);
  for (let t = 0; t < m.indices.length; t += 3) {
    const i = m.indices[t];
    const c = [0, 1, 2].map((k) => [0, 1, 2].reduce((a, j) => a + m.positions[m.indices[t + j] * 3 + k], 0) / 3);
    const n = Array.from(m.normals.slice(i * 3, i * 3 + 3));
    assert.ok(c[0] * n[0] + c[1] * n[1] + c[2] * n[2] > 0, "face points into the slab");
    // and the winding agrees: (b - a) x (c - a) points the same way as the normal
    const p = [0, 1, 2].map((j) => Array.from(m.positions.slice(m.indices[t + j] * 3, m.indices[t + j] * 3 + 3)));
    const e1 = p[1].map((v, k) => v - p[0][k]);
    const e2 = p[2].map((v, k) => v - p[0][k]);
    const x = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    assert.ok(x[0] * n[0] + x[1] * n[1] + x[2] * n[2] >= 0);
  }
  // the top corner is cut: no vertex sits at the sharp (t/2, h) corner
  const corner = Array.from({ length: m.positions.length / 3 }, (_, i) => [m.positions[i * 3 + 1], m.positions[i * 3 + 2]]).some(([y, z]) => Math.abs(y - 1.25) < 1e-4 && Math.abs(z - 0.06) < 1e-4);
  assert.equal(corner, false);
  const sharp = wallSlab(3, 2.5, 0.12, 0.012, 0);
  assert.equal(sharp.positions.length / 3 > 0, true);
});

// ---- trims stay on their wall ----------------------------------------------------------------------------------------------

const PROUD = 0.1; // no trim stands further off a face than this (the deepest profile is a 5 cm crown)

/** Every vertex of `m` (a wall's trim in its own centred frame) placed in the plan as the scene's wall group places it, then measured against the wall's own centre line. */
function strayVertices(m: MeshData, wall: Wall, height: number): string[] {
  const t = wall.thickness ?? WALL_T;
  const len = wallLen(wall);
  const a = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
  const [mx, my] = [(wall.a.x + wall.b.x) / 2, (wall.a.y + wall.b.y) / 2];
  const bad: string[] = [];
  for (let i = 0; i < m.positions.length; i += 3) {
    const [x, y, z] = [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
    // the group is rotated -a about y: local x runs along the wall, local +z is (-sin a, cos a) in the plan
    const [X, Z] = [mx + x * Math.cos(a) - z * Math.sin(a), my + x * Math.sin(a) + z * Math.cos(a)];
    const along = (X - wall.a.x) * Math.cos(a) + (Z - wall.a.y) * Math.sin(a);
    const across = -(X - wall.a.x) * Math.sin(a) + (Z - wall.a.y) * Math.cos(a);
    if (along < -t - 1e-4 || along > len + t + 1e-4 || Math.abs(across) > t / 2 + PROUD + 1e-4 || y < -1e-4 || y > height + 1e-4) bad.push(`(${along.toFixed(2)} along, ${across.toFixed(2)} across, ${y.toFixed(2)} up)`);
  }
  return bad;
}

const plain = (x0: number, y0: number, x1: number, y1: number, extra: Partial<Wall> = {}): Wall => ({ id: "w", a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, ...extra }) as Wall;
const everyFace: TrimFaces[] = [{ inside: [1, -1], outside: 0 }, { inside: [1], outside: -1 }, { inside: [-1], outside: 1 }];

test("a wall's trims are centred on it like its slab and openings: a bare wall's skirting spans -len/2 .. len/2", () => {
  const m = wallTrims({ len: 6, t: 0.12, height: 2.58, top: 2.58, spans: [], faces: { inside: [1], outside: 0 }, ground: false, crown: false }).paint!;
  const b = bounds(m);
  assert.ok(Math.abs(b.lo[0] + 3) < 1e-6 && Math.abs(b.hi[0] - 3) < 1e-6, `x ${b.lo[0]}..${b.hi[0]}`);
});

test("trims never reach past the wall's own footprint, whatever its angle, length, openings or cut-away", () => {
  const openings = (len: number): Span[] => [{ s0: 0, s1: Math.min(len, 0.9), sill: 0, top: 2.04, casing: true }, { s0: Math.max(0, len - 1.2), s1: len, sill: 0.9, top: 2.58, casing: true }];
  for (const deg of [0, 17, 45, 90, 133, 180, 271]) {
    const a = (deg * Math.PI) / 180;
    for (const len of [0, 0.02, 0.3, 0.9, 2.5, 7.4]) {
      const wall = plain(3, -2, 3 + Math.cos(a) * len, -2 + Math.sin(a) * len);
      for (const top of [0.9, 2.58]) {
        const spans = openings(len).filter((o) => o.sill < top && o.s1 > o.s0).map((o) => ({ ...o, top: Math.min(o.top, top) }));
        for (const faces of everyFace) {
          const { paint, base } = wallTrims({ len, t: 0.12, height: 2.58, top, spans, faces, ground: true, crown: top >= 2.58 });
          for (const m of [paint, base]) if (m) assert.deepEqual(strayVertices(m, wall, 2.58), [], `${deg} deg, len ${len}, top ${top}`);
        }
      }
    }
  }
});

test("a lintel casing that would stand above the wall's top is left off", () => {
  const tall: Span = { s0: 1, s1: 2, sill: 0, top: 2.58, casing: true };
  const withHead = (top: number, o: Span) => bounds(wallTrims({ len: 4, t: 0.12, height: 2.58, top, spans: [o], faces: { inside: [], outside: 1 }, ground: false, crown: false }).paint!);
  assert.ok(withHead(2.58, tall).hi[1] <= 2.58 + 1e-6);
  assert.ok(withHead(2.58, { ...tall, top: 2.04 }).hi[1] > 2.04 + CASING_W - 1e-6); // a door with room above it keeps its head
});

test("openingSpans drops an opening that lies beyond the wall and clamps one that overhangs", () => {
  const o = (t: number, width: number) => ({ id: "o", wallId: "w", type: "door", t, width, height: 2.04, sill: 0 }) as Opening;
  assert.deepEqual(openingSpans([o(1.5, 0.9)], 2, 2.58), []);
  assert.deepEqual(openingSpans([o(0.5, 0.9)], 0.6, 2.58).map((s) => [s.s0, s.s1]), [[0, 0.6]]);
  assert.deepEqual(openingSpans([{ ...o(0.5, 0.9), sill: 1 }], 4, 0.9), []);
});

test("on the owner's flat and every template, no trim of any wall leaves the wall's footprint (cut-away or not, any storey)", () => {
  const plans: [string, Plan][] = [["starter flat", starterPlan()], ...TEMPLATES.map((t): [string, Plan] => [t.name, t.build()])];
  let walls = 0;
  for (const [name, plan] of plans) {
    for (const wall of plan.walls) {
      const len = wallLen(wall);
      const H = wallHeight(wall, WALL_H);
      const mine = plan.openings.filter((o) => o.wallId === wall.id);
      const faces = trimFaces(plan, wall);
      if (isFence(wall.style)) assert.deepEqual(faces, { inside: [], outside: 0 }, `${name}: a fence carries no trim`);
      for (const top of [Math.min(H, WALL_CUT_H), H]) {
        for (const ground of [true, false]) {
          const { paint, base } = wallTrims({ len, t: wall.thickness ?? WALL_T, height: H, top, spans: openingSpans(mine, len, top), faces, ground, crown: top >= H && H >= 2.2 });
          for (const m of [paint, base]) if (m) assert.deepEqual(strayVertices(m, wall, H), [], `${name}, wall ${wall.id} (${len.toFixed(2)} m), top ${top}`);
        }
      }
      walls++;
    }
  }
  assert.ok(walls > 30, `only ${walls} walls checked`);
});
