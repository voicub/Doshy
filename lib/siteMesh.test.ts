import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { planToSite, siteToPlan } from "./geo.ts";
import { pointInShape, polygonArea } from "./siteGeom.ts";
import { parseOverpass } from "./siteOsm.ts";
import type { Plan } from "./types.ts";
import { WALL_CUT_H } from "./geometry.ts";
import {
  CUT_FAR_M,
  CUT_NEAR_M,
  CUT_STRIDE,
  cutFactor,
  cutKeep,
  ringRectDistance,
  HOME_BLEND_M,
  HOME_FLAT_M,
  addRibbon,
  buildBuildings,
  buildWater,
  carveWater,
  buildingStyle,
  demAt,
  eaves,
  groundFn,
  hashStr,
  homeRect,
  isHostBuilding,
  newBuf,
  orientedBox,
  parseCssColor,
  pickSpecies,
  planFootprint,
  planBuilding,
  rectDistance,
  roofOf,
  scatterIn,
  selectBuildings,
  terrainBlend,
  terrainGrid,
  thinTrees,
  triangulate,
  areaTrees,
  type Buf,
  type PlanBuilding,
} from "./siteMesh.ts";
import type { SiteBuilding, SiteTerrain, XY } from "./siteTypes.ts";

const rect = (x0: number, y0: number, x1: number, y1: number): XY[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const identity = (p: XY): XY => p;
const yRange = (b: Buf): [number, number] => {
  const ys = b.pos.filter((_, i) => i % 3 === 1);
  return [Math.min(...ys), Math.max(...ys)];
};
const building = (over: Partial<SiteBuilding> = {}): SiteBuilding => ({ id: "w1", ring: rect(0, 0, 10, 6), height: 6, minHeight: 0, roof: "flat", roofHeight: 0, kind: "apartments", ...over });
const plan = (over: Partial<SiteBuilding> = {}): PlanBuilding => planBuilding(building(over), identity)!;
/** the area of the triangles in a buffer seen from above */
const topArea = (b: Buf) => {
  let s = 0;
  for (let i = 0; i < b.pos.length; i += 9) {
    const [ax, az, bx, bz, cx, cz] = [b.pos[i], b.pos[i + 2], b.pos[i + 3], b.pos[i + 5], b.pos[i + 6], b.pos[i + 8]];
    s += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  return s;
};

describe("triangulate", () => {
  it("covers a square exactly", () => {
    const { pts, tris } = triangulate(rect(0, 0, 4, 4));
    assert.equal(tris.length, 2);
    const area = tris.reduce((s, [a, b, c]) => s + polygonArea([pts[a], pts[b], pts[c]]), 0);
    assert.ok(Math.abs(area - 16) < 1e-9);
  });
  it("leaves holes empty", () => {
    const { pts, tris } = triangulate(rect(0, 0, 10, 10), [rect(3, 3, 6, 6)]);
    const area = tris.reduce((s, [a, b, c]) => s + polygonArea([pts[a], pts[b], pts[c]]), 0);
    assert.ok(Math.abs(area - (100 - 9)) < 1e-9);
  });
  it("copes with a closed ring, an L shape and either winding", () => {
    const L: XY[] = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6], [0, 0]];
    for (const ring of [L, [...L].reverse()]) {
      const { pts, tris } = triangulate(ring);
      assert.ok(Math.abs(tris.reduce((s, [a, b, c]) => s + polygonArea([pts[a], pts[b], pts[c]]), 0) - 20) < 1e-9);
    }
    assert.deepEqual(triangulate([[0, 0], [1, 1]]).tris, []);
  });
});

describe("eaves (wall height rules)", () => {
  it("clamps silly heights and keeps two metres of wall above a lifted base", () => {
    assert.equal(eaves({ height: 15, minHeight: 0 }).top, 15);
    assert.equal(eaves({ height: 0.2, minHeight: 0 }).top, 2.4);
    assert.equal(eaves({ height: 9000, minHeight: 0 }).top, 250);
    assert.equal(eaves({ height: NaN, minHeight: 0 }).top, 6);
    assert.deepEqual(eaves({ height: 10, minHeight: 9.5 }), { top: 10, bottom: 8 });
    assert.equal(eaves({ height: 10, minHeight: -3 }).bottom, 0);
  });
});

