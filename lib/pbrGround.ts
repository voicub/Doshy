// Procedural ground, water and weathered-outdoor recipes for the PBR tiles (lib/pbrTiles.ts registers them). Each is a Maker: (seed, options, texture size) -> a
// sampler writing out[0] = height, out[1] = brightness, out[2] = roughness and out[3] = warm/cool hue shift (+ warm/yellow-green, - cool/blue-green). The colour map is
// a multiplier of the material tint, so brightness carries the structure and the hue shift carries the per-stone / per-patch colour variety. Every noise is
// periodic, and fine detail is capped at half the texture size (`fine`), so a 256 px tile shows the same ground as a 1024 px one, only softer, instead of aliased noise.
import type { Maker } from "./pbrTiles.ts";
import { clamp, dnoise, fbm, frac, hash, step, vnoise, worley } from "./pbrNoise.ts";

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** A second, unrelated random 0..1 for a cell whose first random is `id` (the cellular noise returns one only). */
const pick = (id: number, k: number) => frac(id * k + k * 0.618);
const fine = (f: number, size: number) => Math.min(f, size >> 1);
const TAU = Math.PI * 2;

/**
 * Grass seen from above: thin strands lying in four directions (axes and both diagonals) overlap into a dense mat, each direction a little different in tone,
 * dark where tufts meet, with two scales of dry/lush patches that also shift the hue (yellow-green vs blue-green).
 */
export const lawn: Maker = (s, _o, size) => {
  const fa = fine(420, size), fd = fine(300, Math.floor(size * 0.7)); // strand count across the strands; the diagonal lattice is sampled 1.4x denser
  return (u, v, out) => {
    // a periodic warp bends the straight strands, so no grid of directions shows
    const wu = u + (vnoise(u, v, 15, 15, s + 8) - 0.5) * 0.03, wv = v + (vnoise(u, v, 12, 12, s + 9) - 0.5) * 0.03;
    const h = vnoise(wu, wv, 22, fa, s + 1), c = vnoise(wu, wv, fa, 18, s + 2), d1 = dnoise(wu, wv, 1, fd, 16, s + 3), d2 = dnoise(wu, wv, -1, fd, 20, s + 4);
    const clump = vnoise(u, v, 44, 44, s + 5), patch = fbm(u, v, 4, 5, 3, s + 6), mottle = vnoise(u, v, 9, 8, s + 7);
    const sh = step(0.5, 0.9, h), sc = step(0.5, 0.9, c), s1 = step(0.5, 0.9, d1), s2 = step(0.5, 0.9, d2);
    const blades = Math.max(sh, sc * 0.85, s1 * 1.1, s2 * 0.95);
    const tip = Math.max(step(0.82, 0.97, h), step(0.82, 0.97, d1), step(0.85, 0.98, c), step(0.85, 0.98, d2));
    const ao = 0.8 + 0.2 * step(0.2, 0.6, clump);
    const dry = clamp((patch - 0.5) * 3 + (mottle - 0.5) * 1.8, -1, 1);
    out[0] = 0.15 + 0.45 * blades + 0.15 * tip + 0.3 * clump;
    out[1] = (0.68 + 0.26 * blades + 0.14 * tip) * ao * (1 + 0.1 * dry);
    out[2] = 1 - 0.06 * tip;
    out[3] = dry * 0.9 + (clump - 0.5) * 0.5;
  };
};

const BIG_PEBBLES = 34, SMALL_PEBBLES = 78;
const W5 = new Float64Array(5); // worley with the offset to the nearest point (the pebble's centre)
const LIGHT = [-0.5, -0.6, 0.62]; // a fixed light from the upper left, so every dome has a lit and a shadowed side
/** Brightness 0..1 of a sphere cap at offset (-W5[3], -W5[4]) from its centre, radius r, height `dome`. */
const domeLight = (r: number, dome: number) => clamp((-W5[3] * LIGHT[0] - W5[4] * LIGHT[1]) / r + dome * LIGHT[2]);
/** One pebble's look from its cell id: tone (a few dark ones), hue (cream/tan warm, grey cool), wet (darker and glossier). */
const pebbleLook = (id: number, out: Float64Array) => {
  out[0] = pick(id, 7.31) < 0.14 ? 0.6 + 0.2 * pick(id, 3.3) : 0.85 + 0.2 * pick(id, 17.3);
  out[1] = (pick(id, 23.1) - 0.4) * 1.7;
  out[2] = pick(id, 5.7) > 0.7 ? 1 : 0;
};
const L = new Float64Array(3);

