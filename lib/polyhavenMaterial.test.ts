import assert from "node:assert/strict";
import { test } from "node:test";
import { packMaterial, readMaterial } from "./polyhavenMaterial.ts";

const jpeg = (n: number, seed: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: n }, (_, i) => (i * 7 + seed) & 255)]);
const info = { asset: "rock_boulder_dry", name: "Rock Boulder Dry", authors: ["Rob Tuytel"], scaleM: 2 };

test("a material file gives back the same pictures and details", () => {
  const maps = { diff: jpeg(100, 1), rough: jpeg(60, 2), nor: jpeg(80, 3) };
  const back = readMaterial(packMaterial(info, maps, 1e6));
  assert.ok(back);
  assert.deepEqual(back.info, info);
  assert.deepEqual([...back.maps.diff], [...maps.diff]);
  assert.deepEqual([...(back.maps.rough ?? [])], [...maps.rough]);
  assert.deepEqual([...(back.maps.nor ?? [])], [...maps.nor]);
});

test("the roughness and normal pictures are optional, the colour is not", () => {
  const only = readMaterial(packMaterial(info, { diff: jpeg(20, 1) }, 1e6));
  assert.ok(only && !only.maps.rough && !only.maps.nor);
  assert.equal(readMaterial(new TextEncoder().encode("DMAT\u0002\u0000\u0000\u0000{}")), null);
});

test("anything that is not a whole, honest material file is refused", () => {
  const good = packMaterial(info, { diff: jpeg(100, 1), nor: jpeg(50, 2) }, 1e6);
  assert.equal(readMaterial(good.subarray(0, good.length - 10)), null); // cut short
  assert.equal(readMaterial(Uint8Array.from(good, (b, i) => (i === 0 ? 0x58 : b))), null); // wrong signature
  assert.equal(readMaterial(new Uint8Array(64)), null);
  assert.throws(() => packMaterial(info, { diff: new Uint8Array([1, 2, 3, 4, 5]) }, 1e6), /JPEG/); // not a picture
  assert.throws(() => packMaterial(info, { diff: jpeg(5000, 1) }, 1000), /too big/);
  const swapped = packMaterial(info, { diff: jpeg(100, 1) }, 1e6);
  swapped[swapped.length - 104] = 0; // the picture is the last 104 bytes: damage its own first byte (the JPEG signature)
  assert.equal(readMaterial(swapped), null);
});

test("text in the header is cleaned when it is read", () => {
  const dirty = packMaterial({ ...info, name: "<script>x</script>", authors: ['a"b'] }, { diff: jpeg(10, 1) }, 1e6);
  const back = readMaterial(dirty);
  assert.ok(back);
  assert.doesNotMatch(back.info.name, /[<>]/);
  assert.doesNotMatch(back.info.authors.join(), /"/);
});
