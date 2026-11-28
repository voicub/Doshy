import assert from "node:assert/strict";
import test from "node:test";
import { getResource, putResource } from "./db/resources.ts";
import { tempDb } from "./db/testDb.ts";
import { withoutFloorPhotos } from "./floorPhoto.ts";
import { MAX_FLOOR_PHOTO_B64, floorPhotoMimeOf, readFloorPhotoBlock, readFloorPhotos, type FloorPhotoBlocks } from "./planFloorPhotoFile.ts";
import { splitPlanFile } from "./planFile.ts";
import type { Plan, Room } from "./types.ts";

const ID = "floor-0123456789abcdef01234567";
const OTHER = "floor-aaaaaaaaaaaaaaaaaaaaaaaa";
const photo = (resourceId: string) => ({ resourceId, scaleM: 0.4, rotation: 0, avg: "#a08060" });
const room = (id: string, resourceId?: string): Room => ({ id, name: id, x: 0, y: 0, w: 3, h: 3, color: "#fff", floor: "wood", ...(resourceId ? { floorPhoto: photo(resourceId) } : {}) });
const plan = (...rooms: Room[]): Plan => ({ walls: [], openings: [], rooms, items: [] });
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 7) % 256))]);
const block = (mime = "image/webp", bytes: Buffer = webp) => ({ mime, b64: bytes.toString("base64") });

test("a plan file's floor photo block is taken apart with the plan, and a plain file has none", () => {
  const file = { ...plan(room("a", ID)), floorPhotos: { [ID]: block() } };
  const parts = splitPlanFile(file);
  assert.equal("floorPhotos" in parts.plan, false);
  assert.deepEqual(parts.floorPhotos, { [ID]: block() });
  assert.equal("floorPhotos" in splitPlanFile(plan(room("a"))), false);
});

test("export then import carries the texture to another install byte for byte", () => {
  const from = tempDb();
  putResource(from.db, { id: ID, kind: "floor-photo", name: "Floor photo", mime: "image/webp", meta: { use: "floor-photo" }, data: webp });
  // export: the stored bytes become the block of the file
  const stored = getResource(from.db, ID)!;
  const blocks: FloorPhotoBlocks = { [ID]: { mime: "image/webp", b64: Buffer.from(stored.data).toString("base64") } };
  const file = JSON.parse(JSON.stringify({ ...plan(room("a", ID), room("b", ID), room("c")), floorPhotos: blocks }));
  // import: check the block, put it on the other server
  const parts = splitPlanFile(file);
  const { found, missing } = readFloorPhotos(parts.floorPhotos, parts.plan);
  assert.deepEqual(missing, []);
  assert.equal(found.length, 1, "two rooms, one texture, one block");
  const to = tempDb();
  for (const f of found) putResource(to.db, { id: f.id, kind: "floor-photo", mime: f.mime, data: Buffer.from(f.b64, "base64") });
  assert.deepEqual(Buffer.from(getResource(to.db, ID)!.data), webp);
  assert.equal(getResource(to.db, ID)!.info.hash, stored.info.hash);
  from.cleanup();
  to.cleanup();
});

test("only the textures the plan's rooms use are read from a file", () => {
  const { found, missing } = readFloorPhotos({ [ID]: block(), [OTHER]: block(), "../x": block() }, plan(room("a", ID)));
  assert.deepEqual(found.map((f) => f.id), [ID], "a file cannot bring in other resources");
  assert.deepEqual(missing, []);
});

test("a texture the file does not carry, or carries badly, is reported missing", () => {
  const p = plan(room("a", ID), room("b", OTHER));
  assert.deepEqual(readFloorPhotos({ [ID]: block() }, p), { found: [{ id: ID, ...block() }], missing: [OTHER] });
  assert.deepEqual(readFloorPhotos(undefined, p).missing, [ID, OTHER]);
  assert.deepEqual(readFloorPhotos("nope", p).missing, [ID, OTHER]);
  const bad = { [ID]: { mime: "image/svg+xml", b64: "AAAA" }, [OTHER]: { mime: "image/png", b64: "not base64!" } };
  assert.deepEqual(readFloorPhotos(bad, p).missing, [ID, OTHER]);
  assert.deepEqual(readFloorPhotos({ __proto__: { [ID]: block() } }, plan(room("a", ID))).missing, [ID], "inherited keys do not count");
});

test("a block is only a good one when its type is ours and its bytes are base64 within the cap", () => {
  assert.deepEqual(readFloorPhotoBlock(block("image/png")), block("image/png"));
  for (const bad of [null, 3, [], {}, { mime: "image/webp" }, { mime: "image/webp", b64: "" }, { mime: "image/jpeg", b64: "AAAA" }, { mime: "image/webp", b64: "AAA" }, { mime: "image/webp", b64: "AA==AA==" }, { mime: "image/webp", b64: "A".repeat(MAX_FLOOR_PHOTO_B64 + 4) }]) {
    assert.equal(readFloorPhotoBlock(bad), null, JSON.stringify(bad)?.slice(0, 60));
  }
  assert.equal(readFloorPhotoBlock({ mime: "image/webp", b64: "A".repeat(MAX_FLOOR_PHOTO_B64) })?.mime, "image/webp", "exactly at the cap is fine");
});

test("content types are matched without parameters or case", () => {
  assert.equal(floorPhotoMimeOf("Image/WebP; charset=x"), "image/webp");
  assert.equal(floorPhotoMimeOf("image/jpeg"), null);
  assert.equal(floorPhotoMimeOf(null), null);
});

test("a photo that could not come along is taken off its rooms and the rest of the plan stays", () => {
  const p = plan(room("a", ID), room("b", OTHER), room("c"));
  const out = withoutFloorPhotos(p, [ID]);
  assert.deepEqual(out.rooms.map((r) => r.floorPhoto?.resourceId), [undefined, OTHER, undefined]);
  assert.equal(out.rooms[1], p.rooms[1]);
  assert.equal(withoutFloorPhotos(p, []), p);
});