/** Pea gravel: round pebbles of two sizes lit from one side, each with its own tone and hue, dark shadow gaps and a light dust film. */
export const gravel: Maker = (s, _o, size) => {
  const grain = fine(300, size);
  return (u, v, out) => {
    worley(u, v, BIG_PEBBLES, s, W5);
    const wob = vnoise(u, v, BIG_PEBBLES * 3, BIG_PEBBLES * 3, s + 5); // lumpy outline: pebbles are not circles
    const rBig = (0.3 + 0.24 * pick(W5[2], 13.7)) * (0.85 + 0.3 * wob), tBig = W5[0] / rBig;
    const domeBig = tBig < 1 ? Math.sqrt(1 - tBig * tBig) : 0;
    pebbleLook(W5[2], L);
    let tone = L[0], hue = L[1], wet = L[2], dome = domeBig, light = domeLight(rBig, domeBig);
    let height = (0.45 + 0.55 * domeBig) * (0.85 + 0.15 * pick(W5[2], 9.1));
    const cover = step(0, 0.25, domeBig);
    if (cover < 1) {
      // between the big pebbles the small ones show, a layer lower and in their shade
      const bigTone = tone, bigHue = hue, bigWet = wet, bigHeight = height, bigLight = light;
      worley(u, v, SMALL_PEBBLES, s + 9, W5);
      const rSmall = 0.28 + 0.24 * pick(W5[2], 13.7), tSmall = W5[0] / rSmall;
      const domeSmall = tSmall < 1 ? Math.sqrt(1 - tSmall * tSmall) : 0;
      pebbleLook(W5[2], L);
      tone = mix(L[0] * 0.8, bigTone, cover);
      hue = mix(L[1], bigHue, cover);
      wet = cover < 0.5 ? L[2] : bigWet;
      dome = mix(domeSmall * 0.7, domeBig, cover);
      light = mix(domeLight(rSmall, domeSmall) * 0.7, bigLight, cover);
      height = mix(0.2 + 0.35 * domeSmall, bigHeight, cover);
    }
    const speck = vnoise(u, v, grain, grain, s + 6), dust = vnoise(u, v, 6, 6, s + 7);
    const lit = 0.76 + 0.22 * light * (0.4 + 0.6 * Math.pow(dome, 0.5)); // shadowed in the gaps and on the far side, full on the lit side of a dome
    out[0] = height;
    out[1] = mix(tone * lit * (0.88 + 0.24 * speck), 0.8, 0.2 * dust * (0.4 + 0.6 * dome)) * (1 - 0.14 * wet);
    out[2] = (1 - 0.28 * wet) * (1 - 0.15 * dome * speck);
    out[3] = hue * dome;
  };
};

