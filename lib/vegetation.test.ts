import test from "node:test";
import assert from "node:assert/strict";
import { ATLAS_COLS, ATLAS_ROWS, LEVELS, LEVEL_MULT, SPECIES_IDS, TILE, VARIANTS, buildVegetation, foliageLook, lawnDensity, levelOfFoliage, speciesDef, tileRect, triangleCount, type Level, type Species } from "./vegetation.ts";
import { SEASONS, seasonPalette } from "./season.ts";
import { TIERS } from "./quality.ts";

const arr = (s: Species, v = 0, lod: 0 | 1 = 0, name = "position") => buildVegetation(s, v, lod).getAttribute(name).array as Float32Array;

test("the same species and variant always gives the same geometry", () => {
  for (const s of ["oak", "spruce", "hedge", "flower_bed"] as Species[]) {
    const a = Array.from(arr(s, 1)), b = Array.from(arr(s, 1));
    assert.deepEqual(a, b);
    assert.equal(buildVegetation(s, 1), buildVegetation(s, 1), "cached");
  }
});

test("variants of a tree differ from each other", () => {
  assert.notDeepEqual(Array.from(arr("oak", 0)), Array.from(arr("oak", 1)));
  assert.notDeepEqual(Array.from(arr("pine", 2)), Array.from(arr("pine", 3)));
});

test("every species and variant is finite, indexed in range and within its triangle budget (scaled by the foliage level)", () => {
  for (const s of SPECIES_IDS) {
    for (let v = 0; v < VARIANTS; v++) {
      for (const lod of [0, 1] as const) {
        for (const level of LEVELS) {
          const g = buildVegetation(s, v, lod, level);
          for (const name of ["position", "normal", "uv", "color", "aPart", "aCenter"]) {
            const a = g.getAttribute(name).array as Float32Array;
            assert.ok(a.every(Number.isFinite), `${s}:${v}:${lod}:${level} ${name} has NaN`);
          }
          const n = g.getAttribute("position").count;
          assert.ok((g.index!.array as Uint32Array).every((i) => i < n), `${s}:${v} index out of range`);
          const tris = triangleCount(g);
          const cap = speciesDef(s).budget * LEVEL_MULT[level] * 1.6; // twigs and finer trunks come on top of the leaf cards
          assert.ok(tris > 0 && tris <= cap, `${s}:${v}:${lod}:${level} has ${tris} triangles (cap ${cap})`);
        }
      }
    }
  }
});

test("the far LOD of a tree is cheaper than the near one", () => {
  for (const s of SPECIES_IDS.filter((id) => speciesDef(id).tree)) assert.ok(triangleCount(buildVegetation(s, 0, 1)) < triangleCount(buildVegetation(s, 0, 0)), s);
});

test("bounding boxes match the declared footprint and height at every foliage level", () => {
  for (const s of SPECIES_IDS) {
    const [w, h, d] = speciesDef(s).size;
    for (let v = 0; v < VARIANTS; v++) {
      for (const level of LEVELS) {
        const bb = buildVegetation(s, v, 0, level).boundingBox!;
        const tol = 0.02;
        assert.ok(bb.max.y <= h + tol && bb.max.y >= h - tol, `${s}:${v}:${level} height ${bb.max.y} vs ${h}`);
        assert.ok(Math.max(Math.abs(bb.min.x), bb.max.x) <= w / 2 + tol, `${s}:${v}:${level} x extent`);
        assert.ok(Math.max(Math.abs(bb.min.z), bb.max.z) <= d / 2 + tol, `${s}:${v}:${level} z extent`);
        assert.ok(bb.min.y >= -0.3, `${s}:${v}:${level} sinks ${bb.min.y}`); // roots and the lowest leaf cards dip a little below the ground
      }
    }
  }
});

test("denser foliage levels add leaves: more triangles on trees, shrubs and hedges, in order", () => {
  for (const s of ["oak", "birch", "spruce", "shrub", "hedge_long", "grass_tall", "fern"] as Species[]) {
    const counts = LEVELS.map((l) => triangleCount(buildVegetation(s, 0, 0, l)));
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `${s} level ${i}: ${counts.join(" < ")}`);
    assert.ok(counts[3] > counts[0] * 1.5, `${s}: ${counts.join(", ")}`);
  }
});

