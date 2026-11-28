import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_SUGGESTIONS, detectJob, detectWalls, type Seg } from "./traceDetect.ts";

type Img = { d: Uint8ClampedArray; w: number; h: number };
const page = (w: number, h: number, paper = 255): Img => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) d.set([paper, paper, paper, 255], i);
  return { d, w, h };
};
/** Paint the pixels x0..x1-1, y0..y1-1 one grey. */
const paint = (img: Img, x0: number, y0: number, x1: number, y1: number, v = 0) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.d.set([v, v, v, 255], (y * img.w + x) * 4);
};
const lcg = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const key = (s: Seg) => [s.x1, s.y1, s.x2, s.y2].map((v) => Math.round(v)).join(",");
const keys = (segs: Seg[]) => segs.map(key).sort();

/** A closed room outline, 6 px walls: outer edges x 40..360, y 40..260. */
const room = (): Img => {
  const img = page(400, 300);
  paint(img, 40, 40, 360, 46); // top
  paint(img, 40, 254, 360, 260); // bottom
  paint(img, 40, 40, 46, 260); // left
  paint(img, 354, 40, 360, 260); // right
  return img;
};
const ROOM = ["43,43,357,43", "43,257,357,257", "43,43,43,257", "357,43,357,257"].sort(); // centre lines, corners joined

test("a closed room of thick walls gives its four walls, meeting exactly at the corners", () => {
  const { d, w, h } = room();
  const found = detectWalls(d, w, h);
  assert.deepEqual(keys(found), ROOM);
  for (const s of found) assert.equal(s.t, 6);
});

test("a door gap splits one wall in two; the pieces end at the gap and the rest is unchanged", () => {
  const img = room();
  paint(img, 150, 40, 190, 46, 255); // the door: 40 px of the top wall
  const found = detectWalls(img.d, img.w, img.h);
  assert.deepEqual(keys(found), ["43,43,150,43", "190,43,357,43", "43,257,357,257", "43,43,43,257", "357,43,357,257"].sort());
});

test("a one or two pixel break in a wall does not split it", () => {
  const img = room();
  paint(img, 200, 40, 202, 46, 255);
  assert.deepEqual(keys(detectWalls(img.d, img.w, img.h)), ROOM);
});

test("JPEG-like noise and speckles do not move or multiply the walls", () => {
  const { d, w, h } = room();
  const rnd = lcg(7);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(255, Math.max(0, d[i] + Math.round((rnd() - 0.5) * 24)));
    d.set([v, v, v], i);
  }
  for (let n = 0; n < 150; n++) {
    const i = (Math.floor(rnd() * h) * w + Math.floor(rnd() * w)) * 4;
    d.set([0, 0, 0], i); // a speck of dust anywhere, also right beside a wall
  }
  const found = detectWalls(d, w, h);
  assert.equal(found.length, 4);
  for (const s of found) assert.ok(ROOM.some((r) => r.split(",").every((n, i) => Math.abs(Number(n) - [s.x1, s.y1, s.x2, s.y2][i]) <= 1)), key(s));
});

test("the dark class is found on a light grey page with mid-grey ink, not only black on white", () => {
  const img = page(400, 300, 215);
  paint(img, 40, 40, 360, 46, 110);
  paint(img, 40, 40, 46, 260, 110);
  const found = detectWalls(img.d, img.w, img.h);
  assert.deepEqual(keys(found), ["43,43,360,43", "43,43,43,260"].sort());
});

test("an empty page, a nearly empty noisy page and a dark page give nothing", () => {
  const blank = page(400, 300);
  assert.deepEqual(detectWalls(blank.d, blank.w, blank.h), []);
  const noisy = page(400, 300, 240);
  const rnd = lcg(3);
  for (let i = 0; i < noisy.d.length; i += 4) noisy.d.fill(240 + Math.floor(rnd() * 12), i, i + 3);
  assert.deepEqual(detectWalls(noisy.d, noisy.w, noisy.h), []);
  const dark = page(400, 300, 20);
  paint(dark, 40, 40, 360, 46, 5);
  assert.deepEqual(detectWalls(dark.d, dark.w, dark.h), []);
});

test("see-through pixels count as white paper", () => {
  const { d, w, h } = room();
  for (let i = 0; i < d.length; i += 4) if (d[i] === 255) d[i + 3] = 0; // the paper is transparent (a PNG with no background)
  assert.deepEqual(keys(detectWalls(d, w, h)), ROOM);
});

test("filled blocks and short strokes are not walls", () => {
  const img = page(400, 300);
  paint(img, 100, 100, 160, 160); // a 60 x 60 black square: too fat for a wall
  for (let k = 0; k < 6; k++) paint(img, 200, 20 + k * 40, 215, 23 + k * 40); // 15 px dashes: shorter than 6% of the picture
  assert.deepEqual(detectWalls(img.d, img.w, img.h), []);
});

test("the two thin lines of a hollow wall become one wall on the line between them", () => {
  const img = page(400, 300);
  paint(img, 20, 100, 380, 102);
  paint(img, 20, 110, 380, 112);
  const found = detectWalls(img.d, img.w, img.h);
  assert.deepEqual(keys(found), ["20,106,380,106"]);
  assert.equal(found[0].t, 12); // from the outer edge of one line to the outer edge of the other
});

test("a one pixel line needs 'many lines'; 'few lines' wants longer and thicker strokes", () => {
  const img = page(400, 300);
  paint(img, 20, 150, 380, 151);
  assert.deepEqual(detectWalls(img.d, img.w, img.h, "normal"), []);
  assert.deepEqual(keys(detectWalls(img.d, img.w, img.h, "many")), ["20,151,380,151"]); // the line is rows 150..150: centre 150.5, shown rounded
  const few = page(400, 300);
  paint(few, 20, 100, 120, 105); // 100 px long: kept by both (normal wants 24 px, few 40 px) ...
  paint(few, 20, 200, 50, 205); // ... 30 px long: normal keeps it, few drops it
  assert.equal(detectWalls(few.d, few.w, few.h, "normal").length, 2);
  assert.equal(detectWalls(few.d, few.w, few.h, "few").length, 1);
});

/** 150 separate horizontal walls, 20 px apart. */
const ladder = (): Img => {
  const img = page(600, 3020);
  for (let k = 0; k < 150; k++) paint(img, 100, 10 + k * 20, 500, 13 + k * 20);
  return img;
};

test("no more than the cap is suggested, the longest first", () => {
  const img = ladder();
  paint(img, 50, 5, 550, 8); // one longer than the rest
  const found = detectWalls(img.d, img.w, img.h);
  assert.equal(found.length, MAX_SUGGESTIONS);
  assert.equal(Math.round(found[0].x2 - found[0].x1), 500);
});

test("the stepped job reports growing progress, needs several steps on a big picture and ends with the same walls", () => {
  const img = ladder();
  const job = detectJob(img.d, img.w, img.h);
  let steps = 0;
  let last = 0;
  while (!job.done) {
    job.step();
    steps++;
    assert.ok(job.progress >= last);
    last = job.progress;
  }
  assert.ok(steps > 3);
  assert.equal(job.progress, 1);
  assert.deepEqual(job.result(), detectWalls(img.d, img.w, img.h));
});