/** Damp tilled soil: lit clods with smaller crumbs between them, soft darker moist patches, a few smooth stones and root specks. Low colour contrast, clear relief. */
export const soil: Maker = (s, _o, size) => {
  const gritF = fine(260, size);
  return (u, v, out) => {
    const wa = vnoise(u, v, 9, 9, s + 8), wb = vnoise(u, v, 7, 7, s + 9); // the warp keeps the clods from forming a regular network
    worley(u + (wa - 0.5) * 0.03, v + (wb - 0.5) * 0.03, 30, s + 1, W5);
    const rBig = 0.45 + 0.3 * pick(W5[2], 13.7), tBig = W5[0] / rBig;
    const domeBig = tBig < 1 ? Math.sqrt(1 - tBig * tBig) : 0;
    let dome = domeBig, light = domeLight(rBig, domeBig), tone = pick(W5[2], 17.3);
    const stone = W5[2] > 0.97 && domeBig > 0 ? 1 : 0;
    const cover = step(0, 0.2, domeBig);
    if (cover < 1) {
      const bigLight = light, bigTone = tone; // crumbs fill the gaps between the clods, a layer lower
      worley(u, v, 84, s + 2, W5);
      const rSmall = 0.5 + 0.3 * pick(W5[2], 13.7), tSmall = W5[0] / rSmall;
      const domeSmall = tSmall < 1 ? Math.sqrt(1 - tSmall * tSmall) : 0;
      dome = mix(domeSmall * 0.6, domeBig, cover);
      light = mix(domeLight(rSmall, domeSmall) * 0.8, bigLight, cover);
      tone = mix(pick(W5[2], 17.3), bigTone, cover);
    }
    const clod = fbm(u, v, 6, 6, 3, s), moist = fbm(u, v, 5, 5, 4, s + 4), grit = vnoise(u, v, gritF, gritF, s + 3), speck = vnoise(u, v, gritF, gritF, s + 6);
    const wet = step(0.3, 0.85, moist) * 0.55, roots = step(0.9, 0.97, speck);
    out[0] = 0.1 + 0.55 * dome + 0.25 * clod + 0.05 * grit + 0.1 * stone;
    out[1] = (0.62 + 0.24 * light * (0.5 + 0.5 * dome) + 0.12 * tone + 0.3 * (clod - 0.5) + 0.16 * (grit - 0.5)) * (1 - 0.25 * wet) * (1 + 0.45 * stone) * (1 + 0.3 * roots);
    out[2] = (1 - 0.18 * wet) * (1 - 0.3 * stone) + 0.05 * (0.5 - dome);
    out[3] = (0.5 - moist) * 1.2 + 0.8 * roots + 0.5 * stone + (tone - 0.5) * 0.8;
  };
};

/** Fine sand: high-frequency grain, soft crossing wind ripples, a slow warm/cool drift. Low relief. */
export const sand: Maker = (s, _o, size) => {
  const fineGrain = fine(600, size), coarseGrain = fine(250, size);
  return (u, v, out) => {
    const drift = fbm(u, v, 4, 4, 2, s), g = vnoise(u, v, fineGrain, fineGrain, s + 1), g2 = vnoise(u, v, coarseGrain, coarseGrain, s + 2);
    const bend = (drift - 0.5) * 1.6; // the ripples meander
    const r1 = 0.5 + 0.5 * Math.sin(TAU * (14 * u + 5 * v + bend));
    const r2 = 0.5 + 0.5 * Math.sin(TAU * (-4 * u + 11 * v + bend * 0.7));
    const dune = 0.5 + 0.5 * Math.sin(TAU * (2 * u + v + bend * 0.4));
    const ripple = r1 * r1 * (3 - 2 * r1) * 0.65 + r2 * 0.2 + dune * 0.15;
    out[0] = 0.4 + 0.45 * ripple + 0.12 * (g - 0.5) + 0.06 * (g2 - 0.5);
    out[1] = 0.92 + 0.06 * ripple + 0.1 * (g - 0.5) + 0.12 * step(0.9, 0.98, g2);
    out[2] = 0.95 + 0.06 * (g - 0.5);
    out[3] = (drift - 0.5) * 1.1;
  };
};