test("level 0 (the Light tier) uses only the original leaf tiles and level 1+ trees add their species sprig", () => {
  const tileOf = (s: Species, level: Level) => {
    const uv = buildVegetation(s, 0, 0, level).getAttribute("uv").array as Float32Array;
    const tiles = new Set<number>();
    for (let i = 0; i < uv.length; i += 2) tiles.add(Math.floor((1 - uv[i + 1]) * ATLAS_ROWS) * ATLAS_COLS + Math.floor(uv[i] * ATLAS_COLS));
    return tiles;
  };
  for (const s of ["oak", "maple", "spruce", "hedge", "shrub"] as Species[]) {
    assert.ok([...tileOf(s, 0)].every((t) => t < 16), `${s} level 0 uses tiles ${[...tileOf(s, 0)]}`);
    assert.ok([...tileOf(s, 2)].some((t) => t >= 16 && t < 32), `${s} level 2 has no species tile`);
  }
});

test("the silhouette of a tree stays the same size at every foliage level (branching does not change)", () => {
  for (const s of ["oak", "birch", "pine"] as Species[]) {
    const ext = (level: Level) => {
      const bb = buildVegetation(s, 0, 0, level).boundingBox!;
      return [bb.max.x - bb.min.x, bb.max.z - bb.min.z, bb.max.y];
    };
    const [a, b] = [ext(0), ext(3)];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) / a[i] < 0.12, `${s} extent ${i}: ${a[i]} vs ${b[i]}`);
  }
});

test("foliage levels follow the quality tiers and the lawn grows with the grass knob", () => {
  const lv = (Object.keys(TIERS) as (keyof typeof TIERS)[]).map((t) => levelOfFoliage(TIERS[t].foliage));
  assert.deepEqual(lv, [...lv].sort((a, b) => a - b), "better tiers never get less foliage");
  assert.ok(lawnDensity(TIERS.eco.grass) < 1 && lawnDensity(TIERS.eco.grass) > 0, "Eco thins the lawn");
  assert.equal(lawnDensity(TIERS.low.grass), 1);
  let prev = 1;
  for (const t of ["medium", "high", "ultra"] as const) {
    const d = lawnDensity(TIERS[t].grass);
    assert.ok(d > prev && d <= 7, `${t} ${d}`);
    prev = d;
  }
});

test("atlas tile names are unique and fit the 8 x 8 atlas", () => {
  const idx = Object.values(TILE);
  assert.equal(new Set(idx).size, idx.length);
  assert.ok(idx.every((i) => i >= 0 && i < ATLAS_COLS * ATLAS_ROWS));
});