describe("planBuilding", () => {
  it("turns the outline clockwise on screen and holes the other way, drops slivers", () => {
    const ccw = planBuilding(building({ ring: [...rect(0, 0, 10, 6)].reverse(), holes: [rect(2, 2, 4, 4)] }), identity)!;
    const sa = (r: XY[]) => r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0);
    assert.ok(sa(ccw.ring) > 0);
    assert.ok(sa(ccw.holes[0]) < 0);
    assert.equal(planBuilding(building({ ring: rect(0, 0, 1, 1) }), identity), null);
  });
  it("follows the plan's bearing", () => {
    const toPlan = (p: XY) => siteToPlan({ dx: 3, dy: -2 }, 90, p);
    const b = planBuilding(building(), toPlan)!;
    const back = b.ring.map((p) => planToSite({ dx: 3, dy: -2 }, 90, p));
    for (const p of back) assert.ok(rect(0, 0, 10, 6).some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9));
  });
});

describe("walls and roofs", () => {
  it("a flat roof: walls to the eaves plus a low parapet, one cap", () => {
    const { walls, roofs } = buildBuildings([plan()], () => 0);
    const [wlo, whi] = yRange(walls);
    assert.ok(Math.abs(whi - 6) < 1e-9);
    assert.ok(wlo < 0 && wlo >= -0.5, "walls dip below the ground, never far");
    assert.ok(yRange(roofs)[1] <= 6.3 + 1e-9);
    assert.equal(walls.pos.length / 9, 8); // four walls, two triangles each
    assert.ok(roofs.pos.length / 9 >= 2 + 8);
    assert.ok(Math.abs(topArea(roofs) - 60) < 1e-9, "one cap over the footprint");
  });
  it("a gabled roof peaks at eaves + roof height along the long axis", () => {
    const { walls, roofs } = buildBuildings([plan({ roof: "gabled", roofHeight: 3 })], () => 0);
    assert.ok(Math.abs(yRange(roofs)[1] - 9) < 1e-9);
    assert.ok(Math.abs(yRange(roofs)[0] - 6) < 1e-9);
    assert.ok(Math.abs(yRange(walls)[1] - 9) < 1e-9, "gable ends are closed up to the ridge");
    // ridge runs along x (10 m long): vertices at the top have z = 3
    const top: number[] = [];
    for (let i = 0; i < roofs.pos.length; i += 3) if (Math.abs(roofs.pos[i + 1] - 9) < 1e-9) top.push(roofs.pos[i + 2]);
    assert.ok(top.length >= 2 && top.every((z) => Math.abs(z - 3) < 1e-9));
    assert.ok(Math.abs(topArea(roofs) - 60) < 1e-6, "the slopes cover the footprint");
  });
  it("a hipped roof has a shorter ridge and four faces", () => {
    const { roofs } = buildBuildings([plan({ roof: "hipped", roofHeight: 2 })], () => 0);
    assert.ok(Math.abs(yRange(roofs)[1] - 8) < 1e-9);
    const ridge: number[] = [];
    for (let i = 0; i < roofs.pos.length; i += 3) if (Math.abs(roofs.pos[i + 1] - 8) < 1e-9) ridge.push(roofs.pos[i]);
    assert.ok(Math.min(...ridge) > 0.5 && Math.max(...ridge) < 9.5, "ridge ends are drawn in from the walls");
    assert.ok(roofs.pos.length / 9 >= 4);
    assert.ok(Math.abs(topArea(roofs) - 60) < 1e-6);
  });
  it("a pyramidal roof comes to a point; skillion rises across; dome is a low cap", () => {
    const square = rect(0, 0, 8, 8);
    const pyr = buildBuildings([plan({ ring: square, roof: "pyramidal", roofHeight: 4 })], () => 0).roofs;
    const apex: number[] = [];
    for (let i = 0; i < pyr.pos.length; i += 3) if (Math.abs(pyr.pos[i + 1] - 10) < 1e-9) apex.push(pyr.pos[i], pyr.pos[i + 2]);
    assert.ok(apex.every((v) => Math.abs(v - 4) < 1e-9));
    const skill = buildBuildings([plan({ roof: "skillion", roofHeight: 2 })], () => 0).roofs;
    assert.ok(Math.abs(yRange(skill)[0] - 6) < 1e-9 && Math.abs(yRange(skill)[1] - 8) < 1e-9);
    const dome = buildBuildings([plan({ ring: square, roof: "dome", roofHeight: 2 })], () => 0).roofs;
    assert.ok(Math.abs(yRange(dome)[1] - 8) < 1e-9);
  });
  it("faces point outwards and upwards", () => {
    const { walls, roofs } = buildBuildings([plan({ roof: "gabled", roofHeight: 3 })], () => 0);
    for (let i = 0; i < walls.nrm.length; i += 9) assert.ok(Math.abs(walls.nrm[i + 1]) < 1e-12);
    for (let i = 0; i < roofs.nrm.length; i += 9) assert.ok(roofs.nrm[i + 1] > 0.1);
    // a wall's normal points away from the middle of the footprint (5, 3)
    for (let i = 0; i < walls.pos.length; i += 9) {
      const cx = (walls.pos[i] + walls.pos[i + 3] + walls.pos[i + 6]) / 3;
      const cz = (walls.pos[i + 2] + walls.pos[i + 5] + walls.pos[i + 8]) / 3;
      assert.ok((cx - 5) * walls.nrm[i] + (cz - 3) * walls.nrm[i + 2] > 0);
    }
    // and the winding agrees with the stored normal
    for (let i = 0; i < roofs.pos.length; i += 9) {
      const p = roofs.pos;
      const ny = (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i]) - (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]);
      assert.ok(ny > 0, "counter-clockwise seen from above");
    }
  });
  it("a courtyard building gets inner walls too", () => {
    const solid = buildBuildings([plan({ ring: rect(0, 0, 20, 20) })], () => 0).walls.pos.length;
    const ring = buildBuildings([plan({ ring: rect(0, 0, 20, 20), holes: [rect(5, 5, 15, 15)] })], () => 0).walls.pos.length;
    assert.equal(ring, solid * 2);
  });
  it("stands on the lowest ground under its outline and lifts with minHeight", () => {
    const slope = (x: number) => x * 0.1;
    const { walls } = buildBuildings([plan()], slope);
    assert.ok(Math.abs(yRange(walls)[1] - 6) < 1e-9, "eaves measured from the low corner (0)");
    const lifted = buildBuildings([plan({ minHeight: 3 })], () => 0).walls;
    assert.ok(Math.abs(yRange(lifted)[0] - 3) < 1e-9);
  });
  it("window rows follow the storeys; sheds are plain", () => {
    const tall = buildBuildings([plan({ height: 12 })], () => 0).walls;
    const vs = tall.uv.filter((_, i) => i % 2 === 1);
    assert.ok(Math.max(...vs) - Math.min(...vs) > 0.4, "four storeys of an 8-storey texture is half of it");
    const shed = buildBuildings([plan({ kind: "shed", height: 2.6 })], () => 0).walls;
    assert.equal(new Set(shed.uv).size, 1);
    assert.equal(buildingStyle(plan({ kind: "shed" })).glazed, false);
    assert.equal(buildingStyle(plan({ kind: "apartments" })).glazed, true);
  });
  it("is deterministic and uses OSM colours when given", () => {
    const a = buildBuildings([plan()], () => 0);
    const b = buildBuildings([plan()], () => 0);
    assert.deepEqual(a.walls.col, b.walls.col);
    const red = buildingStyle(plan({ roofColor: "#ff0000", wallColor: "white" }));
    assert.ok(red.roof[0] > 0.9 && red.roof[1] === 0);
    assert.deepEqual(red.wall, [1, 1, 1]);
  });
  it("finds a ridge along the long side of any turned rectangle", () => {
    const turned: XY[] = rect(0, 0, 12, 4).map(([x, y]) => [x * Math.cos(0.6) - y * Math.sin(0.6), x * Math.sin(0.6) + y * Math.cos(0.6)]);
    const box = orientedBox(turned);
    assert.ok(Math.abs(box.hl - 6) < 1e-6 && Math.abs(box.hw - 2) < 1e-6);
    const roof = roofOf("gabled", box, 2)!;
    assert.ok(Math.abs(roof.height(box.cx, box.cy) - 2) < 1e-9);
    assert.ok(Math.abs(roof.height(box.cx + box.vx * 2, box.cy + box.vy * 2)) < 1e-9);
  });
  it("copes with an L-shaped gable", () => {
    const L: XY[] = [[0, 0], [12, 0], [12, 4], [4, 4], [4, 10], [0, 10]];
    const { roofs } = buildBuildings([plan({ ring: L, roof: "gabled", roofHeight: 2 })], () => 0);
    assert.ok(Math.abs(topArea(roofs) - polygonArea(L)) < 1e-6);
  });
});