const CHIP = new Float64Array(5); // [covered 0..1, height, tone, hue, light]
/** One layer of bark chips: a randomly turned ellipse around each cell's point (a chip never reaches past its cell, so the layer needs no neighbour search). */
const chipLayer = (u: number, v: number, n: number, s: number, fibre: number) => {
  worley(u, v, n, s, W5);
  const id = W5[2], ang = TAU * pick(id, 3.7), c = Math.cos(ang), sn = Math.sin(ang);
  const px = -W5[3], py = -W5[4], x = c * px + sn * py, y = -sn * px + c * py; // the offset in the chip's own axes
  const a = 0.5 + 0.35 * pick(id, 6.1), b = 0.18 + 0.16 * pick(id, 8.3);
  const e2 = (x / a) ** 2 + (y / b) ** 2;
  if (e2 >= 1) {
    CHIP.fill(0);
    return;
  }
  const dome = Math.sqrt(1 - e2), streak = 0.5 + 0.5 * Math.sin(y * fibre / b + id * 50 + x * 2);
  CHIP[0] = step(0, 0.18, dome);
  CHIP[1] = 0.25 + 0.5 * dome + 0.15 * pick(id, 12.9);
  CHIP[2] = (0.55 + 0.45 * pick(id, 11.3)) * (0.78 + 0.22 * streak);
  CHIP[3] = pick(id, 5.9) * 1.2 - 0.2; // red-brown ... grey-brown
  CHIP[4] = clamp((px * LIGHT[0] + py * LIGHT[1]) / (a * 1.3) + dome * LIGHT[2]);
};

const CHIP_LAYERS = [17, 22, 28]; // chips per tile side of each layer, bottom to top: three staggered piles, so no cell grid shows

/** Bark chips: three layers of overlapping elongated flakes, each turned its own way, with its own tone and hue, lit from one side, over a shredded dark floor. */
export const mulch: Maker = (s, _o, size) => {
  const fibre = Math.round(fine(14, size / 18)), shred = fine(300, size);
  return (u, v, out) => {
    const floor = vnoise(u, v, 14, shred, s + 20), age = vnoise(u, v, 5, 5, s + 21); // faded or fresh patches of the pile
    let covered = 0, height = 0, tone = 0, hue = 0, rough = 0;
    // top layer first: a layer below is only looked up where the ones above leave a gap
    for (let i = CHIP_LAYERS.length - 1; i >= 0 && covered < 0.98; i--) {
      chipLayer(u, v, CHIP_LAYERS[i], s + i * 7, fibre);
      const w = CHIP[0] * (1 - covered);
      if (w === 0) continue;
      height += w * (CHIP[1] + 0.2 * i);
      tone += w * CHIP[2] * (0.62 + 0.38 * CHIP[4]);
      hue += w * CHIP[3];
      rough += w * 0.95;
      covered += w;
    }
    const gap = 1 - covered;
    out[0] = 0.05 * floor + height * 0.8;
    out[1] = (tone + gap * (0.4 + 0.2 * floor)) * (0.88 + 0.24 * age);
    out[2] = rough + gap * 1.05;
    out[3] = hue + (age - 0.5) * 1.2;
  };
};

/** Worn road surface: light and dark aggregate chips, polished and repaired patches, rare meandering cracks. Narrow tone range. */
export const asphalt: Maker = (s, _o, size) => {
  const coarse = fine(260, size), mid = fine(90, Math.floor(size * 0.7)), grain = fine(500, size);
  return (u, v, out) => {
    const a1 = vnoise(u, v, coarse, coarse, s), a2 = dnoise(u, v, 1, mid, mid, s + 1), g = vnoise(u, v, grain, grain, s + 2); // a turned lattice for the dark chips: together with the axis one, no square chips
    const base = fbm(u, v, 5, 5, 3, s + 3), patch = fbm(u, v, 3, 3, 2, s + 4), crackZone = vnoise(u, v, 3, 3, s + 5);
    const worn = step(0.5, 0.8, base), repair = step(0.6, 0.64, patch) * 0.7;
    const light = step(0.74, 0.95, a1) * (1 - repair * 0.6), darkChip = 1 - step(0.05, 0.3, a2);
    let crack = 0;
    if (crackZone > 0.72) crack = (1 - step(0.0008, 0.005, Math.abs(fbm(u, v, 4, 4, 4, s + 6) - 0.5))) * step(0.72, 0.8, crackZone); // a contour of a low-frequency noise is a meandering line
    out[0] = 0.5 + 0.25 * (a1 - 0.5) + 0.15 * (a2 - 0.5) + 0.1 * light + 0.06 * (g - 0.5) - 0.55 * crack;
    out[1] = (0.88 + (base - 0.5) * 0.12 + 0.4 * light - 0.18 * darkChip + 0.1 * (g - 0.5) + 0.08 * worn - 0.08 * repair) * (1 - 0.65 * crack);
    out[2] = 1 - 0.18 * worn - 0.08 * light + 0.06 * repair + 0.15 * crack;
    out[3] = (base - 0.5) * 0.8 - 0.3 * repair;
  };
};

