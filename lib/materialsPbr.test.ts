import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLAT_ROUGH, MAT_CLASSES, PBR_KINDS, PBR_TILE_M, bevelRadius, cylinderPoints, geometryKey, guessClass, lathePoints, resolveMat } from "./materialsPbr.ts";

describe("material classes", () => {
  it("guesses wood for warm browns, paint for near-white, plastic otherwise", () => {
    assert.equal(guessClass("#c9a26b"), "wood");
    assert.equal(guessClass("#3b2f2a"), "wood");
    assert.equal(guessClass("#f2f1ee"), "paint");
    assert.equal(guessClass("#8d9299"), "plastic");
    assert.equal(guessClass("nonsense"), "plastic");
  });

  it("keeps today's flat look at texture level 0 and the class values above it", () => {
    assert.deepEqual(resolveMat({ c: "#b8bcc2", tex: "metal", metal: 0.9 }, 0), { cls: "metal", rough: FLAT_ROUGH, metal: 0, sheen: 0, clearcoat: 0, textured: false });
    assert.equal(resolveMat({ c: "#fff", tex: "metal" }, 1).metal, MAT_CLASSES.metal.metal);
    assert.equal(resolveMat({ c: "#fff", tex: "wood", rough: 0.2 }, 2).rough, 0.2);
    assert.equal(resolveMat({ c: "#fff", tex: "fabric" }, 2).sheen, MAT_CLASSES.fabric.sheen);
  });

  it("has a tile size for every kind", () => {
    for (const k of PBR_KINDS) assert.ok(PBR_TILE_M[k] > 0, k);
  });
});

describe("bevelRadius", () => {
  it("is sharp without bevel segments, for flat parts and for bevel 0", () => {
    assert.equal(bevelRadius([1, 1, 1], undefined, 0, false), 0);
    assert.equal(bevelRadius([1, 1, 1], undefined, 2, true), 0);
    assert.equal(bevelRadius([1, 1, 1], 0, 2, false), 0);
  });
  it("rounds automatically by a share of the thinnest side, capped, and skips tiny parts", () => {
    assert.equal(bevelRadius([2, 1, 0.1], undefined, 2, false), 0.1 * 0.2);
    assert.equal(bevelRadius([2, 2, 2], undefined, 2, false), 0.04);
    assert.equal(bevelRadius([2, 2, 0.01], undefined, 2, false), 0);
  });
  it("honours an explicit radius but never lets two bevels meet", () => {
    assert.equal(bevelRadius([1, 1, 1], 0.05, 1, false), 0.05);
    assert.ok(bevelRadius([1, 1, 0.1], 0.5, 1, false) < 0.05);
  });
});

describe("lathe profiles", () => {
  it("fits the widest radius to s[0]/2, the height to s[1], centres on y = 0 and closes to the axis", () => {
    const pts = lathePoints([[0.1, 0], [0.2, 0.5], [0.1, 1]], [0.6, 2, 0.6]);
    assert.deepEqual(pts[0], [0, -1]);
    assert.equal(Math.max(...pts.map((p) => p[0])), 0.3);
    assert.equal(Math.min(...pts.map((p) => p[1])), -1);
    assert.equal(Math.max(...pts.map((p) => p[1])), 1);
    assert.deepEqual(pts[pts.length - 1], [0, 1]);
  });
  it("returns nothing for a profile with fewer than two points", () => {
    assert.deepEqual(lathePoints([[0.1, 0]], [1, 1, 1]), []);
  });
  it("builds a rounded cylinder profile inside its bounds", () => {
    const pts = cylinderPoints(0.2, 0.4, 0.03, 2);
    assert.equal(pts.length, 2 + 6);
    for (const [r, y] of pts) {
      assert.ok(r >= 0 && r <= 0.2 + 1e-9);
      assert.ok(Math.abs(y) <= 0.2 + 1e-9);
    }
  });
});

describe("geometryKey", () => {
  const p = { s: [1, 2, 3] as [number, number, number] };
  it("equal shapes share a key, different rounding, size or seed do not", () => {
    assert.equal(geometryKey(p, 0.02, 2, null), geometryKey({ ...p }, 0.02, 2, null));
    assert.notEqual(geometryKey(p, 0.02, 2, null), geometryKey(p, 0.03, 2, null));
    assert.notEqual(geometryKey(p, 0, 0, 1), geometryKey(p, 0, 0, 2));
    assert.notEqual(geometryKey(p, 0, 0, null), geometryKey({ s: [1, 2, 3.5] }, 0, 0, null));
  });
});