describe("terrain", () => {
  const dem: SiteTerrain = { n: 5, step: 50, h: Array.from({ length: 25 }, (_, k) => 10 + (k % 5)), base: 300 }; // rises 1 m per column
  const toSite = (p: XY) => planToSite({ dx: 0, dy: 0 }, 0, p);
  const home = { x0: 0, y0: 0, x1: 10, y1: 10 };
  it("blends from 0 at the home to the DEM far away", () => {
    assert.equal(terrainBlend(0), 0);
    assert.equal(terrainBlend(HOME_FLAT_M), 0);
    assert.equal(terrainBlend(HOME_FLAT_M + HOME_BLEND_M), 1);
    assert.ok(terrainBlend(HOME_FLAT_M + HOME_BLEND_M / 2) > 0.4 && terrainBlend(HOME_FLAT_M + HOME_BLEND_M / 2) < 0.6);
    const ground = groundFn(dem, home, toSite);
    assert.equal(ground(5, 5), 0);
    assert.equal(ground(5 + HOME_FLAT_M, 5), 0);
    assert.equal(ground(-HOME_FLAT_M, 0), 0);
    const far = 100;
    assert.ok(Math.abs(ground(far, 0) - demAt(dem, far, 0)) < 1e-9);
    assert.ok(Math.abs(ground(0, far) - demAt(dem, 0, far)) < 1e-9);
  });
  it("is monotone along the blend and flat without data", () => {
    const ground = groundFn(dem, home, toSite);
    let last = -Infinity;
    for (let d = 10; d <= 60; d += 2.5) {
      const v = ground(d, 5);
      assert.ok(v >= last - 1e-9, `rising at ${d}`);
      last = v;
    }
    assert.equal(groundFn(undefined, home, toSite)(500, 500), 0);
    assert.equal(groundFn({ n: 1, step: 1, h: [0], base: 0 }, home, toSite)(5, 5), 0);
  });
  it("samples the DEM bilinearly and clamps at its edge", () => {
    assert.equal(demAt(dem, 0, 0), 12);
    assert.equal(demAt(dem, 25, 0), 12.5);
    assert.equal(demAt(dem, 9999, 0), 14);
    assert.equal(demAt(dem, -9999, 0), 10);
  });
  it("home rectangle snaps outwards", () => {
    assert.deepEqual(homeRect({ x0: 5.2, y0: 5.2, x1: 15.1, y1: 9.9 }), { x0: 4, y0: 4, x1: 16, y1: 12 });
    assert.equal(rectDistance(20, 5, home), 10);
    assert.equal(rectDistance(5, 5, home), 0);
  });
  it("builds an indexed grid of the asked size with up-pointing normals", () => {
    const g = terrainGrid([5, 5], 100, 5, groundFn(dem, home, toSite), toSite);
    assert.equal(g.n, 41);
    assert.equal(g.positions.length, 41 * 41 * 3);
    assert.equal(g.index.length, 40 * 40 * 6);
    for (let k = 1; k < g.normals.length; k += 3) assert.ok(g.normals[k] > 0.9);
    const centre = (20 * 41 + 20) * 3;
    assert.equal(g.positions[centre + 1], 0);
    assert.ok(g.index instanceof Uint16Array);
    assert.ok(terrainGrid([0, 0], 600, 4, () => 0, toSite).index instanceof Uint32Array);
    // every triangle faces up
    for (let i = 0; i < g.index.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => g.index[i + k] * 3);
      const p = g.positions;
      assert.ok((p[b + 2] - p[a + 2]) * (p[c] - p[a]) - (p[b] - p[a]) * (p[c + 2] - p[a + 2]) > 0);
    }
  });
});

