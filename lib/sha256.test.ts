import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sha256Hex } from "./sha256.ts";

const reference = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

test("matches the published digests of the empty input and 'abc'", () => {
  assert.equal(sha256Hex(new Uint8Array()), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("agrees with node's SHA-256 around the padding boundaries and over many blocks", () => {
  // 55, 56, 63, 64, 65 bytes are where the length field spills into one more block
  for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 1000, 100_003]) {
    const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) & 255);
    assert.equal(sha256Hex(data), reference(data), `${n} bytes`);
  }
});