const WAVES: readonly (readonly [number, number, number])[] = [[4, 1, 1], [-3, 7, 0.8], [9, -5, 0.6], [2, 14, 0.45], [-13, 6, 0.35], [17, 10, 0.25]];
const WAVE_SUM = WAVES.reduce((a, w) => a + w[2], 0);
/** A second, finer set of waves: the zero contours of their sum make the faint net of caustic lines. */
const NET: readonly (readonly [number, number, number])[] = [[7, 3, 1], [-5, 9, 0.9], [11, -4, 0.8], [2, 12, 0.7], [-8, -10, 0.6]];
const NET_SUM = NET.reduce((a, w) => a + w[2], 0);
/** Pool water from above: overlapping ripples of integer frequencies bent by gentle noise, and a faint net of caustic lines. */
export const water: Maker = (s, _o, size) => {
  const chop = fine(64, size);
  return (u, v, out) => {
    const bend = fbm(u, v, 3, 3, 2, s), small = vnoise(u, v, chop, chop, s + 1);
    let sum = 0, web = 0;
    for (let i = 0; i < WAVES.length; i++) sum += WAVES[i][2] * Math.sin(TAU * (WAVES[i][0] * u + WAVES[i][1] * v + (bend - 0.5) * 1.4 * (i % 3 + 1)));
    const h = 0.5 + 0.4 * (sum / WAVE_SUM) + 0.06 * (small - 0.5);
    for (let i = 0; i < NET.length; i++) web += NET[i][2] * Math.sin(TAU * (NET[i][0] * u + NET[i][1] * v + (bend - 0.5) * 2.2 * (i % 2 + 1) + (h - 0.5) * 0.8));
    const net = Math.pow(clamp(1 - Math.abs(web / NET_SUM) * 2.2), 3);
    out[0] = h;
    out[1] = 0.85 + 0.12 * (h - 0.5) + 0.22 * net * (0.6 + 0.4 * h);
    out[2] = 0.9 + 0.2 * (1 - h) + 0.05 * (small - 0.5);
    out[3] = (bend - 0.5) * 0.9 + 0.3 * net;
  };
};

const SIDE = new Float64Array(1);
/** Distance (m) from a point to the nearest side of a rectangle; SIDE[0] = how much that side faces the light (-1..1), i.e. a bevel there is lit or shaded. */
const nearestSide = (left: number, right: number, top: number, bottom: number): number => {
  let d = left, nx = -1, ny = 0;
  if (right < d) {
    d = right;
    nx = 1;
    ny = 0;
  }
  if (top < d) {
    d = top;
    nx = 0;
    ny = -1;
  }
  if (bottom < d) {
    d = bottom;
    nx = 0;
    ny = 1;
  }
  SIDE[0] = nx * LIGHT[0] + ny * LIGHT[1];
  return d;
};

