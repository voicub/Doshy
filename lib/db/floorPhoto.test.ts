import assert from "node:assert/strict";
import { test } from "node:test";
import { createDashboard, parseCreateBody } from "./dashboards.ts";
import { HttpError } from "./errors.ts";
import { readBody } from "./http.ts";
import { MAX_FLOOR_PHOTO_BYTES, getResource, listResources, putResource } from "./resources.ts";
import { getPlan, putPlan } from "./plans.ts";
import { tempDb } from "./testDb.ts";

const refused = (status: number, code?: string) => (e: unknown) => e instanceof HttpError && e.status === status && (code === undefined || e.code === code);

/** The first bytes of a real PNG and a real WebP, then filler: what the check reads. */
const png = (extra = 16) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 7)]);
const webp = (extra = 16) => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(extra, 7)]);
const floor = (id: string, mime: string, data: Uint8Array) => ({ id, kind: "floor-photo", name: "Floor photo", mime, meta: { use: "floor-photo", size: 1024 }, data });

test("a floor texture is stored as PNG or WebP and comes back byte for byte", () => {
  const t = tempDb();
  const [a, b] = [png(), webp()];
  assert.equal(putResource(t.db, floor("floor-a", "image/png", a)).kind, "floor-photo");
  assert.equal(putResource(t.db, floor("floor-b", "image/webp", b)).mime, "image/webp");
  assert.deepEqual(Buffer.from(getResource(t.db, "floor-a")!.data), a);
  assert.deepEqual(listResources(t.db, { kind: "floor-photo" }).map((r) => r.id).sort(), ["floor-a", "floor-b"]);
  assert.equal(listResources(t.db, { kind: "image" }).length, 0, "they are not mixed into the floor plan images");
  t.cleanup();
});

test("another picture type is refused for a floor texture", () => {
  const t = tempDb();
  for (const mime of ["image/jpeg", "image/gif", "text/html", "application/octet-stream"]) {
    assert.throws(() => putResource(t.db, floor("floor-x", mime, png())), refused(415, "bad_type"), mime);
  }
  assert.equal(listResources(t.db).length, 0);
  t.cleanup();
});

test("a floor texture must really start like the picture it says it is", () => {
  const t = tempDb();
  assert.throws(() => putResource(t.db, floor("floor-x", "image/png", Buffer.from("<svg onload=alert(1)>"))), refused(415, "bad_type"));
  assert.throws(() => putResource(t.db, floor("floor-x", "image/png", webp())), refused(415, "bad_type"), "a WebP sent as a PNG");
  assert.throws(() => putResource(t.db, floor("floor-x", "image/webp", png())), refused(415, "bad_type"), "a PNG sent as a WebP");
  assert.throws(() => putResource(t.db, floor("floor-x", "image/webp", Buffer.from("RIFF\0\0\0\0WAVEfmt "))), refused(415, "bad_type"), "a RIFF file that is not WebP");
  assert.equal(listResources(t.db).length, 0, "nothing was written");
  t.cleanup();
});

test("a floor texture over its size cap is refused, an empty one too", () => {
  const t = tempDb();
  assert.throws(() => putResource(t.db, floor("floor-big", "image/png", png(MAX_FLOOR_PHOTO_BYTES))), refused(413, "too_big"));
  assert.throws(() => putResource(t.db, floor("floor-empty", "image/png", new Uint8Array(0))), refused(400, "empty"));
  assert.equal(putResource(t.db, floor("floor-ok", "image/png", png(MAX_FLOOR_PHOTO_BYTES - 8))).size, MAX_FLOOR_PHOTO_BYTES, "exactly at the cap is fine");
  t.cleanup();
});

test("the same texture under two ids is stored once, and an unsafe id is refused", () => {
  const t = tempDb();
  assert.equal(putResource(t.db, floor("floor-1", "image/png", png())).deduped, false);
  assert.equal(putResource(t.db, floor("floor-2", "image/png", png())).deduped, true);
  assert.throws(() => putResource(t.db, floor("../etc/passwd", "image/png", png())), refused(400, "bad_id"));
  t.cleanup();
});

test("the upload route reads a floor texture with the small cap and stops a bigger body early", async () => {
  const body = new Uint8Array(MAX_FLOOR_PHOTO_BYTES + 1);
  const req = new Request("http://x/api/db/resources", { method: "POST", body });
  await assert.rejects(readBody(req, MAX_FLOOR_PHOTO_BYTES), refused(413, "too_big"));
});

test("copying a plan keeps its rooms' floor photos, and the texture they point at is still there for the copy", () => {
  const t = tempDb();
  putResource(t.db, floor("floor-0123456789abcdef01234567", "image/webp", webp()));
  const photo = { resourceId: "floor-0123456789abcdef01234567", scaleM: 0.4, rotation: 0, avg: "#a08060" };
  const plan = { walls: [], openings: [], rooms: [{ id: "r", name: "Hall", x: 0, y: 0, w: 3, h: 3, color: "#fff", floor: "wood", floorPhoto: photo }], items: [] };
  putPlan(t.db, 1, { json: JSON.stringify(plan), baseRev: 0, format: 7 }, 1000);
  const copy = createDashboard(t.db, parseCreateBody({ fromId: 1 }), 5000);
  const rooms = JSON.parse(getPlan(t.db, copy.id)!.json).rooms;
  assert.deepEqual(rooms[0].floorPhoto, photo);
  assert.ok(getResource(t.db, rooms[0].floorPhoto.resourceId), "resources are shared by id, not copied: both plans use the one stored texture");
  t.cleanup();
});
