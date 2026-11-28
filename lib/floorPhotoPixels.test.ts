import assert from "node:assert/strict";
import test from "node:test";
import {
  ROUGHNESS_RANGE, averageColour, buildFloorTexture, cropSquare, createNormalJob, estimateRoughness, flattenLighting, makeTileable, normalMap, resize, seamMismatch,
  textureSizeFor, type Pixels,
} from "./floorPhotoPixels.ts";

/** Same input, same output: a tiny hash noise in 0..1. */
const noise = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const make = (w: number, h: number, f: (x: number, y: number) => [number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4);
  return { data, w, h };
};

const grey = (v: number): [number, number, number] => [v, v, v];

/** Boards 32 px tall, each its own brown, with grain streaks along them, under a left-to-right light gradient (so the two edges of a photo differ). */
const wood = (n = 256) =>
  make(n, n, (x, y) => {
    const board = Math.floor(y / 32);
    const base = 120 + noise(board, 7) * 60;
    const grain = Math.sin(x * 0.07 + noise(board, 3) * 6) * 12 + (noise(x >> 2, y) - 0.5) * 16;
    const light = 0.7 + 0.6 * (x / n);
    const v = (base + grain) * light;
    return [v, v * 0.75, v * 0.5];
  });

/** 90 px tiles with 6 px grout, the pattern shifted so the left edge is a tile and the right edge is grout: the two edges do not match. */
const tiles = (n = 256) =>
  make(n, n, (x, y) => {
    const [px, py] = [(x + 29) % 96, (y + 29) % 96];
    const grout = px >= 90 || py >= 90;
    return grout ? grey(70) : grey(190 + noise(Math.floor((x + 29) / 96), Math.floor((y + 29) / 96)) * 25);
  });

test("a crop is the right square of the picture, pulled inside it", () => {
  const src = make(8, 6, (x, y) => [x * 10, y * 10, 0]);
  const c = cropSquare(src, 2, 1, 3);
  assert.deepEqual([c.w, c.h], [3, 3]);
  assert.deepEqual([...c.data.slice(0, 4)], [20, 10, 0, 255]);
  assert.deepEqual([...c.data.slice(-4)], [40, 30, 0, 255]);
  const edge = cropSquare(src, 99, 99, 4); // beyond the corner: pulled back to the last square that fits
  assert.deepEqual([...edge.data.slice(0, 3)], [40, 20, 0]);
  assert.equal(cropSquare(src, 0, 0, 99).w, 6, "never bigger than the short side");
});

test("resizing keeps the colour of a flat picture, and averages when shrinking", () => {
  const flat = make(10, 10, () => [200, 100, 50]);
  const small = resize(flat, 4, 4);
  assert.deepEqual([...small.data.slice(0, 4)], [200, 100, 50, 255]);
  const checker = make(8, 8, (x, y) => grey((x + y) % 2 ? 255 : 0));
  assert.ok(Math.abs(resize(checker, 2, 2).data[0] - 127.5) <= 1, "a fine checker shrinks to grey, not to one of its two colours");
  assert.deepEqual([resize(flat, 40, 40).w, resize(flat, 40, 40).h], [40, 40]);
});

test("stored sizes follow the crop and are never below 256", () => {
  assert.deepEqual([100, 255, 256, 700, 1100, 4000].map(textureSizeFor), [256, 256, 256, 512, 1024, 1024]);
});

test("blending the edges makes a wood-grain photo tile: the seam goes from obvious to about as smooth as the rest", () => {
  const before = wood();
  const after = makeTileable(before);
  const [b, a] = [seamMismatch(before), seamMismatch(after)];
  assert.ok(b > 30, `an unblended photo has a seam (${b.toFixed(1)})`);
  assert.ok(a < b / 5, `blending shrinks it (${b.toFixed(1)} -> ${a.toFixed(1)})`);
  assert.ok(a < 10, `and leaves it small (${a.toFixed(1)})`);
});

test("blending the edges makes a tile pattern tile too", () => {
  const before = tiles();
  const after = makeTileable(before);
  const [b, a] = [seamMismatch(before), seamMismatch(after)];
  assert.ok(b > 20, `cut tiles do not meet (${b.toFixed(1)})`);
  assert.ok(a < b / 2, `blending helps (${b.toFixed(1)} -> ${a.toFixed(1)})`);
});

test("blending leaves the middle of the photo as photographed and never changes its size", () => {
  const src = wood(128);
  const out = makeTileable(src, 0.2);
  assert.deepEqual([out.w, out.h], [128, 128]);
  const mid = (64 * 128 + 64) * 4;
  assert.deepEqual([...out.data.slice(mid, mid + 4)], [...src.data.slice(mid, mid + 4)]);
});

