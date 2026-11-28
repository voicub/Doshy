import assert from "node:assert/strict";
import { test } from "node:test";
import { parseObj } from "./siteCityObj.ts";

const bytes = (s: string) => new TextEncoder().encode(s);

test("reads vertices, objects and triangles; quads are split into two triangles", async () => {
  const m = await parseObj(bytes("# c\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\no a\nf 1 2 3\no b\nf 1 2 3 4\n"));
  assert.deepEqual([...m.pos.slice(3, 6)], [1, 0, 0]);
  assert.deepEqual(m.meshes.map((x) => [x.name, x.start, x.end]), [["a", 0, 3], ["b", 3, 9]]);
  assert.deepEqual([...m.tris], [0, 1, 2, 0, 1, 2, 0, 2, 3]);
});

test("face corners may carry texture and normal numbers, and count back with negative numbers", async () => {
  const m = await parseObj(bytes("v 0 0 0\nv 1 0 0\nv 1 1 0\nvn 0 0 1\nf 1//1 2/5/1 3/4\nf -3 -2 -1\n"));
  assert.deepEqual([...m.tris], [0, 1, 2, 0, 1, 2]);
});

test("numbers in every common spelling are read", async () => {
  const m = await parseObj(bytes("v -1.5e1 +2 .5\nv 1E-2 3. 0\nv 0 0 0\nf 1 2 3\r\n"));
  assert.deepEqual([...m.pos.slice(0, 6)].map((x) => Number(x.toPrecision(6))), [-15, 2, 0.5, 0.01, 3, 0]);
});

test("a face naming a vertex that does not exist is dropped whole, the rest survives", async () => {
  const m = await parseObj(bytes("v 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 9\nf 1 2 3\nf 1 2\n"));
  assert.deepEqual([...m.tris], [0, 1, 2]);
});

test("faces before any object line still belong to an unnamed object", async () => {
  const m = await parseObj(bytes("v 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n"));
  assert.deepEqual(m.meshes.map((x) => x.name), [""]);
});

test("a file without a triangle, or with a point that is not a number, is refused with a sentence", async () => {
  await assert.rejects(parseObj(bytes("v 0 0 0\n")), /no building or road/i);
  await assert.rejects(parseObj(bytes("v 0 x 0\nf 1 1 1\n")), /not a number/i);
});

test("the main thread is handed back during a long parse, and not at all during a short one", async () => {
  let t = 0;
  let turns = 0;
  const lots = "v 0 0 0\n".repeat(20000) + "f 1 1 1\n";
  await parseObj(bytes(lots), async () => { turns++; }, () => (t += 10)); // every clock reading is 10 ms later
  assert.ok(turns >= 4, `turns ${turns}`);
  turns = 0;
  await parseObj(bytes("v 0 0 0\nf 1 1 1\n"), async () => { turns++; }, () => 0);
  assert.equal(turns, 0);
});