describe("host building", () => {
  const foot = { x0: 0, y0: 0, x1: 10, y1: 8 };
  const mk = (ring: XY[], id = "b") => planBuilding(building({ id, ring }), identity)!;
  it("skips the block under the plan and the one holding the home point", () => {
    assert.equal(isHostBuilding(mk(rect(-5, -5, 30, 12)), foot, []), true, "swallows the plan");
    assert.equal(isHostBuilding(mk(rect(8, 6, 20, 20)), foot, []), true, "overlaps a corner");
    assert.equal(isHostBuilding(mk(rect(40, 40, 50, 50)), foot, [[45, 45]]), true, "holds the home point");
    assert.equal(isHostBuilding(mk(rect(14, 0, 24, 8)), foot, [[5, 4]]), false);
    assert.equal(isHostBuilding(mk(rect(11, 0, 20, 8)), null, []), false);
  });
  it("selectBuildings drops the host, the far and the over-budget, nearest first", () => {
    const all = [mk(rect(-5, -5, 30, 12), "host"), mk(rect(30, 0, 40, 8), "far"), mk(rect(14, 0, 24, 8), "near"), mk(rect(100, 0, 110, 8), "gone"), mk(rect(60, 0, 70, 8), "mid")];
    const picked = selectBuildings(all, { footprint: foot, homes: [[5, 4]], at: [5, 4], radius: 90, max: 10 }).map((b) => b.id);
    assert.deepEqual(picked, ["near", "far", "mid"]);
    assert.deepEqual(selectBuildings(all, { footprint: foot, homes: [], at: [5, 4], radius: 90, max: 1 }).map((b) => b.id), ["near"]);
    assert.ok(selectBuildings(all, { footprint: foot, homes: [], at: [5, 4], radius: 90, max: 10, showHost: true }).some((b) => b.id === "host"));
  });
});

