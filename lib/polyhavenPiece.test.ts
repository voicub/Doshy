import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanPiece } from "./customCatalog.ts";
import { buildPack, parsePack } from "./pieceShare.ts";
import { packTag, planImport } from "./pieceShareMerge.ts";
import { HEAVY_TRIANGLES } from "./polyhaven.ts";
import { creditsOf, isHeavy, modelDetail, packCredit, packOf, phPieceName, sizeText, sourceOf, tagsOf } from "./polyhavenPiece.ts";

const item = { id: "ArmChair_01", name: "Arm Chair 01", authors: ["Jane", "Joe"], cats: ["furniture", "seating"], tags: ["chair", "furniture"] };
const piece = () =>
  cleanPiece({ kind: "my_chair_aaaa", name: "Arm Chair 01", w: 0.85, d: 0.77, h: 1.07, model: { id: "m_x", ext: "glb", bytes: 12 }, source: sourceOf(item), pack: packOf(item, "m_pk", 9), tags: tagsOf(item), at: 5 })!;

test("size text is width x depth x height in whole centimetres, and absent without a box", () => {
  assert.equal(sizeText([0.85, 0.77, 1.07]), "85 x 77 x 107 cm");
  assert.equal(sizeText([0.85, 0.77]), null);
  assert.equal(sizeText(undefined), null);
});

test("only a model above the triangle budget is heavy, and only then is the detail a warning", () => {
  assert.equal(isHeavy({ polycount: HEAVY_TRIANGLES }), false);
  assert.equal(isHeavy({ polycount: HEAVY_TRIANGLES + 1 }), true);
  assert.equal(modelDetail({ dims: [1, 1, 1], polycount: 5000 })?.warn, undefined);
  assert.match(modelDetail({ dims: [1, 1, 1], polycount: 5000 })?.text ?? "", /100 x 100 x 100 cm/);
  const heavy = modelDetail({ dims: [1, 1, 1], polycount: 200_000 });
  assert.equal(heavy?.warn, true);
  assert.match(heavy?.text ?? "", /200,000/);
  assert.equal(modelDetail({}), null);
});

test("the piece name is clean and at most 40 characters", () => {
  assert.equal(phPieceName({ id: "a", name: `  <b>${"x".repeat(60)}</b> ` }).length <= 40, true);
  assert.equal(phPieceName({ id: "Arm_Chair-01", name: "" }), "Arm Chair 01");
});

test("source and pack carry the asset, authors and CC0 licence; the source survives cleaning, a bad id does not", () => {
  const p = piece();
  assert.deepEqual(p.source, { type: "polyhaven", id: "ArmChair_01", name: "Arm Chair 01", authors: "Jane, Joe" });
  assert.deepEqual(p.pack, { id: "m_pk", name: "Poly Haven: Arm Chair 01", author: "Jane, Joe", licence: "CC0 (Poly Haven)", at: 9 });
  assert.equal(p.tags, "furniture seating chair");
  assert.equal(cleanPiece({ ...p, source: { type: "polyhaven", id: "../x" } })?.source, undefined);
  assert.equal(cleanPiece({ ...p, source: { type: "other", id: "ok" } })?.source, undefined);
});

test("credits list each asset once", () => {
  assert.equal(creditsOf([piece(), { ...piece(), kind: "my_chair_bbbb" }, { source: undefined }]).length, 1);
});

test("export credit fills empty boxes for Poly Haven pieces and never overwrites typed text", () => {
  const typed = { author: "", licence: "" };
  assert.deepEqual(packCredit([piece()], typed), { author: "Poly Haven asset authors", licence: "CC0 (Poly Haven)" });
  assert.deepEqual(packCredit([piece()], { author: "Ada", licence: "mine" }), { author: "Ada", licence: "mine" });
  assert.deepEqual(packCredit([{}], typed), typed);
});

test("a Poly Haven piece keeps its source and tags through a pack file, gets the importing device's own pack tag, and the header carries the credit", () => {
  const p = piece();
  const made = buildPack({ name: "Chairs", ...packCredit([p], { author: "", licence: "" }) }, [p], [{ id: "m_x", ext: "glb", b64: Buffer.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]).toString("base64") }], 1);
  assert.ok(made.ok);
  const read = parsePack(made.ok ? made.text : "");
  assert.ok(read.ok);
  if (!read.ok) return;
  assert.deepEqual([read.info.author, read.info.licence], ["Poly Haven asset authors", "CC0 (Poly Haven)"]);
  assert.deepEqual(read.warnings, []);
  const added = planImport([], read.pack.pieces, "both", { tag: packTag(read.info, 2, () => "t1"), models: read.pack.models }).add[0];
  assert.deepEqual(added.source, p.source);
  assert.equal(added.tags, p.tags);
  assert.equal(added.pack?.id, "pk_t1"); // the file cannot claim "m_pk"
  assert.equal(added.pack?.licence, "CC0 (Poly Haven)");
});
