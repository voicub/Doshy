import assert from "node:assert/strict";
import { test } from "node:test";
import type { Def, Part } from "./catalog.ts";
import {
  cleanName,
  cleanPiece,
  draftFromDef,
  fitParts,
  kindLabel,
  lockedSize,
  missingKinds,
  newKind,
  parseBundle,
  piecesUsedBy,
  pieceFromParts,
  resizeItems,
  startSize,
  syncCatalog,
  type CustomPiece,
} from "./customCatalog.ts";

const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c = "#aabbcc"): Part => ({ p: [x, y, z], s: [sx, sy, sz], c });
const item = (kind: string, w = 1, d = 1, h = 1) => ({ kind, w, d, h });
const table = (): CustomPiece => pieceFromParts({ name: "Side table", parts: [box(5, 0.3, 5, 0.6, 0.6, 0.6), { ...box(5, 0.65, 5, 0.5, 0.1, 0.5), shape: "cyl" as const }] }, "my_side-table_ab12", 1)!;

test("names are plain text, bounded, never empty", () => {
  assert.equal(cleanName("  <img src=x>  Big\n\tsofa "), "img src=x Big sofa");
  assert.equal(cleanName("\u0000\u0001"), "My piece");
  assert.equal(cleanName("x".repeat(200)).length, 40);
});

test("kinds are unique-looking and their name survives as a label", () => {
  const k = newKind("Sofa nook!", () => "a1b2");
  assert.equal(k, "my_sofa-nook_a1b2");
  assert.equal(kindLabel(k), "Sofa nook");
});

test("fitParts moves shapes to the footprint centre, onto the floor, and measures them", () => {
  const f = fitParts([box(5, 3, -2, 1, 0.5, 2), box(7, 4, -2, 1, 1, 2)])!;
  assert.deepEqual([f.w, f.d, f.h], [3, 2, 1.75]);
  assert.deepEqual(f.parts[0].p, [-1, 0.25, 0]);
  assert.deepEqual(f.parts[1].p, [1, 1.25, 0]);
  assert.equal(fitParts([]), null);
});

test("a tilted part counts with its tilt", () => {
  const f = fitParts([{ ...box(0, 0.5, 0, 1, 1, 1), r: [0, Math.PI / 4, 0] }])!;
  assert.ok(Math.abs(f.w - Math.SQRT2) < 0.002);
});

test("cleanPiece refuses foreign kinds and repairs junk", () => {
  assert.equal(cleanPiece({ kind: "sofa", name: "x", parts: [box(0, 0, 0, 1, 1, 1)] }), null);
  assert.equal(cleanPiece({ kind: "my_a_b", name: "x", parts: [] }), null);
  const p = cleanPiece({ kind: "my_a_b", name: "<b>x</b>", parts: [{ p: [0, 0, 0], s: [1, 1, 1], c: "javascript:alert(1)", shape: "evil" }] })!;
  assert.equal(p.name, "b x /b", "markup brackets are stripped");
  assert.equal(p.parts[0].c, "#c9a26b");
  assert.equal(p.parts[0].shape, undefined);
});

test("model pieces keep their size and get a stand-in box; bad thumbnails are dropped", () => {
  const raw = { kind: "my_vase_zz99", name: "Vase", w: 0.3, d: 0.3, h: 0.5, model: { id: "m_abc", ext: "glb", bytes: 10 }, thumb: "http://evil/x.png" };
  const p = cleanPiece(raw)!;
  assert.deepEqual([p.w, p.d, p.h], [0.3, 0.3, 0.5]);
  assert.equal(p.parts.length, 1);
  assert.equal(p.thumb, undefined);
  assert.ok(cleanPiece({ ...raw, thumb: "data:image/jpeg;base64,AAAA" })!.thumb);
});

