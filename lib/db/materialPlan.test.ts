import assert from "node:assert/strict";
import { test } from "node:test";
import { PH_LIMITS } from "../polyhaven.ts";
import { packMaterial } from "../polyhavenMaterial.ts";
import { createDashboard, parseCreateBody } from "./dashboards.ts";
import { HttpError } from "./errors.ts";
import { getPlan, parsePlanBody, putPlan } from "./plans.ts";
import { getResource, listResources, putResource } from "./resources.ts";
import { tempDb } from "./testDb.ts";

const jpeg = (extra: number, fill = 5) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(extra).fill(fill)]);
const dmat = (extra = 32, cap: number = PH_LIMITS.materialBytes) => packMaterial({ asset: "oak_veneer_01", name: "Oak veneer", authors: ["Rob Tuytel"], scaleM: 0.5 }, { diff: jpeg(extra) }, cap);
const refused = (status: number, code?: string) => (e: unknown) => e instanceof HttpError && e.status === status && (code === undefined || e.code === code);
const mat = (n: string) => ({ resourceId: `mat-${n.repeat(24)}`, scaleM: 0.8, rotation: 90, avg: "#887766" });

test("a texture is stored as one file and comes back byte for byte; anything else is refused", () => {
  const t = tempDb();
  const bytes = dmat();
  const kept = putResource(t.db, { id: "mat-0123456789abcdef01234567", kind: "material", name: "Oak veneer", mime: "application/octet-stream", meta: { asset: "oak_veneer_01" }, data: bytes });
  assert.equal(kept.kind, "material");
  assert.deepEqual(getResource(t.db, kept.id)!.data, bytes);
  assert.deepEqual(listResources(t.db, { kind: "material" }).map((r) => r.id), [kept.id]);
  const other = (data: Uint8Array, mime = "application/octet-stream") => () => putResource(t.db, { id: "mat-x", kind: "material", mime, data });
  assert.throws(other(Buffer.from("<svg onload=alert(1)>")), refused(415, "bad_type"), "not a texture file");
  assert.throws(other(bytes, "image/jpeg"), refused(415, "bad_type"), "wrong type");
  assert.throws(other(dmat(PH_LIMITS.materialBytes, PH_LIMITS.materialBytes * 2)), refused(413, "too_big"), "over the cap");
  assert.equal(listResources(t.db).length, 1, "nothing else was written");
  t.cleanup();
});

test("the server keeps a plan's textures on floors, both wall faces, ground areas and paths exactly as sent, and a copy keeps them too", () => {
  const t = tempDb();
  const a = mat("a");
  const plan = {
    walls: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, style: "brick", material: a, materialB: mat("b") }],
    openings: [],
    rooms: [{ id: "r", name: "Hall", x: 0, y: 0, w: 3, h: 3, color: "#fff", floor: "wood", floorMaterial: a }],
    items: [],
    ground: [{ id: "g", x: 0, y: 5, w: 2, h: 2, kind: "grass", material: mat("c") }],
    paths: [{ id: "p", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 1, kind: "gravel", material: mat("d") }],
  };
  putResource(t.db, { id: a.resourceId, kind: "material", mime: "application/octet-stream", data: dmat() });
  assert.equal(putPlan(t.db, 1, { ...parsePlanBody({ plan, baseRev: 0, format: 7 }) }, 1000).ok, true);
  assert.deepEqual(JSON.parse(getPlan(t.db, 1)!.json), plan);
  const copy = createDashboard(t.db, parseCreateBody({ fromId: 1 }), 5000);
  assert.deepEqual(JSON.parse(getPlan(t.db, copy.id)!.json), plan);
  assert.ok(getResource(t.db, a.resourceId), "resources are shared by id, not copied: both plans use the one stored texture");
  t.cleanup();
});
