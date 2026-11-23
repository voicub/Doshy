import assert from "node:assert/strict";
import test from "node:test";
import { DEVICE_KEYS, MAGIC, encodeHead, fileName, parseHead } from "./everything.ts";

const join = (a: Uint8Array, b: Uint8Array) => Uint8Array.from([...a, ...b]);
const db = Uint8Array.from({ length: 100 }, (_, i) => i);

test("a file round-trips: header, device settings and the position of the database", () => {
  const head = encodeHead(1_700_000_000_000, db.length, { "housey-layout": "compact", "housey-quality": '{"state":{"tier":"eco"}}', "housey-plan": "must not travel", "housey-db-pending": "x" });
  const file = join(head, db);
  const p = parseHead(file, file.length);
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.header.createdAt, 1_700_000_000_000);
  assert.deepEqual(p.header.device, { "housey-layout": "compact", "housey-quality": '{"state":{"tier":"eco"}}' }, "only the listed device settings are kept");
  assert.deepEqual([...file.subarray(p.dbStart)], [...db]);
});

test("a file that is not ours, damaged, truncated or newer is refused with a sentence", () => {
  const head = encodeHead(1, db.length, {});
  const file = join(head, db);
  assert.match((parseHead(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), 15) as { error: string }).error, /not a Doshy/);
  assert.match((parseHead(file.subarray(0, file.length - 5), file.length - 5) as { error: string }).error, /incomplete/);
  assert.match((parseHead(file, file.length + 7) as { error: string }).error, /incomplete/);
  const huge = new Uint8Array(file);
  new DataView(huge.buffer).setUint32(MAGIC.length, 0x7fffffff);
  assert.match((parseHead(huge, huge.length) as { error: string }).error, /damaged/);
  const newer = new TextEncoder().encode(JSON.stringify({ format: 2, app: "housey", dbBytes: 1, device: {} }));
  const nf = new Uint8Array(MAGIC.length + 4 + newer.length + 1);
  nf.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(nf.buffer).setUint32(MAGIC.length, newer.length);
  nf.set(newer, MAGIC.length + 4);
  assert.match((parseHead(nf, nf.length) as { error: string }).error, /newer version/);
});

test("oversized device values and unknown keys are dropped", () => {
  const head = encodeHead(1, 1, { "housey-layout": "x".repeat(70_000), "housey-display": "ok", "other": "nope" });
  const p = parseHead(join(head, Uint8Array.of(1)), head.length + 1);
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(Object.keys(p.header.device), ["housey-display"]);
  assert.ok(DEVICE_KEYS.every((k) => k.startsWith("housey-")));
});

test("the file name carries the local date", () => {
  assert.equal(fileName(new Date(2026, 10, 22)), "doshy-everything-2026-11-22.housey");
});
