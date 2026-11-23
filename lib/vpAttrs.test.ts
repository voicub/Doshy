import assert from "node:assert/strict";
import test from "node:test";
import { parseVpAttrs, SERVER_VP, vpKey } from "./vpAttrs.ts";
import { attrsOf } from "./viewport.ts";

const read = (a: Record<string, string>) => (name: string) => a[name] ?? null;

test("the attributes ViewportClass writes read back to the same screen", () => {
  const v = parseVpAttrs(read(attrsOf({ width: 800, height: 480, coarse: true, kiosk: true })));
  assert.deepEqual(v, { vp: "tiny", orient: "landscape", coarse: true, kiosk: true });
  assert.deepEqual(parseVpAttrs(read(attrsOf({ width: 390, height: 844, coarse: true, kiosk: false }))), { vp: "tiny", orient: "portrait", coarse: true, kiosk: false });
});

test("missing or unknown attributes fall back to the desktop layout", () => {
  assert.deepEqual(parseVpAttrs(() => null), SERVER_VP);
  assert.deepEqual(parseVpAttrs(read({ "data-vp": "huge", "data-orient": "diagonal" })), SERVER_VP);
});

test("the cache key tells every field apart", () => {
  const keys = new Set([SERVER_VP, { ...SERVER_VP, vp: "tiny" as const }, { ...SERVER_VP, orient: "portrait" as const }, { ...SERVER_VP, coarse: true }, { ...SERVER_VP, kiosk: true }].map(vpKey));
  assert.equal(keys.size, 5);
});
