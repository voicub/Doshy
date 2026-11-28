import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { tempDb } from "../db/testDb.ts";
import { putPlan } from "../db/plans.ts";
import { putResource } from "../db/resources.ts";
import { isAllowedGuestRequest } from "../guestFetch.ts";
import { packMaterial } from "../polyhavenMaterial.ts";
import { guestPlanReply, guestResourceReply, type GuestEnv } from "./guestHandlers.ts";
import { createGuestLimits } from "./guestLimits.ts";
import { createLink, type NewLink } from "./guestLinks.ts";

const NOW = 1_800_000_000_000;
const base: NewLink = { dashboardId: 1, label: "", pin: null, expires: "7d", live: false, location: false };
const jpeg = (fill: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(64).fill(fill)]);
const texture = (fill: number) => packMaterial({ asset: `asset_${fill}`, name: `Texture ${fill}`, authors: [], scaleM: 1 }, { diff: jpeg(fill) }, 1 << 20);
const ids = { floor: `mat-${"1".repeat(24)}`, wall: `mat-${"2".repeat(24)}`, wallB: `mat-${"3".repeat(24)}`, ground: `mat-${"4".repeat(24)}`, path: `mat-${"5".repeat(24)}`, unused: `mat-${"6".repeat(24)}`, missing: `mat-${"7".repeat(24)}` };
const ref = (resourceId: string) => ({ resourceId, scaleM: 0.8, rotation: 0, avg: "#887766" });

const plan = {
  walls: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, style: "plaster", material: ref(ids.wall), materialB: ref(ids.wallB) }],
  openings: [],
  rooms: [{ id: "r", name: "Kitchen", x: 0, y: 0, w: 4, h: 3, color: "#fff", floor: "wood", floorMaterial: ref(ids.floor) }],
  items: [],
  ground: [{ id: "g", x: 0, y: 5, w: 2, h: 2, kind: "grass", material: ref(ids.ground) }, { id: "bad", x: 5, y: 5, w: 2, h: 2, kind: "grass", material: { resourceId: "../photo_1", scaleM: 1, rotation: 0, avg: "#fff" } }],
  paths: [{ id: "p", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 1, kind: "gravel", material: ref(ids.path) }, { id: "q", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 1, kind: "gravel", material: ref(ids.missing) }],
};

function setup() {
  const t = tempDb();
  putPlan(t.db, 1, { json: JSON.stringify(plan), baseRev: 0, format: 1 }, NOW);
  [ids.floor, ids.wall, ids.wallB, ids.ground, ids.path, ids.unused].forEach((id, i) => putResource(t.db, { id, kind: "material", name: `Texture ${i}`, mime: "application/octet-stream", data: texture(i + 1) }, NOW));
  putResource(t.db, { id: "photo_1", kind: "image", name: "Floor plan", mime: "image/png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]) }, NOW);
  return t;
}

const get = (token: string, path: string) => new Request(`http://doshy.test/api/guest/${token}/${path}`);
const env = (db: DatabaseSync): GuestEnv => ({ db, now: NOW, limits: createGuestLimits() });

test("a guest can fetch the textures the shared plan wears on floors, both wall faces, ground and paths, and no other", async () => {
  const t = setup();
  const { token } = await createLink(t.db, base, NOW);
  const e = env(t.db);
  for (const [i, id] of [ids.floor, ids.wall, ids.wallB, ids.ground, ids.path].entries()) {
    const res = await guestResourceReply(get(token, `resource/${id}`), token, id, e);
    assert.equal(res.status, 200, id);
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), texture(i + 1), id);
    assert.equal(res.headers.get("content-type"), "application/octet-stream");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(res.headers.get("content-security-policy") ?? "", /sandbox/);
  }
  for (const id of [ids.unused, ids.missing, "photo_1", "../photo_1", `${ids.floor}/../${ids.unused}`]) {
    assert.equal((await guestResourceReply(get(token, `resource/${id}`), token, id, e)).status, 404, id);
  }
  t.cleanup();
});

test("a stored texture reference that is garbage never reaches the guest; good ones do", async () => {
  const t = setup();
  const { token } = await createLink(t.db, base, NOW);
  const body: { plan: { rooms: { floorMaterial?: unknown }[]; walls: { material?: unknown; materialB?: unknown }[]; ground: { id: string; material?: unknown }[] } } = JSON.parse(await (await guestPlanReply(get(token, "plan"), token, env(t.db))).text());
  assert.deepEqual(body.plan.rooms[0].floorMaterial, ref(ids.floor));
  assert.deepEqual([body.plan.walls[0].material, body.plan.walls[0].materialB], [ref(ids.wall), ref(ids.wallB)]);
  assert.deepEqual(body.plan.ground.map((g) => [g.id, g.material !== undefined]), [["g", true], ["bad", false]]);
  t.cleanup();
});

test("a texture only counts while the shared plan still wears it", async () => {
  const t = setup();
  const { token } = await createLink(t.db, base, NOW);
  putPlan(t.db, 1, { json: JSON.stringify({ ...plan, rooms: [{ ...plan.rooms[0], floorMaterial: undefined }] }), baseRev: 1, format: 1 }, NOW + 1);
  assert.equal((await guestResourceReply(get(token, `resource/${ids.floor}`), token, ids.floor, env(t.db))).status, 404);
  assert.equal((await guestResourceReply(get(token, `resource/${ids.wall}`), token, ids.wall, env(t.db))).status, 200);
  t.cleanup();
});

test("the guest page may not ask for Poly Haven or any texture route of the owner", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUv";
  for (const url of ["/api/polyhaven/assets?t=textures", "/api/polyhaven/download?kind=material&id=oak", "/api/polyhaven/thumb?id=oak", `/api/db/resources/${ids.floor}`, "https://api.polyhaven.com/assets", "https://dl.polyhaven.org/file/x.jpg"]) {
    assert.equal(isAllowedGuestRequest(url, "https://doshy.example", token), false, url);
  }
  assert.equal(isAllowedGuestRequest(`/api/guest/${token}/resource/${ids.floor}`, "https://doshy.example", token), true);
});
