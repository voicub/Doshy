import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALBEDO_MEAN, PBR_KINDS, ROUGH_MEAN } from "./materialsPbr.ts";
import { HUE_GAIN, NOISE_ONLY, createTileJob, fbm, hueTilt, vnoise } from "./pbrTiles.ts";
import { dnoise, worley } from "./pbrNoise.ts";

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

describe("periodic noise", () => {
  it("the diagonal and cellular noises repeat after a whole tile", () => {
    for (const sgn of [1, -1] as const)
      for (let i = 0; i < 50; i++) {
        const u = i * 0.0731 + 0.01, v = i * 0.0419 + 0.02;
        assert.ok(Math.abs(dnoise(u, v, sgn, 40, 7, 3) - dnoise(u + 1, v - 2, sgn, 40, 7, 3)) < 1e-9);
      }
    const a = new Float64Array(5), b = new Float64Array(5);
    for (let i = 0; i < 50; i++) {
      const u = i * 0.0731 + 0.01, v = i * 0.0419 + 0.02;
      worley(u, v, 9, 4, a, 13);
      worley(u + 1, v + 1, 9, 4, b, 13);
      assert.ok(Math.abs(a[0] - b[0]) < 1e-9 && a[2] === b[2]);
    }
  });
});

describe("hue shift", () => {
  const rgb = (kind: (typeof PBR_KINDS)[number], opts = {}) => {
    const job = run(kind, false, opts);
    return job.albedo;
  };
  it("tilts red against blue, leaves green alone", () => {
    assert.deepEqual(hueTilt(0), [1, 1, 1]);
    assert.deepEqual(hueTilt(1), [1 + HUE_GAIN, 1, 1 - HUE_GAIN]);
    assert.deepEqual(hueTilt(-1), [1 - HUE_GAIN, 1, 1 + HUE_GAIN]);
  });
  it("recipes without a hue stay exactly grey", () => {
    const a = rgb("fabric");
    for (let i = 0; i < SIZE * SIZE; i++) assert.ok(a[i * 4] === a[i * 4 + 1] && a[i * 4 + 1] === a[i * 4 + 2]);
  });
  for (const kind of PBR_KINDS)
    it(`${kind}: the tint stays within the gain and is neutral on average`, () => {
      const a = rgb(kind);
      let r = 0, b = 0;
      for (let i = 0; i < SIZE * SIZE; i++) {
        const R = a[i * 4], G = a[i * 4 + 1], B = a[i * 4 + 2];
        r += R;
        b += B;
        if (G >= 250) continue; // clamped at white: the tilt can only be smaller there
        assert.ok(R <= G * (1 + HUE_GAIN) + 2 && R >= G * (1 - HUE_GAIN) - 2 && B <= G * (1 + HUE_GAIN) + 2 && B >= G * (1 - HUE_GAIN) - 2, `${kind} pixel ${i}`);
      }
      assert.ok(Math.abs(r / b - 1) < 0.03, `${kind} R/B ${r / b}`);
    });
});