describe("host buildings on the recorded neighbourhood (OSM fixture)", () => {
  const C = { lat: 51.4779, lon: -0.0015 };
  const fixture: unknown = JSON.parse(readFileSync(new URL("./siteOsm.fixture.json", import.meta.url), "utf8"));
  const real = parseOverpass(fixture, C, 150).buildings;
  // a 14 x 9 flat with a turned patio on its west side
  const flat = { walls: [], openings: [], items: [], rooms: [{ id: "r", name: "r", x: 0, y: 0, w: 14, h: 9, color: "#fff", floor: "wood" }], ground: [{ id: "g", x: -6, y: 2, w: 6, h: 3, rot: 30, kind: "lawn" }] } as unknown as Plan;
  const foot = planFootprint(flat)!;
  const MARGIN = 1.5;
  /** dx, dy that put site point P at the plan's centre when the plan is turned `bearing` */
  const placed = (bearing: number, P: XY) => {
    const t = planToSite({ dx: 0, dy: 0 }, bearing, [7, 4.5]);
    return { dx: P[0] - t[0], dy: P[1] - t[1] };
  };
  const shown = (bearing: number, d: { dx: number; dy: number }) => {
    const toPlan = (p: XY) => siteToPlan(d, bearing, p);
    const all = real.map((b) => planBuilding(b, toPlan)!);
    const picked = selectBuildings(all, { footprint: foot, homes: [toPlan([0, 0])], at: [7, 4.5], radius: 1000, max: 100 });
    return { all, picked };
  };
  /** does the building touch the footprint (+ margin)? Brute force: sample points of the rectangle, and the ring's own vertices */
  const touches = (b: PlanBuilding) => {
    const x0 = foot.x0 - MARGIN, x1 = foot.x1 + MARGIN, y0 = foot.y0 - MARGIN, y1 = foot.y1 + MARGIN;
    for (let x = x0; x <= x1; x += 0.5) for (let y = y0; y <= y1; y += 0.5) if (pointInShape([x, y], b.ring, b.holes)) return true;
    return b.ring.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  };

  it("the footprint holds the rooms and the turned patio", () => {
    assert.ok(Math.abs(foot.x0 - -6.348) < 0.01 && foot.x1 === 14 && foot.y0 === 0 && foot.y1 === 9);
  });
  it("no drawn block touches the flat, whatever the bearing or the offset; the blocks it stands on are dropped", () => {
    const cases: [number, XY][] = [[0, [0, 0]], [156, [0, 0]], [156, [4, 20]], [156, [45, -9]], [90, [-40, 48]], [300, [10, 10]]];
    for (const [bearing, P] of cases) {
      const { all, picked } = shown(bearing, placed(bearing, P));
      for (const b of picked) assert.equal(touches(b), false, `${b.id} cuts through the flat (bearing ${bearing}, at ${P})`);
      for (const b of all) if (touches(b)) assert.ok(!picked.includes(b), `${b.id} should be dropped`);
      assert.ok(picked.length >= all.length - 3, "far blocks stay");
    }
    // centred on the block at the site origin / on the one east of it: those are the ones dropped
    assert.ok(!shown(156, placed(156, [0, 0])).picked.some((b) => b.id === "w729170568"));
    assert.ok(!shown(156, placed(156, [45, -9])).picked.some((b) => b.id === "w729170569"));
  });
  it("a block 3 m clear of the flat stays, one within 1.5 m goes", () => {
    const mk = (x0: number) => planBuilding(building({ id: "n", ring: rect(x0, 0, x0 + 8, 9) }), identity)!;
    assert.equal(isHostBuilding(mk(foot.x1 + 3), foot, []), false);
    assert.equal(isHostBuilding(mk(foot.x1 + 1), foot, []), true);
  });
});