test("the average colour is taken in linear light", () => {
  assert.equal(averageColour(make(4, 4, () => [200, 100, 50])), "#c86432");
  const checker = make(8, 8, (x, y) => grey((x + y) % 2 ? 255 : 0));
  assert.equal(averageColour(checker), "#bcbcbc", "half white, half black is mid grey (188), not 128");
});

test("flattening the lighting removes a vignette and keeps the average colour", () => {
  const n = 256;
  const vignette = (x: number, y: number) => {
    const d = Math.hypot(x - n / 2, y - n / 2) / (n * 0.7071);
    return 1 - 0.55 * d * d;
  };
  const photo = make(n, n, (x, y) => grey((150 + (noise(x, y) - 0.5) * 50) * vignette(x, y)));
  const block = (p: Pixels, x0: number, y0: number) => {
    let s = 0;
    for (let y = y0; y < y0 + 32; y++) for (let x = x0; x < x0 + 32; x++) s += p.data[(y * n + x) * 4];
    return s / 1024;
  };
  const gap = (p: Pixels) => block(p, n / 2 - 16, n / 2 - 16) - block(p, 0, 0);
  const flat = flattenLighting(photo);
  assert.ok(gap(photo) > 50, `the vignette is strong (${gap(photo).toFixed(0)})`);
  assert.ok(Math.abs(gap(flat)) < gap(photo) / 4, `and mostly gone (${gap(flat).toFixed(0)})`);
  const mean = (p: Pixels) => p.data.reduce((s, v, i) => (i % 4 === 0 ? s + v : s), 0) / (n * n);
  assert.ok(Math.abs(mean(flat) - mean(photo)) < 6, "the overall brightness stays");
  assert.deepEqual(flattenLighting(photo, 0).data, photo.data, "strength 0 changes nothing");
});

test("flattening keeps the fine detail", () => {
  const stripes = make(128, 128, (x) => grey(x % 8 < 4 ? 80 : 180));
  const flat = flattenLighting(stripes);
  const swing = (p: Pixels) => Math.abs(p.data[(64 * 128 + 66) * 4] - p.data[(64 * 128 + 70) * 4]);
  assert.ok(swing(flat) > 90, `a 100-step stripe is still ${swing(flat)}`);
});

test("the normal map has the picture's size, is opaque, points up on flat ground and tilts on a slope", () => {
  const ramp = make(16, 16, (x) => grey(x * 16));
  const nm = normalMap(ramp, 2);
  assert.equal(nm.length, 16 * 16 * 4);
  const mid = (8 * 16 + 8) * 4;
  assert.ok(nm[mid] < 120, "a surface rising to the right leans left (red below 128)");
  assert.ok(Math.abs(nm[mid + 1] - 128) <= 1, "no slope up or down");
  assert.ok(nm[mid + 2] > 128, "and still faces mostly out");
  assert.equal(nm[mid + 3], 255);
  const flat = normalMap(make(16, 16, () => grey(90)), 2);
  assert.deepEqual([...flat.slice(0, 4)], [128, 128, 255, 255]);
});

test("the normal map is made in slices that add up to the same map", () => {
  const src = wood(64);
  const whole = normalMap(src, 2);
  const job = createNormalJob(src, 2);
  let ticks = 0;
  let t = 0;
  while (job.run(1, () => t++)) ticks++; // a clock that moves 1 ms per look: every few rows is a slice
  assert.ok(ticks > 2, `${ticks} slices`);
  assert.equal(job.done, true);
  assert.deepEqual(job.data, whole);
});

test("a smooth floor is guessed shinier than a busy one, within the app's range", () => {
  const smooth = estimateRoughness(make(64, 64, () => grey(150)));
  const busy = estimateRoughness(make(64, 64, (x, y) => grey(noise(x, y) * 255)));
  assert.equal(smooth, ROUGHNESS_RANGE.min);
  assert.ok(busy > smooth && busy <= ROUGHNESS_RANGE.max);
});

test("the whole recipe gives a stored size, a seamless picture and its colour", async () => {
  const crop = wood(300);
  const stages: number[] = [];
  const built = await buildFloorTexture(crop, { flatten: true, seamless: true }, async () => void stages.push(stages.length));
  assert.deepEqual([built.pixels.w, built.pixels.h], [256, 256]);
  assert.match(built.avg, /^#[0-9a-f]{6}$/);
  assert.equal(stages.length, 2, "it lets the browser breathe between stages");
  assert.ok(seamMismatch(built.pixels) < seamMismatch(resize(crop, 256, 256)) / 3);
  const asIs = await buildFloorTexture(crop, { flatten: false, seamless: false });
  assert.ok(seamMismatch(asIs.pixels) > 20, "with blending off the photo is left alone");
});
