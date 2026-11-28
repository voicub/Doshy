import assert from "node:assert/strict";
import test from "node:test";
import { MARK_WHITE, MARK_YELLOW, distinctPoints, faceTris, lineBetween, lineLength, offsetLine, pavementBands, pointAtLength, ribbonTris, roadMarkStrips, smoothLine, stationsAlong, stoneRects } from "./lineGeometry.ts";
import type { Tris } from "./groundGeo.ts";
import type { Pt, RoadMarks } from "./types.ts";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not ${b}`);

test("stations: one at each end and an even gap, the remainder shared out", () => {
  const st = stationsAlong([{ x: 0, y: 0 }, { x: 10, y: 0 }], 3); // 10 / 3 rounds to 3 spans of 3.33 m
  assert.equal(st.length, 4);
  near(st[0].x, 0);
  near(st[3].x, 10);
  const gaps = st.slice(1).map((p, i) => p.x - st[i].x);
  for (const g of gaps) near(g, 10 / 3);
});

test("stations follow a bend and face the direction of travel", () => {
  const st = stationsAlong([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], 4); // 8 m: stations at 0, 4, 8
  assert.deepEqual(st.map((p) => [p.x, p.y]), [[0, 0], [4, 0], [4, 4]]);
  near(st[0].angle, 0);
  near(st[2].angle, Math.PI / 2); // the last station faces along the last segment (plan y down)
});

test("stations: a very short or degenerate line", () => {
  assert.equal(stationsAlong([{ x: 1, y: 1 }], 2).length, 0);
  assert.equal(stationsAlong([{ x: 1, y: 1 }, { x: 1, y: 1 }], 2).length, 0);
  assert.equal(stationsAlong([{ x: 0, y: 0 }, { x: 1, y: 0 }], 5).length, 2, "shorter than a spacing still gets both ends");
  assert.equal(stationsAlong([{ x: 0, y: 0 }, { x: 5, y: 0 }], 0).length, 0, "no spacing, no stations (and no endless loop)");
});

test("a point along the line is clamped to its ends and skips repeated points", () => {
  const line = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 6, y: 0 }];
  assert.equal(lineLength(line), 6);
  assert.equal(pointAtLength(line, -3)?.x, 0);
  assert.equal(pointAtLength(line, 99)?.x, 6);
  assert.equal(distinctPoints(line).length, 2);
});

test("a smoothed line passes through every point, stays straight for two points and is denser than the control points", () => {
  const ctl = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 5 }];
  const s = smoothLine(ctl);
  for (const c of ctl) assert.ok(s.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 1e-9), `passes through ${c.x},${c.y}`);
  assert.ok(s.length > ctl.length * 3);
  assert.deepEqual(smoothLine([{ x: 0, y: 0 }, { x: 3, y: 4 }]), [{ x: 0, y: 0 }, { x: 3, y: 4 }]);
  // centripetal: no overshoot beyond the control polygon's box at a sharp bend
  for (const p of s) assert.ok(p.x >= -0.5 && p.x <= 10.5 && p.y >= -0.5 && p.y <= 5.5);
});

// ---- offsets, ribbons, markings, pavements, stones -------------------------------------------------------------------------------

const finite = (pts: readonly { x: number; y: number }[]) => pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
const strips = (marks: RoadMarks, line: Pt[] = [{ x: 0, y: 0 }, { x: 20, y: 0 }], width = 4) => roadMarkStrips(line, width, marks);

test("offset: positive is the left of travel (y down), straight and bent", () => {
  const up = offsetLine([{ x: 0, y: 0 }, { x: 4, y: 0 }], 1);
  assert.deepEqual(up, [{ x: 0, y: -1 }, { x: 4, y: -1 }]); // walking +x, the viewer's left is up the screen
  const down = offsetLine([{ x: 0, y: 0 }, { x: 0, y: 4 }], 1);
  assert.deepEqual(down.map((p) => p.x), [1, 1]); // walking +y (down), left is +x
  const bent = offsetLine([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], 1); // turns right: left is the outside
  near(bent[1].x, 5);
  near(bent[1].y, -1);
});

test("offset: left and right of the same line mirror each other, and the point count is kept", () => {
  const line = [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 8, y: 6 }, { x: 14, y: 6 }];
  const [l, r] = [offsetLine(line, 0.7), offsetLine(line, -0.7)];
  assert.equal(l.length, line.length);
  assert.equal(r.length, line.length);
  line.forEach((p, i) => {
    near((l[i].x + r[i].x) / 2, p.x);
    near((l[i].y + r[i].y) / 2, p.y);
  });
});

test("offset: a sharp bend is capped, never a spike", () => {
  const line = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0.2, y: 0.4 }]; // a hairpin
  for (const d of [1, -1]) for (const p of offsetLine(line, d)) assert.ok(Math.hypot(p.x - 5, p.y) < 5 + 2, "no point shoots off");
  const tip = offsetLine(line, 1)[1];
  assert.ok(Math.hypot(tip.x - 5, tip.y) <= 2 + 1e-9, "at most two offsets from the vertex");
});

test("offset: the inside of a tight bend never doubles back", () => {
  // segments shorter than the offset on the inside of a turn
  const line = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3.4, y: 0.3 }, { x: 3.5, y: 0.8 }, { x: 3.4, y: 1.3 }, { x: 3, y: 1.6 }, { x: 0, y: 1.6 }];
  for (const d of [2, -2]) {
    const o = offsetLine(line, d);
    assert.equal(o.length, line.length);
    assert.ok(finite(o));
    for (let i = 1; i < line.length; i++) {
      const dot = (o[i].x - o[i - 1].x) * (line[i].x - line[i - 1].x) + (o[i].y - o[i - 1].y) * (line[i].y - line[i - 1].y);
      assert.ok(dot >= -1e-9, `segment ${i} runs backwards (${dot})`);
    }
  }
});

test("offset: repeated points, collinear points, one point and a U-turn are all finite", () => {
  assert.deepEqual(offsetLine([{ x: 1, y: 1 }, { x: 1, y: 1 }], 1), [{ x: 1, y: 1 }]);
  assert.equal(offsetLine([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }], 1).length, 3);
  assert.ok(finite(offsetLine([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 0 }], 1)));
  assert.ok(finite(offsetLine([{ x: 0, y: 0 }, { x: 0.001, y: 0 }, { x: 0.002, y: 0.001 }], 1)));
});

/** Area of the triangles (m2) and whether every normal points up. */
function ribbonStats(t: Tris) {
  let area = 0;
  let down = 0;
  for (let i = 0; i < t.pos.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((o) => [t.pos[i + o], t.pos[i + o + 1], t.pos[i + o + 2]]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    area += Math.abs(ny) / 2;
    if (ny < 0) down++;
  }
  return { area, down };
}

test("a ribbon covers the strip between two offsets and faces up", () => {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }];
  const { area, down } = ribbonStats(ribbonTris(offsetLine(line, 1), offsetLine(line, 3), 2, 0.1));
  assert.equal(down, 0);
  assert.ok(Math.abs(area - 40) < 0.5, `${area}`); // 2 m wide, 16 m long = 32, plus the 8 m2 square the mitre adds on the outside of the corner
});

test("a ribbon's texture keeps its scale: uv = metres / tile, heights as asked", () => {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const t = ribbonTris(offsetLine(line, 1), offsetLine(line, 3), 2, 0.1);
  assert.equal(t.pos.length / 3, t.uv.length / 2);
  assert.ok(t.pos.filter((_, i) => i % 3 === 1).every((y) => y === 0.1));
  near(Math.max(...t.uv.filter((_, i) => i % 2 === 0)), 5); // 10 m over a 2 m tile
  near(Math.max(...t.uv.filter((_, i) => i % 2 === 1)), 1); // 2 m across over a 2 m tile
});

test("ribbons: no strip from fewer than two points or mismatched empties", () => {
  assert.equal(ribbonTris([{ x: 0, y: 0 }], [{ x: 0, y: 1 }]).pos.length, 0);
  assert.equal(ribbonTris([], []).pos.length, 0);
  assert.equal(ribbonTris(offsetLine([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1), offsetLine([{ x: 0, y: 0 }, { x: 1, y: 0 }], 2), 0).pos.length, 0, "no tile size, no strip (and no NaN uvs)");
});

test("a wall along a line faces the side asked for", () => {
  const line = [{ x: 0, y: 0 }, { x: 4, y: 0 }]; // travelling +x: left is -y (z), right is +y
  for (const [facing, nz] of [["left", -1], ["right", 1]] as const) {
    const t = faceTris(line, 0, 0.12, facing);
    assert.equal(t.pos.length, 18);
    const [a, b, c] = [0, 3, 6].map((o) => [t.pos[o], t.pos[o + 1], t.pos[o + 2]]);
    const [e1, e2] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]];
    const nzOut = e1[0] * e2[1] - e1[1] * e2[0]; // z of the cross product
    assert.ok(nzOut * nz > 0, `${facing}`);
  }
  assert.equal(faceTris(line, 0.1, 0.1, "left").pos.length, 0);
});

test("dashed: 2 m dashes, the gaps fitted so it starts and ends with a dash", () => {
  for (const len of [20, 17.3, 5, 4.6, 61]) {
    const s = strips("dashed", [{ x: 0, y: 0 }, { x: len, y: 0 }]);
    assert.ok(s.length >= 2 && s.every((d) => d.color === MARK_WHITE), `${len}`);
    near(s[0].pts[0].x, 0);
    near(s[s.length - 1].pts[s[s.length - 1].pts.length - 1].x, len);
    const dash = s.map((d) => lineLength(d.pts));
    for (const l of dash) near(l, 2, 1e-6);
    const gaps = s.slice(1).map((d, i) => d.pts[0].x - s[i].pts[s[i].pts.length - 1].x);
    for (const g of gaps) assert.ok(g > 0 && Math.abs(g - gaps[0]) < 1e-6, `${len}: ${g}`);
    if (len > 15) assert.ok(Math.abs(gaps[0] - 3) < 0.6, `${len}: gap ${gaps[0]} stays near 3 m`);
  }
  assert.equal(strips("dashed", [{ x: 0, y: 0 }, { x: 3, y: 0 }]).length, 1, "a short road is one dash");
});

test("dashes follow a bend and carry its corner", () => {
  const s = strips("dashed", [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  assert.ok(s.some((d) => d.pts.length > 2), "the dash over the corner has three points");
  for (const d of s) assert.ok(finite(d.pts));
});

test("solid, edges and double markings", () => {
  assert.equal(strips("none").length, 0);
  const solid = strips("solid");
  assert.equal(solid.length, 1);
  near(lineLength(solid[0].pts), 20);
  const edges = strips("edges"); // 4 m road: lines at +-1.75 m
  assert.equal(edges.length, 2);
  near(Math.abs(edges[0].pts[0].y), 1.75);
  near(edges[0].pts[0].y, -edges[1].pts[0].y);
  assert.equal(strips("edges", undefined, 0.5).length, 0, "no room for edge lines on a lane this narrow");
  const dbl = strips("double");
  assert.equal(dbl.length, 2);
  assert.ok(dbl.every((d) => d.color === MARK_YELLOW));
  near(dbl[1].pts[0].y - dbl[0].pts[0].y, 0.22); // 0.1 m lines 0.12 m apart: centres 0.22 m apart
  near(dbl[0].width, 0.1);
});

test("markings: a degenerate line paints nothing and nothing is NaN", () => {
  for (const m of ["dashed", "solid", "edges", "double"] as const) {
    assert.equal(strips(m, [{ x: 1, y: 1 }]).length, 0);
    assert.equal(strips(m, [{ x: 1, y: 1 }, { x: 1, y: 1 }]).length, 0);
    for (const s of strips(m, [{ x: 0, y: 0 }, { x: 0.05, y: 0 }, { x: 0.05, y: 0.04 }])) assert.ok(finite(s.pts));
  }
});

test("pavements: one band per side, left and right opposite each other, joined point for point", () => {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 14, y: 5 }];
  assert.deepEqual(pavementBands(line, 6, 1.8, "none"), []);
  const [left] = pavementBands(line, 6, 1.8, "left");
  assert.equal(left.side, "left");
  near(left.inner[0].y, -3);
  near(left.outer[0].y, -4.8);
  const both = pavementBands(line, 6, 1.8, "both");
  assert.deepEqual(both.map((b) => b.side), ["left", "right"]);
  near(both[1].inner[0].y, 3);
  for (const b of both) {
    assert.equal(b.inner.length, b.outer.length);
    assert.ok(finite(b.inner) && finite(b.outer));
  }
  assert.deepEqual(pavementBands([{ x: 0, y: 0 }], 6, 1.8, "both"), []);
});

test("stepping stones: even pitch, hand-laid but repeatable, inside the path", () => {
  const line = [{ x: 0, y: 0 }, { x: 12, y: 0 }];
  const a = stoneRects(line, 0.8);
  assert.deepEqual(stoneRects(line, 0.8), a, "the same every time");
  assert.equal(a.length, 11); // 12 m at a 1.2 m pitch: 10 spans, a stone at each end
  near(a[0].x, 0, 1e-9);
  near(a[10].x, 12, 1e-9);
  assert.ok(new Set(a.map((s) => s.y)).size > 5, "shifted sideways, not in a ruler line");
  assert.ok(new Set(a.map((s) => s.angle)).size > 5);
  for (const s of a) {
    assert.ok(Math.abs(s.y) <= 0.05 * 0.8 + 1e-9);
    assert.ok(Math.abs(s.angle) <= 0.12 + 1e-9);
    assert.ok(s.w > 0.65 && s.w < 0.8 && s.l > 0.55 && s.l < 0.7, `${s.w} x ${s.l}`);
  }
  assert.equal(stoneRects([{ x: 0, y: 0 }, { x: 0.5, y: 0 }], 1).length, 1, "shorter than a pitch: one stone in the middle");
  assert.equal(stoneRects([{ x: 0, y: 0 }], 1).length, 0);
  assert.equal(stoneRects(line, 0).length, 0);
});

test("stepping stones follow a bend", () => {
  const s = stoneRects([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }], 1);
  assert.ok(s.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.angle)));
  assert.ok(s.some((q) => Math.abs(q.angle - Math.PI / 2) < 0.2), "the stones after the corner face down the plan");
});

test("lineBetween keeps the corners inside the range", () => {
  const line = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];
  assert.deepEqual(lineBetween(line, 2, 6), [{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }]);
  assert.deepEqual(lineBetween(line, 5, 5), []);
});
