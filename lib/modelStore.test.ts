import assert from "node:assert/strict";
import { test } from "node:test";
import { fromBase64, toBase64 } from "./modelStore.ts";

test("model bytes survive the trip into an exported plan and back, whatever their size", () => {
  const bytes = new Uint8Array(100_003).map((_, i) => (i * 31 + 7) & 255); // bigger than one encoding chunk, odd length
  const back = new Uint8Array(fromBase64(toBase64(bytes.buffer)));
  assert.equal(back.length, bytes.length);
  assert.ok(back.every((b, i) => b === bytes[i]));
});
