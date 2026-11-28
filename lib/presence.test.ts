import test from "node:test";
import assert from "node:assert/strict";
import type { HAState } from "./ha.ts";
import { PALETTE, colorOf, defaultRoom, letterOf, matchRoom, parseSettings, peopleOf, rememberRooms, resolveAll, type Context, type PresenceSettings } from "./presence.ts";
import type { Room } from "./types.ts";

const room = (id: string, name: string, extra: Partial<Room> = {}): Room => ({ id, name, x: 0, y: 0, w: 4, h: 4, floor: "wood", color: "#fff", ...extra });
const st = (entity_id: string, state: string, friendly_name?: string): HAState => ({ entity_id, state, attributes: friendly_name ? { friendly_name } : {} });
const map = (...l: HAState[]) => Object.fromEntries(l.map((s) => [s.entity_id, s]));

const LAYOUT = { rooms: [room("liv", "Living & kitchen", { areas: ["living_room", "kitchen"] }), room("bed", "Bedroom", { areas: ["bedroom"] }), room("alc", "Bedroom wardrobe niche", { parent: "bed" }), room("bath", "Bathroom")] };

const ctx = (states: Record<string, HAState>, over: Partial<Context> = {}): Context => ({ layout: LAYOUT, states, areas: [], entityArea: {}, last: new Map(), ...over });
const settings = (people: PresenceSettings["people"] = {}): PresenceSettings => ({ show: true, people, trackers: [] });
const one = (states: Record<string, HAState>, prefs: PresenceSettings["people"] = {}, over: Partial<Context> = {}) => resolveAll(peopleOf(states, []), settings(prefs), ctx(states, over))[0];

test("a sensor text finds the room however it is written: case, accents, underscores and partial names", () => {
  const rooms = { rooms: [room("a", "Living Room"), room("b", "Salón"), room("c", "Kitchen")] };
  for (const text of ["living_room", "LIVING ROOM", "Living", "living-room"]) assert.equal(matchRoom(rooms, text)?.id, "a", text);
  assert.equal(matchRoom(rooms, "salon")?.id, "b");
  assert.equal(matchRoom(rooms, "Garage"), undefined);
  assert.equal(matchRoom(rooms, "   "), undefined);
});

test("an exact name beats a looser one, and an alcove answers as its room", () => {
  const rooms = { rooms: [room("a", "Bedroom 2"), room("b", "Bedroom"), room("n", "Bedroom niche", { parent: "b" })] };
  assert.equal(matchRoom(rooms, "Bedroom")?.id, "b");
  assert.equal(matchRoom(rooms, "Bedroom 2")?.id, "a");
  assert.equal(matchRoom(rooms, "Bedroom niche")?.id, "b");
});

test("Home Assistant areas lead to the room that owns them, by id or by area name", () => {
  const rooms = { rooms: [room("a", "Open space", { areas: ["kitchen", "dining"] }), room("b", "Suite", { areas: ["master"] })] };
  const areas = [{ id: "master", name: "Master bedroom" }];
  assert.equal(matchRoom(rooms, "Kitchen")?.id, "a");
  assert.equal(matchRoom(rooms, "Master bedroom", areas)?.id, "b");
  assert.equal(matchRoom(rooms, "master")?.id, "b");
});

test("a person who is home appears in the room their room sensor names; the usual sensor names are found by themselves", () => {
  const states = map(st("person.anna", "home", "Anna"), st("sensor.anna_room", "Kitchen"));
  const r = one(states);
  assert.deepEqual([r.home, r.roomId, r.source, r.sensor], [true, "liv", "sensor", "sensor.anna_room"]);
  const bermuda = one(map(st("person.anna", "home"), st("sensor.anna_phone_area", "bedroom")));
  assert.equal(bermuda.roomId, "bed");
});

test("the first sensor that says something usable wins; one that names no room is skipped", () => {
  const states = map(st("person.anna", "home"), st("sensor.anna_room", "Garage"), st("sensor.anna_area", "Bathroom"));
  assert.equal(one(states).roomId, "bath");
});

test("another person's sensor is not mine: anna_b has her own", () => {
  const states = map(st("person.anna", "home"), st("person.anna_b", "home"), st("sensor.anna_b_room", "Bathroom"));
  const [anna, annaB] = resolveAll(peopleOf(states, []), settings(), ctx(states));
  assert.equal(annaB.roomId, "bath");
  assert.equal(anna.source, "default");
});

test("the sensor the owner picked beats discovery", () => {
  const states = map(st("person.anna", "home"), st("sensor.anna_room", "Kitchen"), st("sensor.my_ble", "Bathroom"));
  assert.equal(one(states, { "person.anna": { enabled: true, where: "auto", sensor: "sensor.my_ble" } }).roomId, "bath");
});

