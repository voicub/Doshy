import test from "node:test";
import assert from "node:assert/strict";
import { wallFaces, type WallFace } from "./measureWalls.ts";
import type { Wall } from "./types.ts";

const wall = (id: string, ax: number, ay: number, bx: number, by: number, thickness?: number): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style: "plaster", ...(thickness ? { thickness } : {}) });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const facesOf = (faces: WallFace[], id: string) => faces.filter((f) => f.wallId === id);
const lengths = (faces: WallFace[], id: string, side: "left" | "right") => facesOf(faces, id).filter((f) => f.side === side).map((f) => f.length);

// a closed 4 x 3 room of 12 cm walls, clockwise on screen (y down)
const room = [wall("n", 0, 0, 4, 0), wall("e", 4, 0, 4, 3), wall("s", 4, 3, 0, 3), wall("w", 0, 3, 0, 0)];

test("a closed 4 x 3 room: centre 4 is 4.12 outside and 3.88 inside", () => {
  const f = wallFaces(room);
  assert.equal(f.length, 8);
  // wall n runs west to east: its left normal points south (into the room), so left = inner
  const [inner] = lengths(f, "n", "left");
  const [outer] = lengths(f, "n", "right");
  close(inner, 3.88);
  close(outer, 4.12);
  close(lengths(f, "e", "left")[0], 2.88); // wall e runs south: its left normal points west = into the room
  close(lengths(f, "e", "right")[0], 3.12); // the 3 m side: 3.12 outside
  close(lengths(f, "w", "left")[0], 2.88);
});

test("a face runs from corner to corner along the wall, where the inner corners really are", () => {
  const f = facesOf(wallFaces(room), "n");
  const inner = f.find((x) => x.side === "left");
  assert.ok(inner);
  assert.deepEqual([inner.a.x, inner.a.y, inner.b.x, inner.b.y].map((v) => +v.toFixed(6)), [0.06, 0.06, 3.94, 0.06]);
  const outer = f.find((x) => x.side === "right");
  assert.ok(outer);
  assert.deepEqual([outer.a.x, outer.a.y, outer.b.x, outer.b.y].map((v) => +v.toFixed(6)), [-0.06, -0.06, 4.06, -0.06]);
});

test("a free end is squared off a half thickness past its end point", () => {
  const f = wallFaces([wall("a", 0, 0, 3, 0)]);
  assert.equal(f.length, 2);
  for (const x of f) close(x.length, 3.12);
});

test("thickness comes from the wall", () => {
  const f = wallFaces([wall("a", 0, 0, 3, 0, 0.3)]);
  for (const x of f) close(x.length, 3.3);
});

test("a T joint: the stem stops at the through wall, which splits its face on the stem's side", () => {
  // a 6 m through wall along y = 0 and a stem going south from x = 2 to y = 3
  const f = wallFaces([wall("t", 0, 0, 6, 0), wall("s", 2, 0, 2, 3)]);
  // the stem is a free end at the far side (+0.06), and starts at the through wall's face (y = 0.06): 3 - 0.06 + 0.06
  for (const x of facesOf(f, "s")) close(x.length, 3);
  // the through wall's north face (right of west-to-east) is whole; its south face is cut by the 12 cm stem into 1.94 and 3.94
  close(lengths(f, "t", "right")[0], 6.12);
  const south = lengths(f, "t", "left").sort((p, q) => p - q);
  assert.equal(south.length, 2);
  close(south[0], 2.0); // from the free end (-0.06) to the stem's west face (1.94)
  close(south[1], 4.0); // from the stem's east face (2.06) to the free end (6.06)
});

test("a corner of two walls joined at their end points: outer long, inner short", () => {
  const f = wallFaces([wall("a", 0, 0, 5, 0), wall("b", 5, 0, 5, 4)]);
  // wall a: free end at x = 0 (+0.06 out), at x = 5 a corner; its south (left) face is inner, its north face outer
  close(lengths(f, "a", "left")[0], 5.0 + 0.06 - 0.06); // from -0.06 (free end) to 4.94 (inner corner)
  close(lengths(f, "a", "right")[0], 5.0 + 0.06 + 0.06); // from -0.06 to 5.06 (outer corner)
});

test("walls in one straight line carry on without a step", () => {
  const f = wallFaces([wall("a", 0, 0, 2, 0), wall("b", 2, 0, 5, 0)]);
  close(lengths(f, "a", "left")[0], 2.06); // free end -0.06 to the joint at 2
  close(lengths(f, "b", "left")[0], 3.06);
});

test("a wall with no length has no faces", () => {
  assert.deepEqual(wallFaces([wall("z", 1, 1, 1, 1)]), []);
});

test("turning the whole room does not change any face length", () => {
  const c = Math.cos(0.5236);
  const s = Math.sin(0.5236);
  const turn = (w: Wall): Wall => ({ ...w, a: { x: w.a.x * c - w.a.y * s, y: w.a.x * s + w.a.y * c }, b: { x: w.b.x * c - w.b.y * s, y: w.b.x * s + w.b.y * c } });
  const f = wallFaces(room.map(turn));
  close(lengths(f, "n", "left")[0], 3.88);
  close(lengths(f, "n", "right")[0], 4.12);
  close(lengths(f, "w", "left")[0], 2.88);
});
