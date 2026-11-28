import assert from "node:assert/strict";
import { test } from "node:test";
import type { Part } from "./catalog.ts";
import { cleanPiece, MAX_MODEL_BYTES, pieceFromParts, type BundleModel, type CustomPiece } from "./customCatalog.ts";
import { PACK_LIMITS, base64Bytes, buildPack, estimatePackBytes, exportProblem, packFileName, packFileProblem, parsePack, type Pack } from "./pieceShare.ts";
import { findConflicts, packGroups, packTag, planImport, type ModelState } from "./pieceShareMerge.ts";

const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number): Part => ({ p: [x, y, z], s: [sx, sy, sz], c: "#aabbcc" });
const built = (name: string, kind: string): CustomPiece => pieceFromParts({ name, parts: [box(0, 0.3, 0, 0.6, 0.6, 0.6), { ...box(0, 0.65, 0, 0.5, 0.1, 0.5), shape: "cyl" as const }] }, kind, 5)!;
const GLB = Buffer.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]).toString("base64"); // "glTF" + version 2 + length 12
const modelPiece = (name: string, kind: string, id: string): CustomPiece =>
  cleanPiece({ kind, name, w: 1, d: 0.5, h: 0.8, model: { id, ext: "glb", bytes: 12 }, at: 7 })!;
const glb = (id: string): BundleModel => ({ id, ext: "glb", b64: GLB });
const tag = packTag({ name: "Pack" }, 1000, () => "t1");
const opts = (models: BundleModel[] = [], stored?: Map<string, ModelState>) => {
  let n = 0;
  return { tag, models, stored, rand: () => `r${++n}` };
};

/** A pack file as text, with the given top-level fields over a valid base. */
const file = (over: Record<string, unknown> = {}) => JSON.stringify({ format: "doshypack", version: 1, name: "Pack", pieces: [built("Stool", "my_stool_aaaa")], ...over });
const refused = (text: string) => {
  const r = parsePack(text);
  assert.equal(r.ok, false);
  return r.ok ? "" : r.reason;
};

test("a pack survives export, parse and import into an empty My pieces, models included", () => {
  const pieces = [built("Stool", "my_stool_aaaa"), modelPiece("Lamp", "my_lamp_bbbb", "m_lamp")];
  const made = buildPack({ name: "My <b>set</b>", author: "Ada", licence: "CC BY 4.0" }, pieces, [glb("m_lamp"), glb("m_unused")], Date.UTC(2026, 0, 2));
  assert.ok(made.ok);
  const read = parsePack(made.ok ? made.text : "");
  assert.ok(read.ok);
  if (!read.ok) return;
  assert.deepEqual(read.warnings, []);
  assert.equal(read.info.name, "My b set /b");
  assert.deepEqual([read.info.author, read.info.licence, read.info.created], ["Ada", "CC BY 4.0", "2026-01-02T00:00:00.000Z"]);
  assert.deepEqual([read.info.pieces, read.info.modelPieces, read.info.modelBytes], [2, 1, 12]);
  assert.deepEqual(read.pack.models.map((m) => m.id), ["m_lamp"]); // only the model a chosen piece uses travels
  const plan = planImport([], read.pack.pieces, "both", opts(read.pack.models));
  assert.deepEqual(plan.add.map((p) => [p.kind, p.name, p.pack?.id]), [["my_stool_aaaa", "Stool", "pk_t1"], ["my_lamp_bbbb", "Lamp", "pk_t1"]]);
  assert.deepEqual(plan.models, [glb("m_lamp")]);
  assert.deepEqual(plan.add[0].parts, pieces[0].parts);
});

