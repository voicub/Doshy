import test from "node:test";
import assert from "node:assert/strict";
import { KIND, LEVELS, LEVEL_MULT, SPECIES_IDS, TILE, VARIANTS, buildVegetation, speciesDef, triangleCount, type Species } from "./vegetation.ts";
import { PLANT_SPECIES } from "./vegPlants.ts";
import { PLANT_TILE } from "./vegPlantTiles.ts";

const ids = Object.keys(PLANT_SPECIES) as Species[];
const attr = (s: Species, v: number, level: 0 | 1 | 2 | 3, name: string) => buildVegetation(s, v, 0, level).getAttribute(name).array as Float32Array;

test("there are at least 34 houseplant forms, all indoor, with ids that never clash with the garden", () => {
  assert.ok(ids.length >= 34, `only ${ids.length}`);
  for (const s of ids) {
    assert.match(s, /^hp_[a-z0-9_]+$/);
    assert.ok(speciesDef(s).indoor, `${s} is not indoor`);
    assert.ok(speciesDef(s).label.length > 3);
  }
  assert.equal(new Set(SPECIES_IDS).size, SPECIES_IDS.length, "species ids are unique across the garden and the houseplants");
});

test("every houseplant is finite, indexed in range, within budget at level 0 and under 3200 triangles at level 3", () => {
  for (const s of ids) {
    const def = speciesDef(s);
    for (let v = 0; v < VARIANTS; v++) {
      for (const level of LEVELS) {
        const g = buildVegetation(s, v, 0, level);
        for (const name of ["position", "normal", "uv", "color", "aPart", "aCenter"]) assert.ok((g.getAttribute(name).array as Float32Array).every(Number.isFinite), `${s}:${v}:${level} ${name}`);
        const n = g.getAttribute("position").count;
        assert.ok((g.index!.array as Uint32Array).every((i) => i < n), `${s}:${v}:${level} index out of range`);
        const tris = triangleCount(g);
        assert.ok(tris > 0, `${s} empty`);
        if (level === 0) assert.ok(tris <= def.budget, `${s}:${v} has ${tris} triangles at level 0 (budget ${def.budget})`);
        assert.ok(tris <= def.budget * LEVEL_MULT[level], `${s}:${v}:${level} has ${tris} (cap ${def.budget * LEVEL_MULT[level]})`);
        if (level === 3) assert.ok(tris <= 3200, `${s}:${v} has ${tris} triangles at level 3`);
      }
    }
  }
});

test("the bounding box is the declared size and the plant stands on the ground", () => {
  for (const s of ids) {
    const [w, h, d] = speciesDef(s).size;
    for (const level of LEVELS) {
      const bb = buildVegetation(s, 0, 0, level).boundingBox!;
      const tol = 0.005;
      assert.ok(Math.abs(bb.max.y - h) <= tol, `${s}:${level} height ${bb.max.y} vs ${h}`);
      assert.ok(Math.abs(Math.max(-bb.min.x, bb.max.x) - w / 2) <= tol, `${s}:${level} x extent`);
      assert.ok(Math.abs(Math.max(-bb.min.z, bb.max.z) - d / 2) <= tol, `${s}:${level} z extent`);
      assert.ok(bb.min.y >= -0.1 * h - 0.01, `${s}:${level} sinks to ${bb.min.y}`);
    }
  }
});

test("the same variant is the same geometry, other variants differ", () => {
  for (const s of ids) {
    assert.deepEqual(Array.from(attr(s, 0, 2, "position")), Array.from(attr(s, 0, 2, "position")));
    assert.notDeepEqual(Array.from(attr(s, 0, 2, "position")), Array.from(attr(s, 1, 2, "position")), `${s} variants 0 and 1 are identical`);
  }
});

test("denser foliage levels never lose triangles, and most plants gain leaves", () => {
  let grew = 0;
  for (const s of ids) {
    const counts = LEVELS.map((l) => triangleCount(buildVegetation(s, 0, 0, l)));
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `${s}: ${counts.join(" <= ")}`);
    if (counts[3] > counts[0] * 1.5) grew++;
  }
  assert.ok(grew >= ids.length * 0.8, `only ${grew} of ${ids.length} plants get denser`);
});

test("a houseplant is all KIND.house vertices and paints only its own tiles (plus the shared white, narrow-leaf and blade tiles)", () => {
  const own = new Set<number>(Object.values(PLANT_TILE));
  assert.equal(own.size, Object.keys(PLANT_TILE).length, "tile names map to unique tiles");
  assert.ok([...own].every((t) => t >= 32 && t < 64));
  for (const s of ids) {
    const part = attr(s, 0, 3, "aPart");
    for (let i = 0; i < part.length; i += 4) assert.equal(part[i], KIND.house, `${s} has a non-house vertex`);
    const uv = attr(s, 0, 3, "uv");
    for (let i = 0; i < uv.length; i += 2) {
      const t = Math.floor((1 - uv[i + 1]) * 8) * 8 + Math.floor(uv[i] * 8);
      assert.ok(own.has(t) || t === TILE.white || t === TILE.narrow || t === TILE.blade, `${s} uses tile ${t}`);
    }
  }
});
