import assert from "node:assert/strict";
import { test } from "node:test";
import { detectTrees, type Rgba } from "./canopy.ts";

const W = 240;
const H = 240;
const MPP = 0.5;
type Rgb = [number, number, number];

function image(bg: Rgb, paint?: (x: number, y: number) => Rgb | null): Rgba {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = paint?.(x, y) ?? bg;
      data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  }
  return { data, width: W, height: H };
}

// a leaf crown: dark green with a deterministic speckle of +-18 grey levels, like a real one
const crown = (x: number, y: number): Rgb => {
  const n = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 18;
  return [28 + n * 0.3, 78 + n, 30 + n * 0.3];
};
const LAWN: Rgb = [110, 150, 70];
const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => (Math.hypot(x - cx, y - cy) <= r ? crown(x, y) : null);
const toSite = (px: number, py: number): [number, number] => [px * MPP - 60, py * MPP - 60];

test("green speckled discs on a bright lawn are found with their place and size", async () => {
  const discs = [
    { x: 50, y: 60, r: 8 },
    { x: 150, y: 70, r: 12 },
    { x: 90, y: 170, r: 6 },
  ];
  const img = image(LAWN, (x, y) => {
    for (const d of discs) {
      const c = disc(d.x, d.y, d.r)(x, y);
      if (c) return c;
    }
    return null;
  });
  const trees = await detectTrees(img, { metresPerPixel: MPP, toSite });
  assert.equal(trees.length, 3);
  for (const d of discs) {
    const [sx, sy] = toSite(d.x + 0.5, d.y + 0.5);
    const t = trees.find((t) => Math.hypot(t.x - sx, t.y - sy) < 1.5);
    assert.ok(t, `a tree near the disc at ${d.x},${d.y}`);
    assert.ok(Math.abs(t.crown - 2 * d.r * MPP) <= 0.3 * 2 * d.r * MPP, `crown ${t.crown} for a ${2 * d.r * MPP} m disc`);
    assert.equal(t.source, "photo");
    assert.equal(t.leaf, "broad");
    assert.ok(t.height >= 3 && t.height <= 22);
  }
});

test("a flat lawn has no trees, nor does a roof, a road or a shadow", async () => {
  for (const bg of [LAWN, [64, 90, 44], [150, 150, 150], [185, 90, 80], [40, 42, 40], [12, 16, 12]] as Rgb[]) {
    assert.deepEqual(await detectTrees(image(bg), { metresPerPixel: MPP, toSite }), [], `colour ${bg}`);
  }
});

test("a dark shadow patch and a grey roof on a lawn do not make trees", async () => {
  const img = image(LAWN, (x, y) => (x > 40 && x < 100 && y > 40 && y < 100 ? [15, 20, 14] : x > 140 && x < 220 && y > 120 && y < 200 ? [120, 124, 118] : null));
  assert.deepEqual(await detectTrees(img, { metresPerPixel: MPP, toSite }), []);
});

test("a thin hedge or a couple of green pixels is not a tree", async () => {
  const img = image(LAWN, (x, y) => (y >= 100 && y < 102 && x > 20 && x < 200 ? crown(x, y) : x >= 10 && x < 13 && y >= 10 && y < 13 ? crown(x, y) : null));
  assert.deepEqual(await detectTrees(img, { metresPerPixel: MPP, toSite }), []);
});

test("a dense grove gives several trees, not one, and the same input gives the same answer", async () => {
  const img = image(LAWN, (x, y) => (x > 40 && x < 200 && y > 60 && y < 160 ? crown(x, y) : null));
  const a = await detectTrees(img, { metresPerPixel: MPP, toSite });
  const b = await detectTrees(img, { metresPerPixel: MPP, toSite });
  assert.ok(a.length >= 6, `${a.length} trees in an 80 x 50 m grove`);
  assert.deepEqual(a, b);
  assert.ok(a.every((t) => t.crown >= 2 && t.crown <= 16));
});

test("the count is capped, and an empty or degenerate image answers nothing", async () => {
  const img = image(LAWN, (x, y) => (x > 10 && x < 230 && y > 10 && y < 230 ? crown(x, y) : null));
  assert.ok((await detectTrees(img, { metresPerPixel: MPP, toSite, maxTrees: 5 })).length <= 5);
  assert.deepEqual(await detectTrees({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, { metresPerPixel: MPP, toSite }), []);
  assert.deepEqual(await detectTrees(img, { metresPerPixel: 0, toSite }), []);
});