test("syncCatalog registers pieces, drops removed ones and stands in for pieces the device lacks", () => {
  const cat: Record<string, Def> = {};
  const t = table();
  syncCatalog(cat, [t], [item("my_gone_0000", 2, 1, 0.8)]);
  assert.equal(cat[t.kind].label, "Side table");
  const ph = cat["my_gone_0000"];
  assert.equal(ph.model?.missing, true);
  assert.deepEqual([ph.w, ph.d, ph.h], [2, 1, 0.8]);
  const again = cat["my_gone_0000"];
  syncCatalog(cat, [t], [item("my_gone_0000", 2, 1, 0.8)]);
  assert.equal(cat["my_gone_0000"], again, "stand-ins keep their identity");
  // the real piece arrives: the stand-in is replaced; the plan stops using a kind: its stand-in goes away
  const real = { ...t, kind: "my_gone_0000" };
  syncCatalog(cat, [real], [item("my_gone_0000")]);
  assert.equal(cat["my_gone_0000"].model, undefined);
  syncCatalog(cat, [], []);
  assert.deepEqual(Object.keys(cat), []);
});

test("syncCatalog never touches built-in kinds", () => {
  const cat = { sofa: { label: "Sofa" } as Def };
  syncCatalog(cat, [], [item("sofa")]);
  assert.deepEqual(Object.keys(cat), ["sofa"]);
});

test("a plan's pieces survive an export/import round trip", () => {
  const t = table();
  const used = piecesUsedBy([t, { ...t, kind: "my_unused_1111" }], [item(t.kind)]);
  assert.deepEqual(used.map((p) => p.kind), [t.kind]);
  const wire = JSON.parse(JSON.stringify({ pieces: used, models: [{ id: "m_abc", ext: "glb", b64: "AAAA" }] }));
  const back = parseBundle(wire);
  assert.deepEqual(back.pieces, used);
  assert.deepEqual(back.models, [{ id: "m_abc", ext: "glb", b64: "AAAA" }]);
  assert.deepEqual(missingKinds([], [item(t.kind), item("sofa")]), [t.kind]);
  assert.deepEqual(missingKinds(back.pieces, [item(t.kind)]), []);
});

test("parseBundle drops anything that does not check out", () => {
  assert.deepEqual(parseBundle(undefined), { pieces: [], models: [] });
  const b = parseBundle({ pieces: [null, 3, { kind: "sofa" }], models: [{ id: "../../etc", b64: "x" }, { id: "ok", b64: 5 }] });
  assert.deepEqual(b, { pieces: [], models: [] });
});

test("duplicate and tweak copies a catalog piece without sharing its shapes", () => {
  const def: Def = { label: "Chair", brand: "IKEA", cat: "Living", w: 1, d: 1, h: 1, parts: [{ ...box(0, 0.5, 0, 1, 1, 1), r: [0, 1, 0] }] };
  const d = draftFromDef(def);
  assert.equal(d.name, "Chair copy");
  d.parts[0].p[1] = 99;
  d.parts[0].r![1] = 5;
  assert.equal(def.parts[0].p[1], 0.5);
  assert.equal(def.parts[0].r![1], 1);
});

test("resizing a piece moves items still at the old size, leaves hand-sized ones alone", () => {
  const items = [item("my_a_1", 1, 1, 1), item("my_a_1", 2, 1, 1), item("sofa", 1, 1, 1)];
  const out = resizeItems(items, "my_a_1", { w: 1, d: 1, h: 1 }, { w: 3, d: 3, h: 3 });
  assert.deepEqual(out.map((i) => i.w), [3, 2, 1]);
});

test("imported model size: native metres, or 1 m on the longest side when absurd; locked ratio follows the edited side", () => {
  assert.deepEqual(startSize({ x: 0.5, y: 1, z: 0.25 }), { w: 0.5, d: 0.25, h: 1 });
  assert.deepEqual(startSize({ x: 100, y: 200, z: 50 }), { w: 0.5, d: 0.25, h: 1 });
  assert.deepEqual(lockedSize({ w: 1, d: 0.5, h: 2 }, "h", 1), { w: 0.5, d: 0.25, h: 1 });
});
