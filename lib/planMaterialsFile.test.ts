import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { deleteResource, getResource, getResourceInfo, putResource } from "./db/resources.ts";
import { tempDb } from "./db/testDb.ts";
import { materialIds, withoutMaterials } from "./planMaterials.ts";
import { splitPlanFile } from "./planFile.ts";
import { MAX_MATERIAL_B64, materialBlock, readMaterialBlock, readMaterials } from "./planMaterialsFile.ts";
import { PH_LIMITS } from "./polyhaven.ts";
import { packMaterial } from "./polyhavenMaterial.ts";
import type { Plan, Room } from "./types.ts";

const jpeg = (fill: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(200).fill(fill)]);
const texture = (fill: number) => packMaterial({ asset: `asset_${fill}`, name: `Texture ${fill}`, authors: ["Someone"], scaleM: 0.5 }, { diff: jpeg(fill), rough: jpeg(fill + 1) }, PH_LIMITS.materialBytes);
const idOf = (bytes: Uint8Array) => `mat-${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}`;
const ref = (resourceId: string) => ({ resourceId, scaleM: 1, rotation: 0, avg: "#a08060" });
const room = (id: string, resourceId?: string): Room => ({ id, name: id, x: 0, y: 0, w: 3, h: 3, color: "#fff", floor: "wood", ...(resourceId ? { floorMaterial: ref(resourceId) } : {}) });
const plan = (rooms: Room[], extra: Partial<Plan> = {}): Plan => ({ walls: [], openings: [], rooms, items: [], ...extra });

const ONE = texture(7);
const TWO = texture(9);
const ID = idOf(ONE);
const OTHER = idOf(TWO);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const block = (bytes: Uint8Array = ONE) => ({ name: "Texture", b64: b64(bytes) });

test("a plan file's texture block is taken apart with the plan, and a plain file has none", () => {
  const parts = splitPlanFile({ ...plan([room("a", ID)]), materials: { [ID]: block() } });
  assert.equal("materials" in parts.plan, false);
  assert.deepEqual(parts.materials, { [ID]: block() });
  assert.equal("materials" in splitPlanFile(plan([room("a")])), false);
});

test("export, delete the texture, import: it is back byte for byte, under the same id, with its details", () => {
  const t = tempDb();
  putResource(t.db, { id: ID, kind: "material", name: "Texture 7", mime: "application/octet-stream", meta: { asset: "asset_7" }, data: ONE });
  const walls: Plan["walls"] = [{ id: "w", a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, style: "brick", material: ref(ID), materialB: ref(ID) }];
  const used = plan([room("a", ID), room("b", ID)], { walls, ground: [{ id: "g", x: 0, y: 0, w: 1, h: 1, kind: "grass", material: ref(ID) }] });
  // export: every used texture, once, as a block
  assert.deepEqual(materialIds(used), [ID]);
  const stored = getResource(t.db, ID)!;
  const written = materialBlock(b64(stored.data), stored.data);
  assert.ok(written);
  const file = JSON.parse(JSON.stringify({ ...used, materials: { [ID]: written } }));
  // the texture is gone from this server (a fresh install, or deleted in Data and backups)
  assert.equal(deleteResource(t.db, ID), true);
  assert.equal(getResourceInfo(t.db, ID), null);
  // import
  const parts = splitPlanFile(file);
  const { found, missing } = readMaterials(parts.materials, parts.plan);
  assert.deepEqual(missing, []);
  assert.equal(found.length, 1, "many surfaces, one texture, one block");
  for (const f of found) putResource(t.db, { id: f.id, kind: "material", mime: "application/octet-stream", name: f.name, meta: f.meta, data: f.bytes });
  assert.deepEqual(getResource(t.db, ID)!.data, ONE);
  assert.equal(getResource(t.db, ID)!.info.name, "Texture 7", "the name the file carries");
  assert.deepEqual(getResource(t.db, ID)!.info.meta, { asset: "asset_7", name: "Texture 7", authors: ["Someone"] });
  t.cleanup();
});

test("only the textures the plan uses are read from a file", () => {
  const { found, missing } = readMaterials({ [ID]: block(), [OTHER]: block(TWO), "../x": block() }, plan([room("a", ID)]));
  assert.deepEqual(found.map((f) => f.id), [ID], "a file cannot bring in other resources");
  assert.deepEqual(missing, []);
});

test("a texture the file does not carry, or carries badly, is reported missing", () => {
  const p = plan([room("a", ID), room("b", OTHER)]);
  assert.deepEqual(readMaterials({ [ID]: block() }, p).missing, [OTHER]);
  assert.deepEqual(readMaterials(undefined, p).missing, [ID, OTHER]);
  assert.deepEqual(readMaterials("nope", p).missing, [ID, OTHER]);
  assert.deepEqual(readMaterials({ __proto__: { [ID]: block() } }, plan([room("a", ID)])).missing, [ID], "inherited keys do not count");
  const bad = { [ID]: { name: "x", b64: "not base64!" }, [OTHER]: { name: "x", b64: "AAAA" } };
  assert.deepEqual(readMaterials(bad, p).missing, [ID, OTHER]);
});

test("a block must be a texture file whose bytes hash to the id the plan names", () => {
  assert.ok(readMaterialBlock(ID, block()));
  assert.equal(readMaterialBlock(OTHER, block()), null, "other pictures under this id are refused: the id is the hash of the file");
  const notTexture = Buffer.from("<svg onload=alert(1)>");
  assert.equal(readMaterialBlock(idOf(notTexture), block(notTexture)), null, "not a texture file even though the hash matches");
  const tooLong = { name: "x", b64: "A".repeat(MAX_MATERIAL_B64 + 4) };
  for (const bad of [null, 3, [], {}, { name: "x" }, { b64: "" }, { b64: "AAA" }, { b64: "AA==AA==" }, tooLong]) assert.equal(readMaterialBlock(ID, bad), null, JSON.stringify(bad)?.slice(0, 60));
  assert.equal(materialBlock("AAAA", new Uint8Array(4)), null, "export leaves out bytes that are not a texture");
});

test("a texture that could not come along is taken off its surfaces and the plan stays", () => {
  const p = plan([room("a", ID), room("b", OTHER), room("c")]);
  const out = withoutMaterials(p, [ID]);
  assert.deepEqual(out.rooms.map((r) => r.floorMaterial?.resourceId), [undefined, OTHER, undefined]);
  assert.equal(out.rooms[1], p.rooms[1]);
});