describe("trees", () => {
  const field = Array.from({ length: 300 }, (_, i) => ({ x: (i % 20) * 10, z: Math.floor(i / 20) * 10, n: i }));
  it("keeps the nearest first and spreads the rest evenly", () => {
    const out = thinTrees(field, [0, 0], 100);
    assert.equal(out.length, 100);
    const d = out.map((t) => Math.hypot(t.x, t.z));
    assert.deepEqual([...d].sort((a, b) => a - b), d, "nearest first");
    const all = field.map((t) => Math.hypot(t.x, t.z)).sort((a, b) => a - b);
    assert.deepEqual(d.slice(0, 60), all.slice(0, 60), "the nearest 60% are all kept");
    assert.ok(d[99] > all[150], "the farthest kept ones reach far out");
    assert.equal(new Set(out).size, 100);
  });
  it("returns everything (nearest first) under the cap", () => {
    assert.equal(thinTrees(field.slice(0, 10), [0, 0], 100).length, 10);
    assert.deepEqual(thinTrees([{ x: 9, z: 0 }, { x: 1, z: 0 }], [0, 0], 5).map((t) => t.x), [1, 9]);
  });
  it("picks species by leaf type and keeps a mapped tree species", () => {
    for (let k = 0; k < 20; k++) {
      assert.ok(["oak", "linden", "maple", "birch", "poplar"].includes(pickSpecies("broad", undefined, k / 20)));
      assert.ok(["spruce", "pine", "fir"].includes(pickSpecies("needle", undefined, k / 20)));
    }
    assert.equal(pickSpecies("broad", "cherry", 0.5), "cherry");
    assert.ok(["oak", "linden", "maple", "birch", "poplar"].includes(pickSpecies("broad", "rose", 0.5)));
  });
  it("scatters deterministically inside a polygon, holes excluded, capped", () => {
    const ring = rect(0, 0, 100, 100);
    const hole = rect(40, 40, 60, 60);
    const a = scatterIn(ring, [hole], 6.5, "wood1", 1000);
    assert.deepEqual(a, scatterIn(ring, [hole], 6.5, "wood1", 1000));
    assert.ok(a.length > 150 && a.length < 300);
    assert.ok(a.every(([x, y]) => !(x > 40 && x < 60 && y > 40 && y < 60)));
    assert.equal(scatterIn(ring, [], 6.5, "wood1", 12).length, 12);
  });
  it("only wooded areas without mapped trees get scattered trees", () => {
    const areas = [
      { id: "w", kind: "wood" as const, ring: rect(0, 0, 60, 60), leaf: "needle" as const },
      { id: "m", kind: "wood" as const, ring: rect(100, 0, 160, 60) },
      { id: "g", kind: "grass" as const, ring: rect(200, 0, 260, 60) },
    ];
    const out = areaTrees(areas, identity, [{ x: 130, z: 30 }], 5000);
    assert.ok(out.length > 20);
    assert.ok(out.every((t) => t.x < 60 && t.leaf === "needle" && t.source === "area"));
  });
});