test("a hand-written, real-shaped file is read and unknown fields are dropped and counted", () => {
  const text = JSON.stringify(
    {
      format: "doshypack",
      version: 1,
      name: "  Nordic   shelf set ",
      author: "Sam",
      created: "2026-03-04",
      app: "Doshy",
      extra: { anything: 1 },
      pieces: [{ kind: "my_shelf_ab12", name: "Shelf", w: 0.8, d: 0.3, h: 1.8, at: 5, secret: "x", parts: [{ p: [0, 0.9, 0], s: [0.8, 1.8, 0.3], c: "#ccaa88", junk: true }] }],
    },
    null,
    2,
  );
  const r = parsePack(text);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.pack.name, "Nordic shelf set");
  assert.equal(r.pack.created, "2026-03-04T00:00:00.000Z");
  assert.equal(r.pack.pieces[0].kind, "my_shelf_ab12");
  assert.equal("secret" in r.pack.pieces[0], false);
  assert.equal(r.warnings.length, 1); // extra + secret
  assert.match(r.warnings[0], /^2 unknown details/);
});

test("files that are not packs, or from another version, are refused with a reason", () => {
  for (const bad of ["", "not json", "[]", "null", "42", file({ format: "other" }), file({ version: 0 }), file({ version: "1" }), file({ pieces: "x" }), file({ pieces: [] }), file({ models: {} })]) {
    assert.match(refused(bad), /\w/);
  }
  assert.match(refused(file({ version: 2 })), /newer version/);
  assert.match(refused(file({ pieces: [{ kind: "nope", name: "x" }, 5, null] })), /no pieces/);
});

test("size caps: file bytes are checked from File.size before reading, piece and model counts after", () => {
  assert.ok(packFileProblem(PACK_LIMITS.fileBytes + 1));
  assert.equal(packFileProblem(PACK_LIMITS.fileBytes), null);
  assert.match(refused(" ".repeat(PACK_LIMITS.fileBytes + 1)), /too big/);
  const many = Array.from({ length: PACK_LIMITS.pieces + 1 }, (_, i) => built("P", `my_p_${i}`));
  assert.match(refused(file({ pieces: many })), /at most 200/);
  assert.match(refused(file({ models: Array.from({ length: PACK_LIMITS.models + 1 }, (_, i) => glb(`m${i}`)) })), /model files/);
});

test("a hundred thousand pieces, or half a million empty objects, are refused without being walked", () => {
  assert.match(refused(file({ pieces: Array.from({ length: 100_000 }, () => ({})) })), /at most 200/);
  assert.match(refused(file({ pieces: Array.from({ length: 500_000 }, () => ({})) })), /complicated/);
});

test("forbidden keys are refused wherever they sit, and nothing is polluted", () => {
  const stool = JSON.stringify(built("Stool", "my_stool_aaaa"));
  const part = JSON.stringify(built("Stool", "my_stool_aaaa").parts[0]);
  // written as text: JSON.stringify would drop a literal __proto__ key, JSON.parse keeps it as an own key
  const sites = [
    `{"format":"doshypack","version":1,"__proto__":{"x":1},"pieces":[${stool}]}`,
    `{"format":"doshypack","version":1,"pieces":[{"constructor":{"prototype":{"x":1}},${stool.slice(1)}]}`,
    `{"format":"doshypack","version":1,"pieces":[{"kind":"my_a_aaaa","name":"A","parts":[{${part.slice(1, -1)},"spin":{"axis":"y","rpm":1,"prototype":{}}}]}]}`,
    `{"format":"doshypack","version":1,"pieces":[${stool}],"models":[{"id":"a","ext":"glb","b64":"${GLB}","__proto__":1}]}`,
    `{"format":"doshypack","version":1,"pieces":[${stool}],"extra":[[[{"__proto__":{"polluted":true}}]]]}`,
    `{"format":"doshypack","version":1,"pieces":[${stool}],"extra":{"a":{"b":{"c":{"constructor":1}}}}}`,
  ];
  for (const s of sites) assert.match(refused(s), /does not look like a furniture pack/);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(({} as Record<string, unknown>).x, undefined);
});

test("deep nesting and giant text are refused", () => {
  const deep = (n: number) => "[".repeat(n) + "]".repeat(n);
  assert.match(refused(`{"format":"doshypack","version":1,"pieces":[],"x":${deep(30)}}`), /complicated/);
  assert.match(refused(`{"format":"doshypack","version":1,"pieces":[],"x":${deep(200_000)}}`), /\w/); // may fail in JSON.parse itself: still one plain message, no crash
  const long = built("Stool", "my_stool_aaaa");
  assert.match(refused(file({ name: "x".repeat(5000) })), /too long/);
  assert.match(refused(file({ pieces: [{ ...long, name: "y".repeat(3_000_000) }] })), /too long/);
});

