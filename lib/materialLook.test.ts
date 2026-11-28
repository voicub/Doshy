import assert from "node:assert/strict";
import test from "node:test";
import { MATERIAL_MAX_PX, materialKey, materialPlan, turnUvs, wallSide } from "./materialLook.ts";
import { TIERS } from "./quality.ts";

test("Eco and Light never load a texture, Balanced loads colour and roughness, Detailed and Ultra add the normal map", () => {
  const plan = (t: keyof typeof TIERS) => materialPlan(TIERS[t].textures, TIERS[t].textureSize);
  for (const t of ["eco", "low"] as const) assert.equal(plan(t).fetch, false, t);
  assert.deepEqual(plan("medium"), { fetch: true, size: 512, normal: false });
  assert.deepEqual(plan("high"), { fetch: true, size: 1024, normal: true });
  assert.deepEqual(plan("ultra"), { fetch: true, size: 1024, normal: true });
});

test("the loaded size never passes what Poly Haven ships", () => {
  for (const size of [256, 512, 1024, 4096]) assert.ok(materialPlan(2, size).size <= MATERIAL_MAX_PX);
});

test("a set is told apart by texture, size and normal map", () => {
  const id = "mat-0123456789abcdef01234567";
  const keys = new Set([materialKey(id, 512, false), materialKey(id, 1024, false), materialKey(id, 512, true), materialKey("mat-aaaaaaaaaaaaaaaaaaaaaaaa", 512, false)]);
  assert.equal(keys.size, 4);
});

test("turning uvs by a quarter swaps the axes, a full turn changes nothing, and only the chosen vertices turn", () => {
  const uv = new Float32Array([1, 0, 0, 2, 3, 3]);
  turnUvs(uv, 90, (i) => i < 2);
  assert.deepEqual([...uv].map((n) => Math.round(n * 1e6) / 1e6), [0, 1, -2, 0, 3, 3]);
  const same = new Float32Array([1, 2, 3, 4]);
  turnUvs(same, 0);
  assert.deepEqual([...same], [1, 2, 3, 4]);
  turnUvs(same, 360);
  assert.deepEqual([...same].map((n) => Math.round(n * 1e5) / 1e5), [1, 2, 3, 4]);
});

test("wall faces are told apart by their normal; ends, top and bevels belong to neither", () => {
  assert.equal(wallSide(1), "A");
  assert.equal(wallSide(-1), "B");
  assert.equal(wallSide(0), null);
  assert.equal(wallSide(0.4), null);
});