describe("roads and colours", () => {
  it("lays an up-facing ribbon of the right width that follows the ground", () => {
    const out = newBuf();
    addRibbon(out, [[0, 0], [30, 0]], 6, (x) => x * 0.1, () => 0.05, [1, 1, 1]);
    const zs = out.pos.filter((_, i) => i % 3 === 2);
    assert.ok(Math.abs(Math.max(...zs) - 3) < 1e-9 && Math.abs(Math.min(...zs) + 3) < 1e-9);
    assert.ok(Math.abs(yRange(out)[1] - 3.05) < 1e-9);
    assert.ok(out.pos.length / 9 >= 2 * 4, "cut into pieces that follow the slope");
    for (let i = 1; i < out.nrm.length; i += 3) assert.ok(out.nrm[i] > 0);
  });
  it("ignores a degenerate road", () => {
    const out = newBuf();
    addRibbon(out, [[1, 1], [1, 1]], 5, () => 0, () => 0, [1, 1, 1]);
    assert.equal(out.pos.length, 0);
  });
  it("parses hex and named colours into linear RGB", () => {
    assert.deepEqual(parseCssColor("#ffffff"), [1, 1, 1]);
    assert.deepEqual(parseCssColor("White"), [1, 1, 1]);
    assert.equal(parseCssColor("not a colour"), null);
    assert.equal(parseCssColor(undefined), null);
    const grey = parseCssColor("#808080")!;
    assert.ok(Math.abs(grey[0] - 0.2158) < 1e-3);
    assert.notEqual(hashStr("a"), hashStr("b"));
  });
});

describe("water", () => {
  const slope = (x: number) => x * 0.1; // 0 m at x = 0, 3 m at x = 30
  const pond = [{ id: "p", kind: "water" as const, ring: rect(0, 0, 30, 20) }];
  it("puts the surface at the lowest ground under the pond and digs the bed below it", () => {
    const water = buildWater(pond, [], identity, slope);
    assert.ok(water.pos.length > 0);
    for (let i = 1; i < water.pos.length; i += 3) assert.ok(Math.abs(water.pos[i] - 0.015) < 1e-9);
    const dug = carveWater(slope, pond, identity);
    assert.ok(Math.abs(dug(15, 10) - (0.015 - 0.3)) < 1e-9, "inside: below the surface");
    assert.equal(dug(40, 10), 4, "outside: untouched");
  });
  it("changes nothing without ponds and draws rivers along the ground", () => {
    assert.equal(carveWater(slope, [{ id: "g", kind: "grass", ring: rect(0, 0, 9, 9) }], identity)(5, 5), slope(5));
    const river = buildWater([], [{ id: "r", kind: "river", width: 6, pts: [[0, 0], [20, 0]] }], identity, slope);
    assert.ok(river.pos.length > 0 && Math.abs(Math.max(...river.pos.filter((_, i) => i % 3 === 1)) - (2 + 0.015)) < 1e-9);
  });
});

