import test from "node:test";
import assert from "node:assert/strict";
import { ALERT_DEFAULTS, cleanAlertSettings, deriveAlerts, type Alert } from "./alerts.ts";
import type { HAState } from "./ha.ts";
import type { Item, Opening, Plan, Room, Wall } from "./types.ts";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const MIN = 60_000;
const CFG = { openMinutes: 15 };

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, floor: "wood", color: "#fff", ...extra });
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster" });
const item = (id: string, x: number, y: number, entity?: string, extra: Partial<Item> = {}): Item => ({ id, kind: "marker", x, y, rot: 0, w: 0.5, d: 0.5, h: 0.5, entity, ...extra });
const opening = (id: string, wallId: string, t: number, entity: string, type: Opening["type"] = "window"): Opening => ({ id, wallId, t, width: 1, type, sill: 0.9, height: 1.2, entity });

// Kitchen (0,0 4x4) beside Hall (4.12,0 4x4); an alcove of the Kitchen; a wall round the Kitchen's south side with a window; a door between the two rooms.
const plan = (over: Partial<Plan> = {}): Plan => ({
  rooms: [room("Kitchen", 0, 0, 4, 4), room("Nook", 4, 1, 0.12, 1, { parent: "Kitchen" }), room("Hall", 4.12, 0, 4, 4)],
  walls: [wall("south", 0, 4.06, 4, 4.06), wall("mid", 4.06, 0, 4.06, 4)],
  openings: [],
  items: [],
  ...over,
});

const st = (entity_id: string, state: string, device_class?: string, minutesAgo = 0, name?: string): HAState => ({
  entity_id,
  state,
  attributes: { device_class, friendly_name: name },
  last_changed: new Date(NOW - minutesAgo * MIN).toISOString(),
});
const states = (...list: HAState[]): Record<string, HAState> => Object.fromEntries(list.map((s) => [s.entity_id, s]));
const derive = (p: Plan, s: Record<string, HAState>, cfg = CFG): Alert[] => deriveAlerts(p, s, NOW, cfg);

const kitchenLeak = (extra: Partial<Plan> = {}) => plan({ items: [item("sink", 1, 1, "binary_sensor.kitchen_leak")], ...extra });

test("a leak sensor on a piece of furniture is a critical alert in that room, on that piece", () => {
  const [a, ...rest] = derive(kitchenLeak(), states(st("binary_sensor.kitchen_leak", "on", "moisture", 2, "Kitchen leak")));
  assert.equal(rest.length, 0);
  assert.equal(a.kind, "leak");
  assert.equal(a.severity, "critical");
  assert.equal(a.roomId, "Kitchen");
  assert.equal(a.itemId, "sink");
  assert.equal(a.since, NOW - 2 * MIN);
  assert.ok(a.message.includes("Kitchen leak"));
});

test("smoke, gas and carbon monoxide are critical; a sensor that reads off is not an alert", () => {
  const p = plan({ items: [item("a", 1, 1, "binary_sensor.s"), item("b", 2, 1, "binary_sensor.g"), item("c", 3, 1, "binary_sensor.c"), item("d", 3, 3, "binary_sensor.w")] });
  const on = derive(p, states(st("binary_sensor.s", "on", "smoke"), st("binary_sensor.g", "on", "gas"), st("binary_sensor.c", "on", "carbon_monoxide"), st("binary_sensor.w", "off", "moisture")));
  assert.deepEqual(on.map((a) => a.kind).sort(), ["co", "gas", "smoke"]);
  assert.ok(on.every((a) => a.severity === "critical"));
});

test("an entity the plan does not link is ignored", () => {
  assert.deepEqual(derive(plan(), states(st("binary_sensor.kitchen_leak", "on", "moisture"))), []);
});

test("unavailable and unknown never alert", () => {
  const p = plan({ items: [item("a", 1, 1, "binary_sensor.l"), item("b", 2, 1, "binary_sensor.m")] });
  assert.deepEqual(derive(p, states(st("binary_sensor.l", "unavailable", "moisture"), st("binary_sensor.m", "unknown", "smoke"))), []);
});