/** Pavers in a grid: each its own tone and hue, lit bevels, worn chipped edges, sandy joints with moss-stained stretches. */
export const paving: Maker = (s, _o, size) => {
  const fineGrain = fine(200, size), sandGrain = fine(300, size);
  const n = 3, cell = 0.8 / n;
  return (u, v, out) => {
    const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y);
    const d = nearestSide((x - i) * cell, (i + 1 - x) * cell, (y - j) * cell, (j + 1 - y) * cell); // metres to the paver's edge
    const bevel = (1 - step(0.007, 0.02, d)) * SIDE[0];
    const joint = 1 - step(0.004, 0.008, d);
    const id = hash(i % n, j % n, s);
    const hue = hash(i % n, j % n, s + 3) - 0.5;
    const g = fbm(u, v, 40, 40, 3, s + 1) - 0.5, speck = vnoise(u, v, fineGrain, fineGrain, s + 2), chipNoise = vnoise(u, v, 70, 70, s + 5);
    const stain = step(0.4, 0.65, vnoise(u, v, 9, 9, s + 6)), sandy = vnoise(u, v, sandGrain, sandGrain, s + 7);
    const edge = 1 - step(0.008, 0.025, d); // the worn rim
    const chip = edge * step(0.72, 0.85, chipNoise);
    const flecks = 0.1 * step(0.9, 0.97, speck) - 0.14 * (1 - step(0.08, 0.2, speck));
    out[0] = (0.8 + g * 0.3 - 0.07 * edge - 0.3 * chip) * (1 - joint) + (0.25 + 0.1 * sandy) * joint;
    out[1] = (0.93 - 0.2 * id * id + g * 0.16 + flecks + 0.2 * bevel + 0.08 * chip) * (1 - joint) + (0.55 + 0.2 * (sandy - 0.5) - 0.18 * stain) * joint;
    out[2] = (0.85 + (id - 0.5) * 0.2 + 0.1 * chip + 0.06 * (speck - 0.5)) * (1 - joint) + joint;
    out[3] = hue * 0.9 * (1 - joint) + (0.3 + 0.5 * stain) * joint;
  };
};

/** Irregular stones separated by a gap: cobbles are domed and lit from one side, flagstones flat at their own level with lit rims. Each stone has its own tone and hue, edges are worn, some joints mossy. */
const stones = (cobble: boolean): Maker => (s, _o, size) => {
  const cells = cobble ? 8 : 4;
  const gap = cobble ? 0.12 : 0.07;
  const grain = fine(200, size);
  return (u, v, out) => {
    worley(u, v, cells, s, W5);
    const edge = W5[1] - W5[0], id = W5[2], r = W5[0];
    const joint = 1 - step(gap * 0.5, gap * 1.4, edge);
    const dome = cobble ? step(0, 0.6, edge) : 0.85;
    const rim = 1 - step(gap * 1.4, gap * 3.4, edge); // worn, lighter rim
    // the side of the stone facing the light is brighter: a dome for a cobble, only the rim for a flagstone
    const face = r > 1e-6 ? (-W5[3] * LIGHT[0] - W5[4] * LIGHT[1]) / r : 0;
    const lit = cobble ? 0.9 + 0.2 * face * (1 - step(0, 0.6, edge) * 0.55) : 1 + 0.3 * face * rim;
    const g = fbm(u, v, 36, 36, 3, s + 1) - 0.5, speck = vnoise(u, v, grain, grain, s + 2);
    const moss = step(0.48, 0.62, fbm(u, v, 9, 9, 2, s + 3)), stain = step(0.6, 0.8, vnoise(u, v, 6, 6, s + 5));
    const level = cobble ? 0 : (pick(id, 53.3) - 0.5) * 0.25;
    const flecks = 0.1 * step(0.9, 0.97, speck) - 0.12 * (1 - step(0.08, 0.2, speck));
    out[0] = (0.35 + 0.55 * dome + level + g * 0.15 - 0.08 * rim) * (1 - joint) + 0.1 * joint;
    out[1] =
      ((0.93 - 0.2 * pick(id, 29.3) ** 2 + g * 0.18 + flecks + 0.06 * rim - 0.14 * stain - 0.12 * moss * rim) * lit) * (1 - joint) +
      (0.62 - 0.18 * moss + 0.12 * (speck - 0.5)) * joint;
    out[2] = (0.88 + 0.1 * (speck - 0.5) + 0.06 * rim) * (1 - joint) + joint;
    out[3] = (pick(id, 37.7) - 0.5) * 0.8 * (1 - joint) + (0.2 + 0.6 * moss) * joint + 0.5 * moss * rim * (1 - joint);
  };
};
export const cobble = stones(true);
export const flagstone = stones(false);

