import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FRINGE, GROUND_TILES_M, MACRO_SCALES_M, groundGain, groundSurface, macroOf, roomGain, scaleColor } from "./groundLook.ts";
import { fringeTris } from "./groundGeo.ts";
import { FLOORS, FLOOR_KINDS } from "./materials.ts";
import { PBR_KINDS, PBR_TILE_M } from "./materialsPbr.ts";
import { STUDIO_FLOOR, floorVisibility, poolLight, smoothstep } from "./studioLook.ts";
import type { Pt } from "./types.ts";

/** How far a ratio of two periods is from a whole number (of the longer over the shorter): 0 = the two repeats line up exactly. */
const offBeat = (a: number, b: number) => {
  const r = Math.max(a, b) / Math.min(a, b);
  return Math.abs(r - Math.round(r));
};

describe("macro variation", () => {
  it("never lines up with the repeat of a ground tile", () => {
    for (const scale of MACRO_SCALES_M) for (const tile of GROUND_TILES_M) assert.ok(offBeat(scale, tile) >= 0.1, `${scale} m patches against ${tile} m tiles`);
  });
  it("is broad to fine", () => {
    assert.deepEqual([...MACRO_SCALES_M], [...MACRO_SCALES_M].sort((a, b) => b - a));
  });
  it("varies a lawn more than a laid pattern, and leaves water alone", () => {
    assert.ok(macroOf("grass")!.tone > macroOf("pavers_grey")!.tone);
    assert.equal(macroOf("water"), null);
  });
});

describe("ground surfaces", () => {
  it("every outdoor kind of the garden has a procedural look except the ones left flat on purpose", () => {
    const flat = FLOOR_KINDS.filter((k) => FLOORS[k].outdoor && !groundSurface(k));
    assert.deepEqual(flat, []);
  });
  it("a tile is as big as the texture's tile was authored for, or a deliberate multiple of it", () => {
    for (const k of FLOOR_KINDS) {
      const s = groundSurface(k);
      if (!s || !PBR_KINDS.includes(s.kind)) continue;
      const authored = PBR_TILE_M[s.kind];
      const r = s.tile / authored;
      assert.ok(r >= 0.25 && r <= 4, `${k}: ${s.tile} m tile for a texture authored at ${authored} m`);
    }
  });
  it("outdoor concrete is weathered, a concrete room floor is not", () => {
    assert.equal(groundSurface("concrete")?.opts?.outdoor, true);
    assert.equal(groundSurface("polished")?.opts?.outdoor, undefined);
  });
});

/** Area of the triangles of a flat fringe (m2), and whether every one of them faces up. */
function area(pos: number[]) {
  let sum = 0;
  let up = true;
  for (let i = 0; i < pos.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((o) => [pos[i + o], pos[i + o + 1], pos[i + o + 2]]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    sum += Math.abs(ny) / 2;
    if (ny < 0) up = false;
  }
  return { sum, up };
}

describe("fringe around a surface", () => {
  const square = (s: number): Pt[] => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }];
  it("is a closed ring: a square of side s and width w has s * 4w + 4w2 of it", () => {
    const f = fringeTris(square(4), 0.3, 0.3);
    assert.ok(Math.abs(area(f.pos).sum - (4 * 4 * 0.3 + 4 * 0.09)) < 1e-9);
    assert.ok(area(f.pos).up);
  });
  it("does not care which way the outline runs", () => {
    const f = fringeTris(square(4).reverse(), 0.3, 0.3);
    assert.ok(Math.abs(area(f.pos).sum - 5.16) < 1e-9);
    assert.ok(area(f.pos).up);
  });
  it("is darkest on the outline and gone on the outer side", () => {
    const f = fringeTris(square(2), FRINGE.width, FRINGE.edge);
    assert.equal(Math.max(...f.alpha), FRINGE.edge);
    assert.equal(Math.min(...f.alpha), 0);
    // every vertex with no opacity lies outside the square
    f.alpha.forEach((a, i) => {
      if (a !== 0) return;
      const [x, z] = [f.pos[i * 3], f.pos[i * 3 + 2]];
      assert.ok(x < 0 || x > 2 || z < 0 || z > 2);
    });
  });
  it("never reaches further than the mitre limit at a sharp corner", () => {
    const spike: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0.2 }, { x: 0, y: 0.4 }];
    const w = 0.3;
    const f = fringeTris(spike, w, 0.3); // without the limit the tip would run 0.3 / sin(1 degree) = 15 m out
    for (let i = 0; i < f.pos.length; i += 3) {
      assert.ok(f.pos[i] >= -2 * w - 1e-9 && f.pos[i] <= 10 + 2 * w + 1e-9);
      assert.ok(f.pos[i + 2] >= -2 * w - 1e-9 && f.pos[i + 2] <= 0.4 + 2 * w + 1e-9);
    }
  });
  it("is empty for an outline that is not a polygon", () => {
    assert.equal(fringeTris([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0.3, 0.3).pos.length, 0);
  });
});

describe("studio floor", () => {
  it("fades from the whole floor near the building to the backdrop far away, and never back", () => {
    assert.equal(floorVisibility(0), 1);
    assert.equal(floorVisibility(STUDIO_FLOOR.fadeFrom), 1);
    assert.equal(floorVisibility(STUDIO_FLOOR.fadeTo), 0);
    let last = 1;
    for (let r = 0; r <= 70; r += 1) {
      const v = floorVisibility(r);
      assert.ok(v <= last + 1e-12);
      last = v;
    }
  });
  it("has a bright core that eases out inside the pool", () => {
    assert.equal(poolLight(0), 1);
    assert.equal(poolLight(STUDIO_FLOOR.pool), 0);
    assert.ok(poolLight(STUDIO_FLOOR.pool / 2) < 0.5); // steeper than a plain smoothstep: the light stays near the building
  });
  it("the pool is gone before the floor starts to fade, so the fade is only ever from the dark mid tone", () => {
    assert.ok(STUDIO_FLOOR.pool <= STUDIO_FLOOR.fadeFrom);
  });
  it("smoothstep is clamped", () => {
    assert.equal(smoothstep(2, 4, 1), 0);
    assert.equal(smoothstep(2, 4, 9), 1);
    assert.equal(smoothstep(2, 4, 3), 0.5);
  });
});

describe("tint gain", () => {
  it("leaves a colour alone at gain 1 and for anything that is not #rrggbb", () => {
    assert.equal(scaleColor("#7fae60", 1), "#7fae60");
    assert.equal(scaleColor("green", 0.5), "green");
  });
  it("scales the light, not the code: half the linear light of white is the sRGB grey 188, black stays black", () => {
    assert.equal(scaleColor("#ffffff", 0.5), "#bcbcbc");
    assert.equal(scaleColor("#000000", 0.5), "#000000");
    assert.equal(scaleColor("#ffffff", 0), "#000000");
  });
  it("never brightens past white", () => {
    assert.equal(scaleColor("#ffffff", 2), "#ffffff");
  });
  it("keeps the hue: every channel is darkened by the same factor in linear light", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(scaleColor("#80c040", 0.6).slice(i, i + 2), 16));
    assert.ok(g > r && r > b);
  });
  it("every kind a room floor has only just been given keeps the brightness of its old texture, the others keep their look", () => {
    assert.equal(roomGain("grass"), groundGain("grass"));
    assert.equal(roomGain("wood"), 1);
    assert.equal(roomGain("paving"), 1); // already procedural on rooms: unchanged
    assert.ok(groundGain("paving") < 1); // a ground area wore the voxel texture
    assert.equal(groundGain("tile"), 1);
  });
});