test("the alert id stays the same while it lasts and is built from the kind and the entity", () => {
  const p = kitchenLeak();
  const first = derive(p, states(st("binary_sensor.kitchen_leak", "on", "moisture", 1)))[0];
  const later = deriveAlerts(p, states(st("binary_sensor.kitchen_leak", "on", "moisture", 1)), NOW + 5 * MIN, CFG)[0];
  assert.equal(first.id, later.id);
  assert.equal(first.id, "leak:binary_sensor.kitchen_leak");
});

test("a resolved problem is simply not listed", () => {
  const p = kitchenLeak();
  assert.equal(derive(p, states(st("binary_sensor.kitchen_leak", "on", "moisture"))).length, 1);
  assert.equal(derive(p, states(st("binary_sensor.kitchen_leak", "off", "moisture"))).length, 0);
});

test("a door or window alerts only after it has been open longer than the setting", () => {
  const p = plan({ items: [item("d", 1, 1, "binary_sensor.door"), item("w", 2, 1, "binary_sensor.win")] });
  const at = (m: number) => derive(p, states(st("binary_sensor.door", "on", "door", m), st("binary_sensor.win", "on", "window", m)));
  assert.equal(at(14).length, 0);
  const open = at(16);
  assert.deepEqual(open.map((a) => a.kind).sort(), ["door_open", "window_open"]);
  assert.ok(open.every((a) => a.severity === "warning"));
  assert.equal(derive(p, states(st("binary_sensor.door", "on", "door", 16)), { openMinutes: 30 }).length, 0);
  assert.equal(derive(p, states(st("binary_sensor.door", "on", "door", 31)), { openMinutes: 30 }).length, 1);
});

test("a contact sensor linked to a window opening is a window; its room is the one the wall serves", () => {
  const p = plan({ openings: [opening("o1", "south", 0.5, "binary_sensor.south_contact")] });
  const [a] = derive(p, states(st("binary_sensor.south_contact", "on", undefined, 40)));
  assert.equal(a.kind, "window_open");
  assert.equal(a.openingId, "o1");
  assert.equal(a.roomId, "Kitchen");
});

test("a garage door cover alerts when open; a blind never does", () => {
  const p = plan({ items: [item("g", 1, 1, "cover.garage"), item("b", 2, 1, "cover.blind")] });
  const out = derive(p, states(st("cover.garage", "open", "garage", 30), st("cover.blind", "open", "blind", 600)));
  assert.deepEqual(out.map((a) => a.entity), ["cover.garage"]);
});

test("motion counts only while an alarm is armed away or has gone off", () => {
  const p = plan({ items: [item("m", 1, 1, "binary_sensor.motion")] });
  const motion = st("binary_sensor.motion", "on", "motion");
  assert.equal(derive(p, states(motion)).length, 0);
  assert.equal(derive(p, states(motion, st("alarm_control_panel.home", "disarmed"))).length, 0);
  assert.equal(derive(p, states(motion, st("alarm_control_panel.home", "armed_home"))).length, 0);
  const armed = derive(p, states(motion, st("alarm_control_panel.home", "armed_away")));
  assert.equal(armed.length, 1);
  assert.equal(armed[0].kind, "intrusion");
  assert.equal(armed[0].severity, "critical");
  assert.equal(armed[0].roomId, "Kitchen");
  assert.equal(derive(p, states(st("binary_sensor.motion", "off", "motion"), st("alarm_control_panel.home", "armed_away"))).length, 0);
});

test("a room's occupancy sensor is intrusion evidence too, and finds its room from the Room field", () => {
  const p = plan({ rooms: [room("Kitchen", 0, 0, 4, 4, { presenceEntities: ["binary_sensor.k_occ"] }), room("Hall", 4.12, 0, 4, 4)] });
  const [a] = derive(p, states(st("binary_sensor.k_occ", "on", "occupancy"), st("alarm_control_panel.home", "armed_away")));
  assert.equal(a.roomId, "Kitchen");
  assert.equal(a.itemId, undefined);
});

