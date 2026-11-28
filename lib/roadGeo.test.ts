import assert from "node:assert/strict";
import test from "node:test";
import { PATH_LIFT } from "./ground.ts";
import type { Tris } from "./groundGeo.ts";
import { PAVEMENT_RISE, STONE_HEIGHT, kerbTris, markTris, pavementTris, stoneSlabs, type RoadShape } from "./roadGeo.ts";

const road = (extra: Partial<RoadShape> = {}): RoadShape => ({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }], width: 4, ...extra });

/** Area-weighted sum of the triangle normals (x, y, z) and the total area. */
function normals(t: { pos: number[] }) {
  const sum = [0, 0, 0];
  let area = 0;
  for (let i = 0; i < t.pos.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((o) => [t.pos[i + o], t.pos[i + o + 1], t.pos[i + o + 2]]);
    const [e1, e2] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (let k = 0; k < 3; k++) sum[k] += n[k] / 2;
    area += Math.hypot(...n) / 2;
  }
  return { sum, area };
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
const noNaN = (t: Tris) => t.pos.every(Number.isFinite) && t.uv.every(Number.isFinite);

test("markings: one set of triangles, a colour per vertex, flat and facing up", () => {
  const dashed = markTris(road({ marks: "dashed" }));
  assert.equal(dashed.color.length, dashed.pos.length);
  assert.ok(dashed.pos.length > 0 && dashed.pos.every(Number.isFinite));
  const { sum, area } = normals(dashed);
  assert.ok(sum[1] > 0 && Math.abs(sum[1] - area) < 1e-6, "every triangle faces up");
  near(area, 5 * 2 * 0.12); // 20 m of road: five 2 m dashes, 0.12 m wide
  assert.equal(markTris(road()).pos.length, 0, "no marks, no triangles");
  const dbl = markTris(road({ marks: "double" }));
  assert.ok(new Set(dbl.color).size >= 2, "yellow, not white");
});

test("a pavement is a raised ribbon on the chosen side only", () => {
  assert.equal(pavementTris(road(), 1).pos.length, 0);
  const left = pavementTris(road({ pavement: "left", pavementWidth: 1.5 }), 1);
  const ys = left.pos.filter((_, i) => i % 3 === 1);
  assert.ok(ys.every((y) => y === PAVEMENT_RISE));
  const zs = left.pos.filter((_, i) => i % 3 === 2);
  assert.ok(Math.min(...zs) >= -3.5 - 1e-9 && Math.max(...zs) <= -2 + 1e-9, "left of +x is -y: 2 m to 3.5 m from the centre line");
  const { sum, area } = normals(left);
  assert.ok(Math.abs(area - 20 * 1.5) < 1e-6 && Math.abs(sum[1] - area) < 1e-6);
  assert.ok(Math.abs(normals(pavementTris(road({ pavement: "both" }), 1)).area - 2 * 20 * 1.8) < 1e-6, "both sides at the default width");
});

test("the kerb closes the pavement block: every face points away from its middle", () => {
  for (const side of ["left", "right"] as const) {
    const t = kerbTris(road({ pavement: side }));
    const { sum, area } = normals(t);
    assert.ok(area > 0);
    // outward faces round a block cancel out; only the outer face reaching PATH_LIFT further down (to the ground) is left over, pointing away from the road
    assert.ok(Math.abs(sum[0]) < 1e-6 && Math.abs(sum[1]) < 1e-6, `${side}: ${sum}`);
    near(sum[2], (side === "left" ? -1 : 1) * PATH_LIFT * 20);
    assert.ok(t.pos.filter((_, i) => i % 3 === 1).every((y) => y >= -PATH_LIFT - 1e-9 && y <= PAVEMENT_RISE + 1e-9));
    assert.equal(t.pos.length / 3, t.uv.length / 2);
  }
  assert.equal(kerbTris(road()).pos.length, 0);
});

test("a pavement on a bent, smooth road has no NaN and no empty geometry", () => {
  const bent = road({ points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 14, y: 9 }], smooth: true, pavement: "both", marks: "edges" });
  assert.ok(noNaN(pavementTris(bent, 1.2)));
  assert.ok(noNaN(kerbTris(bent)));
  assert.ok(markTris(bent).pos.every(Number.isFinite));
  assert.ok(pavementTris(bent, 1.2).pos.length > 0);
});

test("stepping stones: slabs standing on the ground, tops up, sides out, the same every time", () => {
  const p = { points: [{ x: 0, y: 0 }, { x: 6, y: 0 }], width: 0.8 };
  const a = stoneSlabs(p, 1, 2);
  assert.deepEqual(stoneSlabs(p, 1, 2), a);
  assert.ok(noNaN(a));
  const ys = a.pos.filter((_, i) => i % 3 === 1);
  assert.equal(Math.max(...ys), STONE_HEIGHT);
  assert.ok(Math.min(...ys) >= -PATH_LIFT - 1e-9);
  const { sum, area } = normals(a);
  assert.ok(Math.abs(sum[0]) < 1e-6 && Math.abs(sum[2]) < 1e-6, "the sides point outward all round each stone");
  assert.ok(area > 0 && sum[1] > 0);
  assert.ok(stoneSlabs(p, 1, 1).pos.length < a.pos.length, "fewer corner steps, fewer triangles (Eco)");
  assert.equal(stoneSlabs({ points: [{ x: 0, y: 0 }], width: 1 }, 1, 2).pos.length, 0);
});