/** Outdoor deck boards (woodfloor, `weathered`): silver-grey fibres, ~6 mm gaps between boards and at the butt joints, per-board tone and hue, end-grain checks. */
export const deck: Maker = (s, o, size) => {
  const rows = Math.max(2, Math.round(1.2 / (o.plankW ?? 0.14)));
  const fibreF = fine(220, size), checkF = fine(160, size);
  return (u, v, out) => {
    const j = Math.floor(v * rows), fy = v * rows - j;
    const dy = (Math.min(fy, 1 - fy) * 1.2) / rows; // metres to the board's long edge
    const bu = ((u - hash(j, 3, s)) % 1 + 1) % 1 * 2, k = Math.floor(bu);
    const dx = Math.min(bu - k, k + 1 - bu) * 0.6; // metres to its end
    const id = j * 2 + k;
    const t = hash(id, 5, s) + fy * 0.36; // each board samples its own stretch of grain
    const fibre = vnoise(u, t, 4, fibreF, s + 1), fine2 = vnoise(u, t, 26, Math.min(90, fibreF), s + 2);
    const check = step(0.84, 0.92, vnoise(u, t, 22, checkF, s + 3)) * (1 - step(0.05, 0.16, dx)); // short splits along the grain near the ends
    const ring = 0.5 + 0.5 * Math.sin(TAU * (t * 9 + (fibre - 0.5) * 1.4));
    const gapMask = 1 - step(0.003, 0.0045, Math.min(dy, dx));
    const arris = 1 - step(0.003, 0.008, Math.min(dy, dx)); // lighter, rounded edge
    out[0] = (0.65 + 0.15 * (fibre - 0.5) + 0.08 * ring - 0.3 * check - 0.1 * arris) * (1 - gapMask) + 0.02 * gapMask;
    out[1] = (0.88 - 0.2 * hash(id, 9, s) ** 2 + 0.3 * (fibre - 0.5) + 0.16 * (fine2 - 0.5) - 0.1 * ring - 0.3 * check + 0.05 * arris) * (1 - 0.8 * gapMask);
    out[2] = (0.95 + 0.1 * (fibre - 0.5) + 0.1 * check) * (1 - gapMask) + gapMask;
    out[3] = (-0.2 + (hash(id, 11, s) - 0.45) * 1.4 + 0.3 * (ring - 0.5)) * (1 - gapMask);
  };
};

/** Outdoor concrete (concrete, `outdoor`): laid over the plain recipe's output: mottled, stained, flecked with fine aggregate. */
export function weatherConcrete(u: number, v: number, s: number, size: number, out: Float64Array) {
  const f = fine(220, size);
  const mottle = fbm(u, v, 7, 7, 3, s + 4), stain = step(0.6, 0.78, vnoise(u, v, 3, 3, s + 5)), fleck = vnoise(u, v, f, f, s + 6);
  out[0] += 0.05 * (mottle - 0.5) + 0.06 * (fleck - 0.5);
  out[1] *= (0.86 + 0.3 * mottle) * (1 - 0.18 * stain) * (1 + 0.28 * step(0.88, 0.96, fleck) - 0.22 * (1 - step(0.08, 0.14, fleck)));
  out[2] += 0.05 * stain;
  out[3] = (mottle - 0.5) * 0.5 + 0.35 * stain;
}

const SLAB_TILE_M = 1.6;
const SLAB_COURSES: readonly (readonly [number, number])[] = [[0, 0.6], [0.6, 1.1], [1.1, 1.6]]; // metres from the tile's top: 0.6 / 0.5 / 0.5
/** Slab boundaries of one course, in metres from its random start: 2 or 3 slabs of 0.45-1.0 m that add up to the tile, so the course repeats seamlessly. */
const slabEdges = (j: number, s: number): number[] => {
  if (hash(j, 2, s) < 0.45) {
    const a = 0.6 + 0.4 * hash(j, 6, s);
    return [0, a, SLAB_TILE_M];
  }
  const w = [hash(j, 7, s) + 0.2, hash(j, 8, s) + 0.2, hash(j, 9, s) + 0.2], sum = w[0] + w[1] + w[2], extra = SLAB_TILE_M - 3 * 0.45;
  const a = 0.45 + (extra * w[0]) / sum, b = a + 0.45 + (extra * w[1]) / sum;
  return [0, a, b, SLAB_TILE_M];
};

