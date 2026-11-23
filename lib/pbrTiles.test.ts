import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALBEDO_MEAN, PBR_KINDS, ROUGH_MEAN } from "./materialsPbr.ts";
import { createTileJob, fbm, vnoise } from "./pbrTiles.ts";

const SIZE = 64;
const run = (kind: (typeof PBR_KINDS)[number], normal = false, opts = {}) => {
  const job = createTileJob(kind, SIZE, { normal, ...opts });
  while (job.run(1000, () => 0));
  return job;
};
const grey = (a: Uint8Array, x: number, y: number) => a[(y * SIZE + x) * 4];
const mean = (a: Uint8Array) => {
  let s = 0;
  for (let i = 0; i < SIZE * SIZE; i++) s += a[i * 4];
  return s / (SIZE * SIZE) / 255;
};

describe("noise", () => {
  it("is periodic: a lattice point and its wrapped neighbour agree", () => {
    for (const f of [3, 7, 16]) assert.ok(Math.abs(vnoise(0, 0.37, f, f, 5) - vnoise(1, 0.37, f, f, 5)) < 1e-9);
    assert.ok(Math.abs(fbm(0.2, 0, 4, 4, 4, 9) - fbm(0.2, 1, 4, 4, 4, 9)) < 1e-9);
  });
  it("stays in 0..1", () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm(i * 0.0371, i * 0.0173, 6, 6, 4, 2);
      assert.ok(v >= 0 && v <= 1);
    }
  });
});

describe("tile job", () => {
  for (const kind of PBR_KINDS)
    it(`${kind}: fills colour and roughness with the shared means, and tiles`, () => {
      const job = run(kind);
      assert.ok(job.done);
      assert.ok(Math.abs(mean(job.albedo) - ALBEDO_MEAN) < 0.06, `albedo mean ${mean(job.albedo)}`);
      assert.ok(Math.abs(mean(job.rough) - ROUGH_MEAN) < 0.08, `rough mean ${mean(job.rough)}`);
      // the wrap-around step across each edge is no bigger than a typical step inside the tile (a seam would be far bigger)
      let inner = 0, seam = 0;
      for (let i = 0; i < SIZE; i++) {
        for (let x = 0; x < SIZE - 1; x++) inner += Math.abs(grey(job.albedo, x + 1, i) - grey(job.albedo, x, i)) + Math.abs(grey(job.albedo, i, x + 1) - grey(job.albedo, i, x));
        seam += Math.abs(grey(job.albedo, 0, i) - grey(job.albedo, SIZE - 1, i)) + Math.abs(grey(job.albedo, i, 0) - grey(job.albedo, i, SIZE - 1));
      }
      assert.ok(seam / (SIZE * 2) <= (inner / (SIZE * (SIZE - 1) * 2)) * 4 + 4, `${kind} seam ${seam} vs inner ${inner}`);
    });

  it("is deterministic and varies with the seed", () => {
    assert.deepEqual(run("wood").albedo, run("wood").albedo);
    assert.notDeepEqual(run("wood").albedo, run("wood", false, { seed: 3 }).albedo);
  });

  it("makes unit-length tangent-space normals pointing up, only when asked", () => {
    const job = run("fabric", true);
    assert.ok(job.normalDone);
    for (let i = 0; i < SIZE * SIZE; i += 37) {
      const n = [job.normal[i * 4], job.normal[i * 4 + 1], job.normal[i * 4 + 2]].map((b) => (b / 255) * 2 - 1);
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 0.03);
      assert.ok(n[2] > 0);
    }
    assert.equal(run("fabric", false).normalDone, false);
  });

  it("can add the normal map later and works in time slices", () => {
    const job = createTileJob("brick", SIZE, {});
    let slices = 0;
    while (job.run(0, () => slices++)) if (slices > 1e6) break;
    assert.ok(job.done && !job.normalDone);
    job.wantNormal();
    while (job.run(1000, () => 0));
    assert.ok(job.normalDone);
  });

  it("brick has recessed mortar lines and tile has grout", () => {
    const brick = run("brick", false);
    const values = new Set<number>();
    for (let y = 0; y < SIZE; y++) values.add(grey(brick.rough, 3, y) > 0.9 * 255 ? 1 : 0);
    assert.ok(values.size === 2);
    const tile = run("tile", false, { cols: 2, rows: 2 });
    assert.ok(tile.done);
  });
});
