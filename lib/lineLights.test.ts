import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "./catalog.ts";
import { addLampsAlong, lampPreview, MAX_LAMPS } from "./lineLights.ts";
import type { Plan } from "./types.ts";

const empty: Plan = { walls: [], openings: [], rooms: [], items: [] };
const ids = () => {
  let n = 0;
  return () => `i${++n}`;
};
const opts = { level: "L0", face: 1 as const, newId: ids() };
const lamp = { item: "gd_street_classic", spacing: 10 };
const line = (len: number) => [{ x: 0, y: 0 }, { x: len, y: 0 }];

test("lamps stand at both ends with even gaps and share the remainder", () => {
  const out = addLampsAlong(empty, line(25), lamp, { ...opts, newId: ids() });
  assert.deepEqual(out.items.map((i) => i.x), [0, 8.333, 16.667, 25]);
  assert.ok(out.items.every((i) => i.y === 0 && i.kind === "gd_street_classic" && i.level === "L0"));
  assert.equal(out.items[0].w, CATALOG.gd_street_classic.w);
  assert.equal(out.items[0].h, CATALOG.gd_street_classic.h);
});

test("each lamp takes the direction of its own segment, a lamp on a corner the one it arrives on (degrees clockwise in plan view)", () => {
  const bent = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const out = addLampsAlong(empty, bent, { item: "gd_street_modern", spacing: 5, faces: true }, { ...opts, newId: ids() });
  assert.deepEqual(out.items.map((i) => i.rot), [0, 0, 0, 90, 90]);
});

test("face -1 turns a facing lamp round by 180 degrees and leaves a symmetric one alone", () => {
  const modern = { item: "gd_street_modern", spacing: 10, faces: true as const };
  const right = addLampsAlong(empty, line(10), modern, { ...opts, newId: ids() });
  const left = addLampsAlong(empty, line(10), modern, { ...opts, face: -1, newId: ids() });
  assert.deepEqual(right.items.map((i) => i.rot), [0, 0]);
  assert.deepEqual(left.items.map((i) => i.rot), [180, 180]);
  const sym = addLampsAlong(empty, line(10), lamp, { ...opts, face: -1, newId: ids() });
  assert.deepEqual(sym.items.map((i) => i.rot), [0, 0]);
});

test("rot is always within 0..360, whichever way the line runs", () => {
  const back = [{ x: 10, y: 0 }, { x: 0, y: -10 }];
  const out = addLampsAlong(empty, back, { ...lamp, faces: true }, { ...opts, face: -1, newId: ids() });
  assert.ok(out.items.every((i) => i.rot >= 0 && i.rot < 360));
});

test("a span kind puts one item between each pair of stations, turned along the line", () => {
  const span = { item: "gd_festoon_posts_5", spacing: 4.7, span: true as const };
  const out = addLampsAlong(empty, line(14.1), span, { ...opts, newId: ids() });
  assert.deepEqual(out.items.map((i) => i.x), [2.35, 7.05, 11.75]);
  assert.ok(out.items.every((i) => i.rot === 0));
  assert.equal(lampPreview(line(14.1), span).length, 3);
});

test("the preview matches the lamps that are placed", () => {
  const spots = lampPreview(line(25), lamp);
  const out = addLampsAlong(empty, line(25), lamp, { ...opts, newId: ids() });
  assert.deepEqual(spots.map((s) => Math.round(s.x * 1000) / 1000), out.items.map((i) => i.x));
});

test("the level and the linked light go on every lamp, ids are unique", () => {
  const out = addLampsAlong(empty, line(40), lamp, { level: "G", face: 1, entity: "light.drive", newId: ids() });
  assert.ok(out.items.every((i) => i.level === "G" && i.entity === "light.drive"));
  assert.equal(new Set(out.items.map((i) => i.id)).size, out.items.length);
  assert.ok(addLampsAlong(empty, line(40), lamp, { ...opts, newId: ids() }).items.every((i) => !("entity" in i)));
});

test("an unknown kind or a line without two distinct points returns the same plan", () => {
  assert.equal(addLampsAlong(empty, line(10), { item: "nope", spacing: 5 }, opts), empty);
  assert.equal(addLampsAlong(empty, [], lamp, opts), empty);
  assert.equal(addLampsAlong(empty, [{ x: 1, y: 1 }, { x: 1, y: 1 }], lamp, opts), empty);
  assert.deepEqual(lampPreview([{ x: 1, y: 1 }], lamp), []);
});

test("a line shorter than a spacing still gets a lamp at each end, and one lamp per line is never doubled up", () => {
  const out = addLampsAlong(empty, line(2), lamp, { ...opts, newId: ids() });
  assert.deepEqual(out.items.map((i) => i.x), [0, 2]);
  const dup = addLampsAlong(empty, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }], lamp, { ...opts, newId: ids() });
  assert.equal(dup.items.length, 2);
});

test("a very long line is capped", () => {
  const out = addLampsAlong(empty, line(100000), { item: "gd_path_solar", spacing: 1 }, { ...opts, newId: ids() });
  assert.equal(out.items.length, MAX_LAMPS);
});