/**
 * Coursed rectangular slabs (sawn sandstone / limestone patio): three courses per tile, each cut into 2-3 slabs of random width, ~8 mm joints with fine sand,
 * per-slab tone, hue, gradient and grain, chipped rims, rare stains. Always rectangular: it must read as a laid patio, not crazy paving.
 */
export const slabs: Maker = (s, _o, size) => {
  const edges = SLAB_COURSES.map((_, j) => slabEdges(j, s));
  const offsets = SLAB_COURSES.map((_, j) => hash(j, 4, s) * SLAB_TILE_M);
  const speckF = fine(200, size), sandF = fine(300, size), chipF = fine(90, size);
  return (u, v, out) => {
    const ym = v * SLAB_TILE_M;
    const j = ym < SLAB_COURSES[1][0] ? 0 : ym < SLAB_COURSES[2][0] ? 1 : 2;
    const [y0, y1] = SLAB_COURSES[j], e = edges[j];
    const x = (((u * SLAB_TILE_M - offsets[j]) % SLAB_TILE_M) + SLAB_TILE_M) % SLAB_TILE_M;
    const k = x < e[1] ? 0 : x < e[2] ? 1 : 2;
    const x0 = e[k], x1 = e[k + 1], id = j * 3 + k;
    const d = nearestSide(x - x0, x1 - x, ym - y0, y1 - ym); // metres to the slab's edge
    const bevel = (1 - step(0.006, 0.02, d)) * SIDE[0];
    const joint = 1 - step(0.0035, 0.0055, d), rim = 1 - step(0.005, 0.02, d);
    const lx = (x - x0) / (x1 - x0) - 0.5, ly = (ym - y0) / (y1 - y0) - 0.5;
    // every slab samples its own patch of grain (a constant shift keeps the noise periodic) and has its own faint bedding lines
    const grain = fbm(u + hash(id, 12, s), v + hash(id, 13, s), 24, 24, 4, s + 1);
    const speck = vnoise(u, v, speckF, speckF, s + 2), chipNoise = vnoise(u, v, chipF, chipF, s + 3), sandy = vnoise(u, v, sandF, sandF, s + 7);
    const stain = step(0.86, 0.95, vnoise(u, v, 9, 9, s + 5));
    const bed = 0.5 + 0.5 * Math.sin(TAU * (Math.round(5 + 6 * hash(id, 14, s)) * v + (grain - 0.5) * 1.2));
    const chip = rim * step(0.75, 0.88, chipNoise);
    const tone = 0.93 - 0.2 * hash(id, 9, s) ** 2 + lx * (hash(id, 15, s) - 0.5) * 0.14 + ly * (hash(id, 16, s) - 0.5) * 0.14;
    const flecks = 0.06 * step(0.88, 0.96, speck) - 0.08 * (1 - step(0.1, 0.2, speck));
    out[0] = (0.7 + (hash(id, 10, s) - 0.5) * 0.08 + 0.08 * (grain - 0.5) + 0.03 * bed - 0.05 * rim - 0.25 * chip) * (1 - joint) + 0.12 * joint;
    out[1] =
      (tone + 0.1 * (grain - 0.5) + 0.06 * (speck - 0.5) + flecks - 0.04 * bed + 0.14 * bevel + 0.08 * chip - 0.14 * stain) * (1 - joint) +
      (0.55 + 0.2 * (sandy - 0.5)) * joint;
    out[2] = (0.88 + (hash(id, 17, s) - 0.5) * 0.12 + 0.08 * (speck - 0.5) + 0.08 * chip) * (1 - joint) + joint;
    out[3] = ((hash(id, 11, s) - 0.5) * 0.9 + (lx + ly) * 0.2 + 0.4 * stain) * (1 - joint) + 0.3 * joint;
  };
};
