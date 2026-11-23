// Saved plans keep every piece where it was, so the realism pass may refine a catalog kind's surface and details but never its footprint:
// Def.w/d/h are frozen and the extent of the parts that make up the silhouette (not `detail` trims, rotated parts or plants) stays put.
// The golden file holds, per kind: w, d, h, x0, x1, y0, y1, z0, z1 of those parts and the part count before the pass.
import assert from "node:assert/strict";
import test from "node:test";
import golden from "./catalogBounds.golden.json" with { type: "json" };
import { CATALOG } from "./catalog.ts";

const TOL = 0.03; // m: cosmetic refinement may nudge an inner part, never the bounds
const MAX_GROWTH = 2.2; // parts per kind vs before (hero pieces +60% aimed for; small cushions and decor get more headroom)
const MAX_SMALL = 80;

test("the realism pass keeps every existing kind's size and silhouette", () => {
  const bad: string[] = [];
  for (const [k, g] of Object.entries(golden as Record<string, number[]>)) {
    const d = CATALOG[k];
    if (!d) {
      bad.push(`${k} removed`);
      continue;
    }
    if (d.w !== g[0] || d.d !== g[1] || d.h !== g[2]) bad.push(`${k} size ${d.w}x${d.d}x${d.h} was ${g[0]}x${g[1]}x${g[2]}`);
    if (g[3] === 0 && g[4] === 0) continue; // no plain box parts to compare
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of d.parts) {
      if (p.veg || p.r || p.detail) continue;
      const [sx, sy, sz] = p.s;
      x0 = Math.min(x0, p.p[0] - sx / 2); x1 = Math.max(x1, p.p[0] + sx / 2);
      y0 = Math.min(y0, p.p[1] - sy / 2); y1 = Math.max(y1, p.p[1] + sy / 2);
      z0 = Math.min(z0, p.p[2] - sz / 2); z1 = Math.max(z1, p.p[2] + sz / 2);
    }
    const now = [x0, x1, y0, y1, z0, z1];
    now.forEach((v, i) => Math.abs(v - g[3 + i]) > TOL && bad.push(`${k} extent[${i}] ${v.toFixed(3)} was ${g[3 + i]}`));
  }
  assert.deepEqual(bad, []);
});

test("part counts grow modestly and a small piece stays light", () => {
  const bad: string[] = [];
  for (const [k, g] of Object.entries(golden as Record<string, number[]>)) {
    const n = CATALOG[k]?.parts.length ?? 0;
    const before = g[g.length - 1];
    const small = CATALOG[k] && CATALOG[k].w * CATALOG[k].d < 1.2;
    if (n > Math.max(before * MAX_GROWTH, before + 6) || (small && n > Math.max(MAX_SMALL, before))) bad.push(`${k} ${before} -> ${n}`);
  }
  assert.deepEqual(bad, []);
});
