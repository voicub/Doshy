import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "./errors.ts";
import { MAX_RESOURCE_BYTES, deleteResource, getResource, getResourceInfo, listResources, putResource, resourceTotals } from "./resources.ts";
import { tempDb } from "./testDb.ts";

const refused = (status: number, code?: string) => (e: unknown) => e instanceof HttpError && e.status === status && (!code || e.code === code);
const glb = (...bytes: number[]) => new Uint8Array([0x67, 0x6c, 0x54, 0x46, ...bytes]);
const model = (id: string, data: Uint8Array, name = id) => ({ id, kind: "model", name, mime: "model/gltf-binary", meta: { ext: "glb" }, data });
const blobs = (db: Parameters<typeof putResource>[0]) => Number(db.prepare("SELECT COUNT(*) AS n FROM blobs").get()?.n);

test("a stored file comes back byte for byte, with its type, name and details", () => {
  const t = tempDb();
  const bytes = glb(...Array.from({ length: 300 }, (_, i) => i % 256));
  const info = putResource(t.db, model("m_1", bytes, "Sofa"), 1000);
  assert.equal(info.size, bytes.byteLength);
  assert.equal(info.hash.length, 64);
  const got = getResource(t.db, "m_1")!;
  assert.deepEqual(Buffer.from(got.data), Buffer.from(bytes));
  assert.equal(got.info.mime, "model/gltf-binary");
  assert.equal(got.info.name, "Sofa");
  assert.deepEqual(got.info.meta, { ext: "glb" });
  assert.equal(getResource(t.db, "nope"), null);
  t.cleanup();
});

test("the same contents under different ids are stored once, and freed with the last user", () => {
  const t = tempDb();
  const a = putResource(t.db, model("m_a", glb(1, 2, 3)));
  const b = putResource(t.db, model("m_b", glb(1, 2, 3)));
  assert.equal(a.deduped, false);
  assert.equal(b.deduped, true);
  assert.equal(a.hash, b.hash);
  assert.equal(blobs(t.db), 1);
  assert.deepEqual(resourceTotals(t.db), { count: 2, bytes: 7, limit: resourceTotals(t.db).limit }, "counted once");
  assert.equal(deleteResource(t.db, "m_a"), true);
  assert.equal(blobs(t.db), 1, "still used by m_b");
  assert.deepEqual(Buffer.from(getResource(t.db, "m_b")!.data), Buffer.from(glb(1, 2, 3)));
  assert.equal(deleteResource(t.db, "m_b"), true);
  assert.equal(blobs(t.db), 0);
  assert.equal(deleteResource(t.db, "m_b"), false);
  t.cleanup();
});

test("replacing an id with new contents frees the old ones and keeps the creation time", () => {
  const t = tempDb();
  putResource(t.db, model("m_a", glb(1)), 1000);
  const again = putResource(t.db, model("m_a", glb(2, 2)), 9000);
  assert.equal(again.createdAt, 1000);
  assert.equal(blobs(t.db), 1);
  assert.equal(getResource(t.db, "m_a")!.info.size, 6);
  t.cleanup();
});

test("a file over 25 MB is refused, one of exactly 25 MB is kept", () => {
  const t = tempDb();
  assert.throws(() => putResource(t.db, model("big", new Uint8Array(MAX_RESOURCE_BYTES + 1).fill(7))), refused(413, "too_big"));
  assert.equal(blobs(t.db), 0);
  assert.equal(putResource(t.db, model("edge", new Uint8Array(MAX_RESOURCE_BYTES).fill(7))).size, MAX_RESOURCE_BYTES);
  t.cleanup();
});