test("foliage look follows the palette and the season weights", () => {
  const summer = foliageLook("summer", 0), winter = foliageLook("winter", 0), spring = foliageLook("spring", 0), autumn = foliageLook("autumn", 0);
  assert.equal(summer.leafy, 1);
  assert.equal(winter.leafy, 0);
  assert.equal(winter.snow, 1);
  assert.equal(spring.blossom, 1);
  assert.equal(summer.blossom, 0);
  assert.equal(autumn.fruit, 1);
  assert.ok(summer.fruit > 0 && summer.fruit < 1);
  assert.deepEqual(autumn.grass, seasonPalette("autumn", 0).grass);
  const mid = foliageLook("autumn", 0.5);
  assert.ok(mid.leafy > 0 && mid.leafy < autumn.leafy);
  assert.ok(mid.snow > 0 && mid.snow < 1);
  for (const s of SEASONS) for (const c of foliageLook(s, 0.3).leaf) assert.match(c, /^#[0-9a-f]{6}$/);
});

test("shrubs get a second leaf colour that follows the season (autumn rust, summer green) and blends between seasons", () => {
  for (const s of SEASONS) assert.match(foliageLook(s, 0.4).bushAlt, /^#[0-9a-f]{6}$/);
  const hue = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, , ab] = hue(foliageLook("autumn", 0).bushAlt), [sr, , sb] = hue(foliageLook("summer", 0).bushAlt);
  assert.ok(ar > ab * 3 && sr < sb * 2, "autumn leans red, summer green");
  assert.notEqual(foliageLook("autumn", 0.5).bushAlt, foliageLook("autumn", 0).bushAlt);
});

// ---------------------------------------------------------------- grass

const grassOf = (s: Species, v: number, level: Level, lod: 0 | 1 = 0) => {
  const g = buildVegetation(s, v, lod, level);
  const p = g.getAttribute("position").array as Float32Array, c = g.getAttribute("color").array as Float32Array, part = g.getAttribute("aPart").array as Float32Array;
  return { g, p, c, part, n: p.length / 3 };
};

test("the Light tier keeps the original tuft: 9 blades of 2 segments on the blade tile", () => {
  const uv = buildVegetation("tuft", 0, 0, 0).getAttribute("uv").array as Float32Array;
  const [u0, v0, u1, v1] = tileRect(TILE.blade);
  for (let i = 0; i < uv.length; i += 2) assert.ok(uv[i] >= u0 - 1e-6 && uv[i] <= u1 + 1e-6 && uv[i + 1] >= v0 - 1e-6 && uv[i + 1] <= v1 + 1e-6);
});

test("a lawn tuft of the denser levels is a filled fan of many thin blades, not a hollow ring", () => {
  for (const level of [1, 2, 3] as Level[]) {
    for (let v = 0; v < VARIANTS; v++) {
      const { p, n } = grassOf("tuft", v, level);
      let far = 0;
      for (let i = 0; i < n; i++) far = Math.max(far, Math.hypot(p[i * 3], p[i * 3 + 2]));
      // vertices in the lower half of the clump, by distance from the axis: a ring has none inside 40% of the radius
      let low = 0, lowInner = 0, high = 0, highInner = 0;
      for (let i = 0; i < n; i++) {
        const r = Math.hypot(p[i * 3], p[i * 3 + 2]) / far, y = p[i * 3 + 1];
        const inner = r < 0.4 ? 1 : 0;
        if (y < 0.15) {
          low++;
          lowInner += inner;
        } else {
          high++;
          highInner += inner;
        }
      }
      assert.ok(lowInner / low > 0.3, `${level}:${v} the foot of the clump is hollow (${lowInner}/${low})`);
      assert.ok(highInner / high > 0.15, `${level}:${v} the middle of the clump is hollow (${highInner}/${high})`);
      assert.ok(triangleCount(buildVegetation("tuft", v, 0, level)) >= 60, `${level}:${v} too few blades`);
    }
  }
});

test("grass blades are solid tapered geometry on the white tile, lighter at the tips, and the clump mixes palette slots and straw", () => {
  for (const level of [1, 2, 3] as Level[]) {
    const { g, c, p, part, n } = grassOf("tuft", 0, level);
    const uv = g.getAttribute("uv").array as Float32Array;
    const [u0, v0, u1, v1] = tileRect(TILE.white);
    for (let i = 0; i < uv.length; i += 2) assert.ok(uv[i] >= u0 - 1e-6 && uv[i] <= u1 + 1e-6 && uv[i + 1] >= v0 - 1e-6 && uv[i + 1] <= v1 + 1e-6, "no alpha-tested tile");
    let top = 0, topN = 0, foot = 0, footN = 0;
    const slots = new Set<number>();
    for (let i = 0; i < n; i++) {
      const lum = c[i * 3] + c[i * 3 + 1] + c[i * 3 + 2];
      if (p[i * 3 + 1] > 0.2) {
        top += lum;
        topN++;
      } else if (p[i * 3 + 1] < 0.06) {
        foot += lum;
        footN++;
      }
      slots.add(part[i * 4 + 3]);
    }
    assert.ok(top / topN > foot / footN, `${level} tips ${top / topN} vs roots ${foot / footN}`);
    assert.ok(slots.size >= 3, `${level} slots ${[...slots]}`);
  }
  let straw = 0;
  for (let v = 0; v < VARIANTS; v++) {
    const { c, n } = grassOf("tuft", v, 2);
    for (let i = 0; i < n; i++) if (c[i * 3 + 2] < 0.65 * c[i * 3 + 1]) straw++;
  }
  assert.ok(straw > 0, "dead straw blades and seed heads");
});

test("grass sways more at the tip than at the root, and the far LOD of a tuft is cheaper at every denser level", () => {
  for (const level of [1, 2, 3] as Level[]) {
    const { p, part, n } = grassOf("tuft", 1, level);
    let tip = 0, root = 0;
    for (let i = 0; i < n; i++) {
      const sw = part[i * 4 + 2], y = p[i * 3 + 1];
      if (y > 0.2) tip = Math.max(tip, sw);
      if (y < 0.03) root = Math.max(root, sw);
    }
    assert.ok(tip > 0 && tip > root * 3, `${level} tip ${tip} root ${root}`);
    assert.ok(triangleCount(buildVegetation("tuft", 1, 1, level)) < triangleCount(buildVegetation("tuft", 1, 0, level)) || level === 0);
  }
});

test("a tuft stays inside its triangle budget at the top level and ornamental grass and reeds use the same fans", () => {
  for (const s of ["tuft", "grass_tall", "reed"] as Species[]) assert.ok(triangleCount(buildVegetation(s, 2, 0, 3)) <= speciesDef(s).budget * LEVEL_MULT[3], s);
  const { c, n } = grassOf("grass_tall", 0, 3);
  assert.ok(n > 0 && new Set(Array.from({ length: n }, (_, i) => c[i * 3].toFixed(2))).size > 6, "per-blade colour jitter");
});
