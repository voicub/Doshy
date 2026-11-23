import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATEGORIES } from "./catalog.ts";
import { SECURITY } from "./catalog.security.ts";
import { lastMotion, securityDomains, securityLook } from "./securityLook.ts";
import type { HAState } from "./ha.ts";
import type { Item, Plan } from "./types.ts";

const TOL = 0.012;
const st = (entity_id: string, state: string): HAState => ({ entity_id, state, attributes: {} });

test("every security piece is a sane, uniquely named catalog entry", () => {
  const ids = Object.keys(SECURITY);
  assert.ok(ids.length >= 6);
  for (const id of ids) {
    const d = SECURITY[id];
    assert.ok(id.startsWith("sec_"), id);
    assert.equal(CATALOG[id], d, `${id} is merged into the catalog`);
    assert.equal(d.cat, "Security");
    assert.ok(CATEGORIES.includes(d.cat));
    assert.ok(d.w > 0 && d.d > 0 && d.h > 0, id);
    for (const p of d.parts) {
      assert.ok(!p.r || (Math.abs(p.r[0] - Math.PI / 2) < 1e-9 && !p.r[1] && !p.r[2]), `${id}: only quarter turns about x are modelled here`);
      const hx = p.s[0] / 2;
      const hz = (p.r ? p.s[1] : p.s[2]) / 2; // a cylinder turned onto its side is as long as its height along z
      assert.ok(Math.abs(p.p[0]) + hx <= d.w / 2 + TOL, `${id}: part sticks out sideways`);
      assert.ok(Math.abs(p.p[2]) + hz <= d.d / 2 + TOL, `${id}: part sticks out front/back`);
      assert.ok(p.p[1] >= -TOL && p.p[1] <= d.h + TOL, `${id}: part is outside the height`);
    }
    assert.ok(d.parts.some((p) => p.glow), `${id} has a status light`);
  }
});

test("cameras and the alarm can be linked to the right kinds of entity only", () => {
  assert.deepEqual(securityDomains("sec_cam_bullet"), ["camera"]);
  assert.deepEqual(securityDomains("sec_doorbell_cam"), ["camera"]);
  assert.ok(securityDomains("sec_alarm_panel")?.includes("alarm_control_panel"));
  assert.equal(securityDomains("ektorp"), undefined);
  for (const id of Object.keys(SECURITY)) assert.ok(securityDomains(id), id);
});

test("a camera shows a red recording dot, a dim standby dot, or nothing", () => {
  const rec = securityLook("sec_cam_bullet", st("camera.a", "recording"))!;
  assert.equal(rec.level, 1);
  assert.ok(rec.rgb[0] > 200 && rec.rgb[1] < 100 && rec.pulse > 0);
  const idle = securityLook("sec_cam_bullet", st("camera.a", "idle"))!;
  assert.ok(idle.level > 0 && idle.level < 0.5 && idle.pulse === 0);
  assert.equal(securityLook("sec_cam_bullet", st("camera.a", "unavailable"))!.level, 0);
  assert.equal(securityLook("sec_cam_bullet", undefined), undefined);
});

test("the alarm panel is green when disarmed, red when armed, amber while arming and flashes when triggered", () => {
  const look = (s: string) => securityLook("sec_alarm_panel", st("alarm_control_panel.home", s))!;
  assert.ok(look("disarmed").rgb[1] > look("disarmed").rgb[0]);
  assert.ok(look("armed_away").rgb[0] > 200 && look("armed_away").pulse === 0);
  assert.ok(look("arming").pulse > 0 && look("arming").rgb[0] > 200 && look("arming").rgb[1] > 120);
  assert.ok(look("triggered").pulse > 2);
  assert.equal(look("unavailable").level, 0);
});

test("motion near a camera comes from the motion sensors in its room only", () => {
  const room = (id: string, x: number): Plan["rooms"][number] => ({ id, name: id, x, y: 0, w: 4, h: 4, color: "#fff", floor: "wood" });
  const item = (id: string, kind: string, x: number, entity?: string): Item => ({ id, kind, x, y: 2, rot: 0, w: 0.1, d: 0.1, h: 0.1, ...(entity ? { entity } : {}) });
  const plan: Plan = {
    walls: [],
    openings: [],
    rooms: [room("a", 0), room("b", 5)],
    items: [item("cam", "sec_cam_bullet", 1, "camera.a"), item("m1", "x", 2, "binary_sensor.pir_a"), item("m2", "x", 6, "binary_sensor.pir_b"), item("d1", "x", 3, "binary_sensor.door_a")],
  };
  const sensor = (id: string, state: string, cls: string, at: string): HAState => ({ entity_id: id, state, attributes: { device_class: cls }, last_changed: at });
  const states = {
    "binary_sensor.pir_a": sensor("binary_sensor.pir_a", "off", "motion", "2026-01-01T10:00:00Z"),
    "binary_sensor.pir_b": sensor("binary_sensor.pir_b", "on", "motion", "2026-01-01T11:00:00Z"),
    "binary_sensor.door_a": sensor("binary_sensor.door_a", "on", "door", "2026-01-01T12:00:00Z"),
  };
  assert.deepEqual(lastMotion(plan, states, plan.items[0]), { now: false, at: "2026-01-01T10:00:00Z" });
  assert.equal(lastMotion({ ...plan, items: [plan.items[0]] }, states, plan.items[0]), undefined);
});