test("past the total allowance new files are refused with a clear message, but duplicates and deletes still work", () => {
  const t = tempDb();
  const limit = 100;
  putResource(t.db, model("a", new Uint8Array(60).fill(1)), 1, limit);
  assert.throws(() => putResource(t.db, model("b", new Uint8Array(60).fill(2)), 2, limit), refused(413, "full"));
  assert.equal(putResource(t.db, model("c", new Uint8Array(60).fill(1)), 3, limit).deduped, true, "same contents cost nothing");
  deleteResource(t.db, "a");
  deleteResource(t.db, "c");
  assert.doesNotThrow(() => putResource(t.db, model("b", new Uint8Array(60).fill(2)), 4, limit));
  t.cleanup();
});

test("ids, kinds, types, empty files and details are validated; nothing is written on refusal", () => {
  const t = tempDb();
  const good = model("ok", glb(1));
  for (const id of ["", "a b", "a/b", "../x", "x".repeat(65), "é"]) assert.throws(() => putResource(t.db, { ...good, id }), refused(400, "bad_id"), id);
  assert.throws(() => putResource(t.db, { ...good, kind: "video" }), refused(400, "bad_kind"));
  assert.throws(() => putResource(t.db, { ...good, kind: "piece" }), refused(415, "bad_type"), "a model type is not a piece");
  assert.throws(() => putResource(t.db, { ...good, mime: "text/html" }), refused(415, "bad_type"));
  assert.throws(() => putResource(t.db, { ...good, data: new Uint8Array(0) }), refused(400, "empty"));
  assert.throws(() => putResource(t.db, { ...good, meta: [1] }), refused(400, "bad_meta"));
  assert.throws(() => putResource(t.db, { ...good, meta: { pad: "x".repeat(9000) } }), refused(400, "bad_meta"));
  assert.equal(listResources(t.db).length, 0);
  assert.equal(blobs(t.db), 0);
  assert.equal(putResource(t.db, { ...good, mime: "Model/GLTF-Binary; charset=x" }).mime, "model/gltf-binary", "type parameters are dropped");
  t.cleanup();
});

test("names are plain text: markup and control characters become spaces, length is bounded", () => {
  const t = tempDb();
  assert.equal(putResource(t.db, model("n1", glb(1), "<script>alert(1)</script>\u0007Sofa")).name, "script alert(1) /script Sofa");
  assert.equal(putResource(t.db, model("n2", glb(2), "y".repeat(500))).name.length, 120);
  assert.equal(putResource(t.db, model("n3", glb(3), "   ")).name, "n3");
  t.cleanup();
});

test("lists carry no file contents; JSON pieces can be listed with their parsed contents", () => {
  const t = tempDb();
  putResource(t.db, model("m_1", glb(1)), 1000);
  const piece = { kind: "my_table_ab12", name: "Table", w: 1, d: 1, h: 1, parts: [], at: 1 };
  putResource(t.db, { id: "my_table_ab12", kind: "piece", name: "Table", mime: "application/json", data: new TextEncoder().encode(JSON.stringify(piece)) }, 2000);
  const plain = listResources(t.db);
  assert.deepEqual(plain.map((r) => r.id), ["my_table_ab12", "m_1"], "newest first");
  assert.ok(plain.every((r) => !("data" in r) && !("json" in r)));
  assert.deepEqual(listResources(t.db, { kind: "model" }).map((r) => r.id), ["m_1"]);
  const inline = listResources(t.db, { kind: "piece", inline: true });
  assert.deepEqual(inline[0].json, piece);
  assert.deepEqual(listResources(t.db, { inline: true }).map((r) => r.id), ["my_table_ab12"], "inline lists JSON resources only");
  t.cleanup();
});

test("the details of a file can be read without its contents", () => {
  const t = tempDb();
  const info = putResource(t.db, model("m_x", glb(9, 8, 7), "Lamp"), 1000);
  assert.deepEqual(getResourceInfo(t.db, "m_x"), { ...getResource(t.db, "m_x")!.info });
  assert.equal(getResourceInfo(t.db, "m_x")!.hash, info.hash);
  assert.equal(getResourceInfo(t.db, "nope"), null);
  t.cleanup();
});