test("a motion sensor puts a person in the room that lists it, or the room of its area, and says nothing while off", () => {
  const layout = { rooms: [room("liv", "Living", { presenceEntities: ["binary_sensor.liv_motion"] }), room("bed", "Bedroom", { areas: ["bedroom"] })] };
  const prefs = (sensor: string) => ({ "person.anna": { enabled: true, where: "auto" as const, sensor } });
  const states = map(st("person.anna", "home"), st("binary_sensor.liv_motion", "on"), st("binary_sensor.bed_motion", "on"));
  assert.equal(one(states, prefs("binary_sensor.liv_motion"), { layout }).roomId, "liv");
  assert.equal(one(states, prefs("binary_sensor.bed_motion"), { layout, entityArea: { "binary_sensor.bed_motion": "bedroom" } }).roomId, "bed");
  const quiet = map(st("person.anna", "home"), st("binary_sensor.liv_motion", "off"));
  assert.equal(one(quiet, prefs("binary_sensor.liv_motion"), { layout }).source, "default");
});

test("away people are not placed; a person with no sensor waits in the living room", () => {
  const states = map(st("person.bob", "not_home"), st("person.anna", "home"), st("person.zed", "Work"));
  const byName = Object.fromEntries(resolveAll(peopleOf(states, []), settings(), ctx(states)).map((r) => [r.entity, r]));
  assert.deepEqual([byName["person.bob"].home, byName["person.bob"].roomId], [false, undefined]);
  assert.equal(byName["person.zed"].home, false);
  assert.deepEqual([byName["person.anna"].roomId, byName["person.anna"].source], ["liv", "default"]);
});

test("without a living room the first indoor room of the lowest storey is used, never the balcony", () => {
  const layout = { rooms: [room("bal", "Balcony", { floor: "deck" }), room("bed", "Bedroom"), room("study", "Study")] };
  assert.equal(defaultRoom(layout)?.id, "bed");
});

test("hidden people are not placed; a fixed room is found by name even when the plan has other ids", () => {
  const states = map(st("person.anna", "home"), st("sensor.anna_room", "Kitchen"));
  assert.equal(one(states, { "person.anna": { enabled: true, where: "hidden" } }).roomId, undefined);
  const fixed = one(states, { "person.anna": { enabled: true, where: "fixed", room: "bedroom" } });
  assert.deepEqual([fixed.roomId, fixed.source], ["bed", "fixed"]);
  assert.equal(one(states, { "person.anna": { enabled: true, where: "fixed", room: "Library" } }).source, "default");
});

test("a sensor that goes unknown or unavailable keeps the person in the last room seen", () => {
  const last = new Map<string, string>();
  const people = peopleOf(map(st("person.anna", "home")), []);
  const first = map(st("person.anna", "home"), st("sensor.anna_room", "Bathroom"));
  rememberRooms(last, resolveAll(people, settings(), ctx(first, { last })));
  for (const quiet of ["unknown", "unavailable", ""]) {
    const r = resolveAll(people, settings(), ctx(map(st("person.anna", "home"), st("sensor.anna_room", quiet)), { last }))[0];
    assert.deepEqual([r.roomId, r.source], ["bath", "last"], quiet);
  }
});

test("a default or last-known placement is not remembered as a sure one", () => {
  const last = new Map<string, string>();
  const states = map(st("person.anna", "home"));
  rememberRooms(last, resolveAll(peopleOf(states, []), settings(), ctx(states, { last })));
  assert.equal(last.size, 0);
});

test("added trackers are listed next to the person entities, once", () => {
  const states = map(st("person.anna", "home", "Anna"), st("device_tracker.phone", "home", "Phone"));
  assert.deepEqual(peopleOf(states, ["device_tracker.phone", "device_tracker.gone"]).map((p) => p.entity), ["person.anna", "device_tracker.gone", "device_tracker.phone"]);
});

test("stored settings: valid fields are kept, damaged ones fall back, unknown shapes give the defaults", () => {
  const ok = parseSettings({
    show: false,
    people: { "person.anna": { enabled: false, where: "fixed", room: " Kitchen ", sensor: "sensor.anna_room", color: PALETTE[2], letter: "  Abc " }, "light.nope": { enabled: false }, "person.bob": { where: "teleport", color: "red", sensor: "not an entity", letter: "" } },
    trackers: ["device_tracker.phone", "device_tracker.phone", "light.lamp", 7],
  });
  assert.equal(ok.show, false);
  assert.deepEqual(ok.people["person.anna"], { enabled: false, where: "fixed", room: "Kitchen", sensor: "sensor.anna_room", color: PALETTE[2], letter: "Ab" });
  assert.deepEqual(ok.people["person.bob"], { enabled: true, where: "auto" });
  assert.equal(ok.people["light.nope"], undefined);
  assert.deepEqual(ok.trackers, ["device_tracker.phone"]);
  for (const junk of [null, "x", 3, [], { people: "no", trackers: "no" }]) assert.deepEqual(parseSettings(junk), { show: true, people: {}, trackers: [] });
});

test("colour and letter: the owner's choice, else a steady default from the id and the name", () => {
  const prefs = { enabled: true, where: "auto" as const };
  assert.equal(colorOf("person.anna", prefs), colorOf("person.anna", prefs));
  assert.ok(PALETTE.some((c) => c === colorOf("person.bob", prefs)));
  assert.equal(colorOf("person.anna", { ...prefs, color: PALETTE[5] }), PALETTE[5]);
  assert.equal(letterOf("Anna Popescu", prefs), "AP");
  assert.equal(letterOf("Anna Popescu", { ...prefs, letter: "Z" }), "Z");
});
