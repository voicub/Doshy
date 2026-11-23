import test from "node:test";
import assert from "node:assert/strict";
import { autoAreaIds, devicePlacements, entitiesOfRoom, roomAreaIds } from "./haAreas.ts";
import type { HAState } from "./ha.ts";
import type { Plan, Room } from "./types.ts";

const area = (id: string, name: string) => ({ id, name });
const AREAS = [area("kitchen", "Kitchen"), area("living_room", "Living Room"), area("office", "Office"), area("bathroom", "Bathroom"), area("homelab", "Homelab")];
const room = (id: string, name: string, extra: Partial<Room> = {}): Room => ({ id, name, x: 0, y: 0, w: 1, h: 1, floor: "wood", color: "#fff", ...extra });
const plan = (rooms: Room[]): Plan => ({ walls: [], openings: [], items: [], rooms });
const st = (entity_id: string): HAState => ({ entity_id, state: "off", attributes: {} });
const states = Object.fromEntries(["switch.k", "switch.l", "switch.o", "switch.x"].map((id) => [id, st(id)]));
const entityArea = { "switch.k": "kitchen", "switch.l": "living_room", "switch.o": "office", "switch.x": null };

test("a combined room name matches several areas by word, ignoring generic words", () => {
  assert.deepEqual(autoAreaIds(room("a", "Living & kitchen"), AREAS), ["kitchen", "living_room"]);
  assert.deepEqual(autoAreaIds(room("b", "Bathroom"), AREAS), ["bathroom"]);
  assert.deepEqual(autoAreaIds(room("c", "Storage"), AREAS), []);
});

test("explicit room.areas replaces the name match, and alcoves add their areas to the parent", () => {
  const main = room("a", "Living & kitchen", { areas: ["office"] });
  const alcove = room("a2", "Nook", { parent: "a", areas: ["homelab"] });
  assert.deepEqual(roomAreaIds(plan([main, alcove]), main, AREAS), ["office", "homelab"]);
});

test("entitiesOfRoom returns only entities whose area belongs to the room", () => {
  const r = room("a", "Living & kitchen");
  assert.deepEqual(entitiesOfRoom(plan([r]), r, entityArea, states, AREAS), ["switch.k", "switch.l"]);
  const none = room("n", "Storage");
  assert.deepEqual(entitiesOfRoom(plan([none]), none, entityArea, states, AREAS), []);
});

test("devicePlacements puts unlinked controllable devices in a row inside their room and skips linked ones and sensors", () => {
  const r = room("o", "Office", { w: 3, h: 2, x: 10, y: 20 });
  const ids = ["light.a", "light.b", "media_player.echo", "sensor.t"];
  const s = Object.fromEntries(ids.map((id) => [id, st(id)]));
  const ea = Object.fromEntries(ids.map((id) => [id, "office"]));
  const p: Plan = { ...plan([r]), items: [{ id: "i", kind: "marker", x: 0, y: 0, rot: 0, w: 0.2, d: 0.2, h: 0.2, entity: "light.b" }] };
  const out = devicePlacements(p, s, ea, AREAS);
  assert.deepEqual(out.map((d) => d.entity), ["light.a", "media_player.echo"]);
  assert.ok(out.every((d) => d.x >= 10 && d.x <= 13 && d.y >= 20 && d.y <= 22));
  assert.notEqual(out[0].x, out[1].x);
});