describe("cut-away neighbours", () => {
  const foot = { x0: 0, y0: 0, x1: 10, y1: 6 };
  it("the curve is 0 at the plan, fully cut up to CUT_NEAR_M, rising smoothly, 1 from CUT_FAR_M", () => {
    assert.equal(cutFactor(0), 0);
    assert.equal(cutFactor(CUT_NEAR_M), 0);
    assert.equal(cutFactor(CUT_FAR_M), 1);
    assert.equal(cutFactor(500), 1);
    let prev = 0;
    for (let d = 0; d <= 60; d += 0.5) {
      const f = cutFactor(d);
      assert.ok(f >= prev && f >= 0 && f <= 1, `monotonic at ${d}`);
      prev = f;
    }
    assert.ok(cutFactor((CUT_NEAR_M + CUT_FAR_M) / 2) > 0.45 && cutFactor((CUT_NEAR_M + CUT_FAR_M) / 2) < 0.55, "halfway is about half");
  });
  it("a tall block near the plan keeps WALL_CUT_H of its height, far away all of it, low sheds are never raised", () => {
    assert.ok(Math.abs(cutKeep(5, 12) * 12 - WALL_CUT_H) < 1e-9);
    assert.equal(cutKeep(CUT_FAR_M, 12), 1);
    assert.ok(cutKeep(30, 12) > cutKeep(20, 12));
    assert.equal(cutKeep(0, 0.5), 1, "already lower than the cut walls");
  });
  it("distance from an outline to the plan: beside it, nearest corner, along an edge, touching, around it", () => {
    assert.equal(ringRectDistance(rect(20, 0, 30, 6), foot), 10);
    assert.ok(Math.abs(ringRectDistance(rect(13, 10, 20, 20), foot) - 5) < 1e-6, "corner to corner: 3 and 4");
    assert.ok(Math.abs(ringRectDistance([[-5, 15], [30, 15], [30, 20], [-5, 20]], foot) - 9) < 1e-6, "a long edge passing the plan, no vertex near it");
    assert.equal(ringRectDistance(rect(8, 4, 20, 20), foot), 0);
    assert.equal(ringRectDistance(rect(-20, -20, 40, 40), foot), 0, "the plan inside it");
  });
  it("every vertex of a building carries its scale, ground height and window origin; no footprint, no lowering", () => {
    const near = plan({ id: "near", ring: rect(12, 0, 20, 6), height: 12 });
    const far = plan({ id: "far", ring: rect(80, 0, 90, 6), height: 12 });
    const out = buildBuildings([near, far], () => 2, foot);
    assert.equal(out.wallsCut.length, (out.walls.pos.length / 3) * CUT_STRIDE);
    assert.equal(out.roofsCut.length, (out.roofs.pos.length / 3) * CUT_STRIDE);
    const nearVerts = out.walls.pos.length / 3 / 2;
    assert.ok(Math.abs(out.wallsCut[0] - WALL_CUT_H / 12.3) < 1e-3, "the near block's height scale (12 m of wall and its parapet)");
    assert.equal(out.wallsCut[1], 2);
    assert.equal(out.wallsCut[nearVerts * CUT_STRIDE], 1, "the far block is left alone");
    assert.ok(out.wallsCut.filter((_, i) => i % CUT_STRIDE === 0).slice(0, nearVerts).every((k) => k === out.wallsCut[0]), "one scale for the whole building: its roof stays flat");
    assert.ok(buildBuildings([near], () => 0).wallsCut.every((v, i) => i % CUT_STRIDE !== 0 || v === 1));
  });
});
