import assert from "node:assert/strict";
import { test } from "node:test";
import { THUMB_H, THUMB_W, asPlan, thumbSvg } from "./planThumb.ts";
import type { Item, Plan, Room, Wall } from "./types.ts";

const empty = (): Plan => ({ walls: [], openings: [], rooms: [], items: [] });
const room = (o: Partial<Room> = {}): Room => ({ id: "r1", name: "Room", x: 0, y: 0, w: 4, h: 3, color: "#fff", floor: "wood", ...o });
const wall = (id: string, ax: number, ay: number, bx: number, by: number, level?: string): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster", level });
const item = (o: Partial<Item> = {}): Item => ({ id: "i1", kind: "sofa", x: 1, y: 1, rot: 0, w: 1, d: 1, h: 1, ...o });

/** Every x,y pair the picture draws (points of polygons and polylines). */
function points(svg: string): { x: number; y: number }[] {
  return [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) => m[1].split(" ").map((p) => ({ x: Number(p.split(",")[0]), y: Number(p.split(",")[1]) })));
}

test("the same plan always draws the same picture", () => {
  const plan: Plan = { ...empty(), rooms: [room()], walls: [wall("w", 0, 0, 4, 0)], items: [item()] };
  assert.equal(thumbSvg(plan), thumbSvg(structuredClone(plan)));
  assert.notEqual(thumbSvg(plan), thumbSvg({ ...plan, items: [item({ x: 2 })] }));
});

test("an empty plan draws a placeholder, not nothing and not an error", () => {
  const svg = thumbSvg(empty());
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("stroke-dasharray"));
  assert.equal(points(svg).length, 0);
});

test("one room fills the picture's frame, centred, inside the margin", () => {
  const pts = points(thumbSvg({ ...empty(), rooms: [room({ w: 8, h: 2 })] }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= THUMB_W);
  assert.ok(Math.min(...ys) >= 0 && Math.max(...ys) <= THUMB_H);
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - THUMB_W / 2) < 1);
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - THUMB_H / 2) < 1);
  assert.ok(Math.max(...xs) - Math.min(...xs) > THUMB_W * 0.8); // the wide side uses the width
});

test("a huge plan and a tiny plan both stay inside the picture", () => {
  for (const size of [0.01, 1, 5000]) {
    const pts = points(thumbSvg({ ...empty(), rooms: [room({ x: -size, y: -size, w: size * 3, h: size })] }));
    assert.ok(pts.length > 0);
    for (const p of pts) assert.ok(p.x >= 0 && p.x <= THUMB_W && p.y >= 0 && p.y <= THUMB_H, `${size}: ${p.x},${p.y}`);
  }
});

test("only the lowest level is drawn; a piece with no level belongs to it", () => {
  const levels = [{ id: "L0", name: "Ground", elevation: 0, height: 2.8 }, { id: "L1", name: "Upstairs", elevation: 2.8, height: 2.8 }];
  const plan: Plan = { ...empty(), levels, walls: [wall("down", 0, 0, 4, 0), wall("up", 0, 10, 40, 10, "L1")], items: [item({ x: 100, y: 100, level: "L1" })] };
  const ys = points(thumbSvg(plan)).map((p) => p.y);
  assert.equal(new Set(ys).size, 1); // the ground wall is one horizontal line; the upstairs wall and piece are not in the picture
});

test("garden ground and paths are drawn on any plan, even one with no building", () => {
  const plan: Plan = { ...empty(), ground: [{ id: "g", x: 0, y: 0, w: 6, h: 6, kind: "grass" }], paths: [{ id: "p", points: [{ x: 0, y: 0 }, { x: 6, y: 6 }], width: 1, kind: "paving" }] };
  const svg = thumbSvg(plan);
  assert.ok(svg.includes("<polygon"));
  assert.ok(svg.includes("<polyline"));
});

test("broken numbers are skipped instead of breaking the picture", () => {
  const svg = thumbSvg({ ...empty(), rooms: [room({ w: Number.NaN })], items: [item({ x: Number.POSITIVE_INFINITY }), item({ id: "ok" })] });
  assert.ok(!svg.includes("NaN") && !svg.includes("Infinity"));
  assert.equal(points(svg).length, 4); // the one good piece
});

test("a plan fetched as JSON is only used when it has the four lists", () => {
  assert.equal(asPlan(null), null);
  assert.equal(asPlan({ walls: [], rooms: [], items: [] }), null);
  assert.deepEqual(asPlan(empty()), empty());
});
