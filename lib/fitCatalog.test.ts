import test from "node:test";
import assert from "node:assert/strict";
import { searchPieces, type PieceDef } from "./fitCatalog.ts";

const def = (label: string, w: number, d: number, extra: Partial<PieceDef> = {}): PieceDef => ({ label, w, d, h: 0.8, ...extra });
const catalog: Record<string, PieceDef> = {
  sofa_3: def("Sofa 3-seater", 2.2, 0.9),
  sofa_corner: def("Corner sofa", 2.6, 1.6),
  armchair: def("Armchair", 0.8, 0.85),
  sofa_old: def("Sofa classic", 2, 0.9, { legacy: true }),
  sofa_cushion: def("Sofa cushion", 0.4, 0.4, { h: 0.04 }),
  sofa_lamp: def("Sofa lamp", 0.3, 0.3, { wall: true }),
  ceiling_sofa_light: def("Sofa light", 0.3, 0.3),
  sofa_pillar: def("Sofa pillar", 0.3, 0.3, { pillar: true }),
  bed: def("Double bed", 1.6, 2),
};

test("a few matches come back with their size, best first: starts with the words, then a word starts with them", () => {
  const r = searchPieces(catalog, "sofa");
  assert.deepEqual(r.map((p) => p.kind), ["sofa_3", "sofa_corner"]);
  assert.deepEqual(r[0], { kind: "sofa_3", label: "Sofa 3-seater", w: 2.2, d: 0.9 });
});

test("only pieces that stand on the floor are offered", () => {
  const kinds = searchPieces(catalog, "sofa").map((p) => p.kind);
  for (const gone of ["sofa_old", "sofa_cushion", "sofa_lamp", "ceiling_sofa_light", "sofa_pillar"]) assert.ok(!kinds.includes(gone), gone);
});

test("every typed word must match, in any order, any case", () => {
  assert.deepEqual(searchPieces(catalog, "SOFA corner").map((p) => p.kind), ["sofa_corner"]);
  assert.deepEqual(searchPieces(catalog, "bed double").map((p) => p.kind), ["bed"]);
  assert.deepEqual(searchPieces(catalog, "sofa bed"), []);
});

test("nothing typed finds nothing, and the list is cut at the limit", () => {
  assert.deepEqual(searchPieces(catalog, "   "), []);
  assert.equal(searchPieces({ ...catalog, a: def("Sofa a", 1, 1), b: def("Sofa b", 1, 1) }, "sofa", 3).length, 3);
});

test("a match inside a word ranks below one at the start of a word", () => {
  const r = searchPieces({ x: def("Bookcase", 1, 0.3), y: def("Low case", 1, 0.3) }, "case");
  assert.deepEqual(r.map((p) => p.kind), ["y", "x"]);
});