test("model files: bad base64, wrong magic and oversized ones are dropped with their pieces, the rest still imports", () => {
  const huge = "A".repeat((MAX_MODEL_BYTES / 3 + 10) * 4);
  const pieces = [built("Stool", "my_stool_aaaa"), modelPiece("A", "my_a_aaaa", "ma"), modelPiece("B", "my_b_bbbb", "mb"), modelPiece("C", "my_c_cccc", "mc"), modelPiece("D", "my_d_dddd", "md")];
  const models = [
    { id: "ma", ext: "glb", b64: "not base64!!" },
    { id: "mb", ext: "glb", b64: Buffer.from("PNG not a glb........").toString("base64") },
    { id: "mc", ext: "glb", b64: huge },
    { id: "md", ext: "glb", b64: GLB.slice(1) }, // length not a multiple of 4
  ];
  const r = parsePack(file({ pieces, models }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.pack.pieces.map((p) => p.kind), ["my_stool_aaaa"]);
  assert.equal(r.pack.models.length, 0);
  assert.ok(r.warnings.some((w) => /4 pieces left out/.test(w)));
  assert.ok(r.warnings.some((w) => /4 model files could not be used/.test(w)));
});

test("all models together are capped, and a gltf (json) model is accepted", () => {
  const big = "A".repeat(Math.floor(MAX_MODEL_BYTES / 3) * 4);
  const ids = ["m1", "m2"];
  const sum = ids.map((id) => ({ id, ext: "glb", b64: "Z2xUR" + big.slice(5) }));
  assert.match(refused(file({ models: sum })), /add up to/);
  const gltf = { id: "mg", ext: "gltf", b64: Buffer.from('{"asset":{"version":"2.0"}}').toString("base64") };
  const r = parsePack(file({ pieces: [modelPiece("G", "my_g_gggg", "mg")], models: [gltf] }));
  assert.ok(r.ok && r.pack.models[0].ext === "gltf");
});

test("model/piece mismatches: a missing file drops the piece, an unused file is not imported, duplicates and the same kind twice are noted", () => {
  const r = parsePack(file({ pieces: [modelPiece("A", "my_a_aaaa", "gone"), built("S", "my_s_ssss"), built("S2", "my_s_ssss")], models: [glb("spare"), glb("spare")] }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.pack.pieces.map((p) => p.name), ["S"]);
  assert.deepEqual(r.pack.models, []);
  assert.equal(r.warnings.length, 3);
});

test("pack tags in a file are ignored: only this device makes them", () => {
  const sneaky = { ...built("S", "my_s_ssss"), pack: { id: "pk_evil", name: "x", at: 1 } };
  const r = parsePack(file({ pieces: [sneaky] }));
  assert.ok(r.ok && r.pack.pieces[0].pack === undefined);
});

test("names and headers are plain text whatever the file holds", () => {
  const r = parsePack(file({ name: "<script>alert(1)</script>\u0000Set", author: "A\u0007\nB", licence: "`x` \"y\"", app: 5, pieces: [{ ...built("S", "my_s_ssss"), name: "<img src=x onerror=1>\u0001Chair" }] }));
  assert.ok(r.ok);
  if (!r.ok) return;
  for (const t of [r.pack.name, r.pack.author, r.pack.licence, r.pack.pieces[0].name]) assert.doesNotMatch(t ?? "", /[<>`"\\\u0000-\u001f]/);
  assert.equal(r.pack.app, undefined); // not text: dropped
});

test("base64Bytes reads the size from the length", () => {
  assert.equal(base64Bytes(GLB), 12);
  assert.equal(base64Bytes(Buffer.from("ab").toString("base64")), 2);
  assert.equal(base64Bytes("abc"), null);
  assert.equal(base64Bytes(""), null);
});

// ---- merging -------------------------------------------------------------------------------------------------------------------

const mine = [built("Sofa", "my_sofa_1111"), built("Table", "my_table_2222")];

test("a clash is the same id or the same name in any case; each choice does what it says", () => {
  const incoming = [built("sofa", "my_other_9999"), built("Chair", "my_table_2222"), built("Lamp", "my_lamp_3333")];
  assert.deepEqual(findConflicts(mine, incoming).map((c) => [c.piece.name, c.by]), [["sofa", "name"], ["Chair", "kind"]]);

  const both = planImport(mine, incoming, "both", opts());
  assert.deepEqual(both.add.map((p) => p.name), ["sofa (2)", "Chair (2)", "Lamp"]);
  assert.equal(both.add[0].kind, "my_other_9999"); // free id stays
  assert.notEqual(both.add[1].kind, "my_table_2222");
  assert.match(both.add[1].kind, /^my_chair_/);
  assert.deepEqual(both.replace, []);

  const replace = planImport(mine, incoming, "replace", opts());
  assert.deepEqual(replace.replace.map((p) => [p.kind, p.name]), [["my_sofa_1111", "sofa"], ["my_table_2222", "Chair"]]); // my ids kept: placed items follow
  assert.deepEqual(replace.add.map((p) => p.name), ["Lamp"]);

  const skip = planImport(mine, incoming, "skip", opts());
  assert.deepEqual([skip.add.map((p) => p.name), skip.replace, skip.skipped], [["Lamp"], [], 2]);

  const each = planImport(mine, incoming, new Map([["my_other_9999", "skip" as const], ["my_table_2222", "replace" as const]]), opts());
  assert.deepEqual([each.add.map((p) => p.name), each.replace.map((p) => p.kind), each.skipped], [["Lamp"], ["my_table_2222"], 1]);
});

test("keep both numbers names until they are free and never touches what you have", () => {
  const have = [built("Sofa", "my_sofa_1111"), built("Sofa (2)", "my_sofa_2222")];
  const before = JSON.stringify(have);
  const plan = planImport(have, [built("SOFA", "my_sofa_1111"), built("sofa", "my_sofa_3333")], "both", opts());
  assert.deepEqual(plan.add.map((p) => p.name), ["SOFA (3)", "sofa (4)"]);
  assert.equal(new Set(plan.add.map((p) => p.kind)).size, 2);
  assert.ok(plan.add.every((p) => !have.some((h) => h.kind === p.kind)));
  assert.equal(JSON.stringify(have), before);
  assert.ok(plan.add.every((p) => p.name.length <= 40));
  const long = planImport([built("x".repeat(40), "my_long_1111")], [built("x".repeat(40), "my_long_2222")], "both", opts());
  assert.equal(long.add[0].name.length, 40);
});

test("one of yours is replaced only once; the second pack piece after it is kept as a copy", () => {
  const plan = planImport(mine, [built("Sofa", "my_a_aaaa"), built("sofa", "my_b_bbbb")], "replace", opts());
  assert.equal(plan.replace.length, 1);
  assert.deepEqual(plan.add.map((p) => p.name), ["sofa (2)"]);
});

test("model ids: free ids stay, the same file is not stored twice, a different file under the same id gets a new id", () => {
  const incoming = [modelPiece("A", "my_a_aaaa", "m_free"), modelPiece("B", "my_b_bbbb", "m_same"), modelPiece("C", "my_c_cccc", "m_other"), modelPiece("D", "my_d_dddd", "m_other")];
  const models = ["m_free", "m_same", "m_other"].map(glb);
  const stored = new Map<string, ModelState>([["m_same", "same"], ["m_other", "other"]]);
  const plan = planImport([], incoming, "both", opts(models, stored));
  const ids = plan.add.map((p) => p.model?.id);
  assert.equal(ids[0], "m_free");
  assert.equal(ids[1], "m_same");
  assert.notEqual(ids[2], "m_other");
  assert.equal(ids[2], ids[3]); // pieces sharing a model keep sharing it
  assert.deepEqual(plan.models.map((m) => m.id).sort(), ["m_free", ids[2]].sort());
  // an id one of my pieces already uses is a different file unless the caller says it is the same
  const clash = planImport([modelPiece("Mine", "my_mine_1111", "m_free")], [incoming[0]], "both", opts(models));
  assert.notEqual(clash.add[0].model?.id, "m_free");
  assert.equal(planImport([modelPiece("Mine", "my_mine_1111", "m_free")], [incoming[0]], "both", opts(models, new Map([["m_free", "same" as const]]))).models.length, 0);
});

test("a piece that is skipped brings no model file", () => {
  const plan = planImport([built("A", "my_a_aaaa")], [modelPiece("A", "my_a_bbbb", "m1")], "skip", opts([glb("m1")]));
  assert.deepEqual(plan.models, []);
});

test("every added piece carries the pack tag, and packs can be listed and removed as a whole", () => {
  const t1 = packTag({ name: "One", author: "Ada" }, 10, () => "a");
  const t2 = packTag({ name: "Two" }, 20, () => "b");
  const a = planImport([], [built("A", "my_a_aaaa"), built("B", "my_b_bbbb")], "both", { ...opts(), tag: t1 }).add;
  const b = planImport(a, [built("C", "my_c_cccc")], "both", { ...opts(), tag: t2 }).add;
  const groups = packGroups([...a, ...b, built("Mine", "my_mine_1111")]);
  assert.deepEqual(groups.map((g) => [g.pack.name, g.kinds.length, g.pack.author]), [["One", 2, "Ada"], ["Two", 1, undefined]]);
  assert.ok(a.every((p) => p.at === 10));
});

// ---- exporting -------------------------------------------------------------------------------------------------------------------

test("export refuses what cannot fit, with a plain message, and needs the files of model pieces", () => {
  assert.match(exportProblem([]) ?? "", /at least one/);
  const many = Array.from({ length: PACK_LIMITS.pieces + 1 }, (_, i) => built("P", `my_p_${i}`));
  assert.match(exportProblem(many) ?? "", /at most 200/);
  const heavy = Array.from({ length: 3 }, (_, i) => ({ ...modelPiece("M", `my_m_${i}`, `m${i}`), model: { id: `m${i}`, ext: "glb" as const, bytes: MAX_MODEL_BYTES } }));
  assert.match(exportProblem(heavy) ?? "", /3D models .* add up to/);
  assert.equal(exportProblem([built("Ok", "my_ok_1111")]), null);
  const noFile = buildPack({ name: "x" }, [modelPiece("Lamp", "my_lamp_bbbb", "m_lamp")], [], 0);
  assert.equal(noFile.ok, false);
});

test("the size estimate is close to the real file", () => {
  const pieces = [built("A", "my_a_aaaa"), modelPiece("M", "my_m_mmmm", "m1")];
  const made = buildPack({ name: "x" }, pieces, [glb("m1")], 0);
  assert.ok(made.ok);
  const real = made.ok ? made.bytes : 0;
  const est = estimatePackBytes(pieces);
  assert.ok(Math.abs(est - real) < 400, `${est} vs ${real}`);
});

test("pack file names are safe", () => {
  assert.equal(packFileName("My Nordic set!"), "my-nordic-set.doshypack");
  assert.equal(packFileName("../../etc/passwd"), "etc-passwd.doshypack");
  assert.equal(packFileName("???"), "furniture-pack.doshypack");
});

test("a pack made by an import round trips again (re-sharing keeps pieces, drops the old tag)", () => {
  const first = parsePack(file());
  assert.ok(first.ok);
  if (!first.ok) return;
  const added = planImport([], first.pack.pieces, "both", opts()).add;
  const again = buildPack({ name: "Again" }, added, [], 0);
  assert.ok(again.ok);
  const read = parsePack(again.ok ? again.text : "");
  assert.ok(read.ok);
  const pack: Pack | null = read.ok ? read.pack : null;
  assert.equal(pack?.pieces[0].pack, undefined);
  assert.equal(pack?.pieces[0].kind, "my_stool_aaaa");
});