describe("ground recipes", () => {
  const sd = (xs: number[]) => {
    const m = xs.reduce((a, c) => a + c, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, c) => a + (c - m) ** 2, 0) / xs.length);
  };
  const GROUND = ["lawn", "gravel", "soil", "sand", "mulch", "asphalt", "water", "slabs", "paving", "flagstone", "cobble"] as const;

  it("every new kind is deterministic and varies with the seed", () => {
    for (const kind of GROUND) {
      assert.deepEqual(run(kind, true).albedo, run(kind, true).albedo, kind);
      assert.notDeepEqual(run(kind).albedo, run(kind, false, { seed: 5 }).albedo, kind);
    }
  });

  it("stones, pavers, slabs, pebbles, chips and grass differ in hue within one tile", () => {
    for (const kind of ["lawn", "gravel", "mulch", "slabs", "paving", "flagstone", "cobble"] as const) {
      const a = run(kind).albedo, tilt: number[] = [];
      for (let i = 0; i < SIZE * SIZE; i++) {
        const g = a[i * 4 + 1];
        if (g > 30 && g < 245) tilt.push((a[i * 4] - a[i * 4 + 2]) / g);
      }
      assert.ok(sd(tilt) > 0.025, `${kind} tilt spread ${sd(tilt)}`);
    }
  });

  it("slabs, pavers and stones differ in tone from one to the next", () => {
    const blocks = 8, bs = SIZE / blocks;
    for (const kind of ["slabs", "paving", "flagstone", "cobble"] as const) {
      const a = run(kind).albedo, means: number[] = [];
      for (let by = 0; by < blocks; by++)
        for (let bx = 0; bx < blocks; bx++) {
          let s = 0;
          for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) s += grey(a, bx * bs + x, by * bs + y);
          means.push(s / (bs * bs) / 255);
        }
      assert.ok(Math.max(...means) - Math.min(...means) > 0.08, `${kind} block tone range`);
    }
  });

  it("slabs are laid in three rectangular courses of 2-3 slabs each, with joints between", () => {
    const size = 256, job = createTileJob("slabs", size, {});
    while (job.run(1000, () => 0));
    const joint = (x: number, y: number) => job.rough[(y * size + x) * 4] >= 244; // joints are the roughest thing in the tile
    // a row on a course boundary is joint along its whole length; rows inside the courses cross 2-3 vertical joints
    for (const y of [0, Math.round(0.375 * size), Math.round(0.6875 * size)]) {
      let along = 0;
      for (let x = 0; x < size; x++) along += joint(x, y) ? 1 : 0;
      assert.ok(along > size * 0.9, `row ${y} is a course joint (${along})`);
    }
    for (const v of [0.19, 0.53, 0.84]) {
      const y = Math.floor(v * size);
      let runs = 0, prev = false;
      for (let x = 0; x <= size; x++) {
        const j = joint(x % size, y);
        if (j && !prev) runs++;
        prev = j;
      }
      if (joint(0, y) && joint(size - 1, y)) runs--; // one joint that straddles the wrap
      assert.ok(runs >= 2 && runs <= 3, `v ${v}: ${runs} joints`);
    }
  });

  it("water is smooth over most of the tile and has a bright net of caustics", () => {
    const a = run("water", true);
    assert.ok(a.normalDone);
    const g: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i++) g.push(a.albedo[i * 4 + 1] / 255);
    assert.ok(sd(g) < 0.12, "low contrast");
  });

  it("the metres-wide ground kinds stop at 512 px; the laid patterns that are looked at close up do not", () => {
    for (const kind of ["soil", "sand", "asphalt", "water", "lawn", "gravel", "mulch", "slabs"] as const) assert.ok(NOISE_ONLY.includes(kind), kind);
    for (const kind of ["paving", "cobble", "flagstone"] as const) assert.ok(!NOISE_ONLY.includes(kind), kind);
  });
});

describe("outdoor flags", () => {
  // FNV-1a of the bytes: the indoor floor and the plain concrete must stay byte-for-byte what they were before the flags existed
  const fnv = (a: Uint8Array) => {
    let h = 2166136261;
    for (const b of a) h = Math.imul(h ^ b, 16777619) >>> 0;
    return h;
  };
  it("woodfloor and concrete are unchanged without their flag", () => {
    const wood = run("woodfloor", true), concrete = run("concrete", true);
    assert.deepEqual([fnv(wood.albedo), fnv(wood.rough), fnv(wood.normal)], [1820383112, 355654383, 3600021413]);
    assert.deepEqual([fnv(concrete.albedo), fnv(concrete.rough), fnv(concrete.normal)], [674205859, 3716156574, 1840160459]);
    assert.deepEqual(run("woodfloor", true, { weathered: false }).albedo, wood.albedo);
    assert.deepEqual(run("concrete", true, { outdoor: false }).albedo, concrete.albedo);
  });
  it("weathered decking has deep gaps between the boards and varies board to board", () => {
    const size = 256, job = createTileJob("woodfloor", size, { weathered: true });
    while (job.run(1000, () => 0));
    assert.notDeepEqual(job.albedo, run("woodfloor").albedo);
    // the gaps are the darkest pixels by far
    let dark = 0, mid = 0;
    for (let i = 0; i < size * size; i++) {
      const g = job.albedo[i * 4 + 1];
      if (g < 64) dark++;
      else if (g > 120) mid++;
    }
    assert.ok(dark > size * size * 0.01 && dark < size * size * 0.2 && mid > size * size * 0.5, `dark ${dark} mid ${mid}`);
  });
  it("outdoor concrete carries a warm/cool mottling that plain concrete lacks", () => {
    const tiltSpread = (a: Uint8Array) => {
      const bs = SIZE / 8, tilts: number[] = [];
      for (let by = 0; by < 8; by++)
        for (let bx = 0; bx < 8; bx++) {
          let s = 0;
          for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) s += (a[((by * bs + y) * SIZE + bx * bs + x) * 4] - a[((by * bs + y) * SIZE + bx * bs + x) * 4 + 2]) / 255;
          tilts.push(s / (bs * bs));
        }
      return Math.max(...tilts) - Math.min(...tilts);
    };
    assert.equal(tiltSpread(run("concrete").albedo), 0);
    assert.ok(tiltSpread(run("concrete", false, { outdoor: true }).albedo) > 0.02);
  });
});