test("a triggered alarm panel is a critical alert, linked to the plan or not, and puts motion in play", () => {
  const p = plan({ items: [item("m", 1, 1, "binary_sensor.motion")] });
  const out = derive(p, states(st("alarm_control_panel.home", "triggered", undefined, 1), st("binary_sensor.motion", "on", "motion")));
  assert.deepEqual(out.map((a) => a.id).sort(), ["intrusion:alarm_control_panel.home", "intrusion:binary_sensor.motion"]);
  assert.equal(out.find((a) => a.entity === "alarm_control_panel.home")?.roomId, undefined);
  const linked = plan({ items: [item("panel", 5, 1, "alarm_control_panel.home")] });
  assert.equal(derive(linked, states(st("alarm_control_panel.home", "triggered")))[0].roomId, "Hall");
});

test("a problem, safety or tamper sensor is a warning", () => {
  const p = plan({ items: [item("a", 1, 1, "binary_sensor.p"), item("b", 2, 1, "binary_sensor.s"), item("c", 3, 1, "binary_sensor.t")] });
  const out = derive(p, states(st("binary_sensor.p", "on", "problem"), st("binary_sensor.s", "on", "safety"), st("binary_sensor.t", "on", "tamper")));
  assert.equal(out.length, 3);
  assert.ok(out.every((a) => a.kind === "problem" && a.severity === "warning"));
});

test("a sensor of an alcove reports the room it belongs to, and the room is found on the item's own level", () => {
  const p = plan({ items: [item("n", 4.05, 1.5, "binary_sensor.nook_leak")] });
  assert.equal(derive(p, states(st("binary_sensor.nook_leak", "on", "moisture")))[0].roomId, "Kitchen");
  const upstairs = plan({
    levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }],
    rooms: [room("Kitchen", 0, 0, 4, 4), room("Bedroom", 0, 0, 4, 4, { level: "L1" })],
    items: [item("u", 1, 1, "binary_sensor.up_leak", { level: "L1" })],
  });
  assert.equal(derive(upstairs, states(st("binary_sensor.up_leak", "on", "moisture")))[0].roomId, "Bedroom");
});

test("critical comes before warning, newest first inside a severity", () => {
  const p = plan({ items: [item("a", 1, 1, "binary_sensor.door"), item("b", 2, 1, "binary_sensor.old_leak"), item("c", 3, 1, "binary_sensor.new_leak")] });
  const out = derive(p, states(st("binary_sensor.door", "on", "door", 60), st("binary_sensor.old_leak", "on", "moisture", 30), st("binary_sensor.new_leak", "on", "moisture", 1)));
  assert.deepEqual(out.map((a) => a.entity), ["binary_sensor.new_leak", "binary_sensor.old_leak", "binary_sensor.door"]);
});

test("an odd device_class from Home Assistant is not a table key", () => {
  const p = plan({ items: [item("a", 1, 1, "binary_sensor.x")] });
  assert.deepEqual(derive(p, states(st("binary_sensor.x", "on", "constructor"))), []);
});

test("stored settings are checked field by field", () => {
  assert.deepEqual(cleanAlertSettings(undefined), ALERT_DEFAULTS);
  assert.deepEqual(cleanAlertSettings({ mode: "banner", sound: true, openMinutes: 30 }), { mode: "banner", sound: true, openMinutes: 30 });
  assert.deepEqual(cleanAlertSettings({ mode: "loud", sound: "yes", openMinutes: 9999 }), { ...ALERT_DEFAULTS, openMinutes: 240 });
  assert.equal(cleanAlertSettings({ openMinutes: -5 }).openMinutes, 1);
  assert.equal(cleanAlertSettings({ openMinutes: NaN }).openMinutes, ALERT_DEFAULTS.openMinutes);
});
