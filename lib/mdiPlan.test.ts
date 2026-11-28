import assert from "node:assert/strict";
import test from "node:test";
import { guestPlan } from "./guestPlan.ts";
import { cleanIconSettings, ICON_DEFAULTS, MAX_PLAN_ICONS, type MdiIcon } from "./mdi.ts";
import { iconChoice } from "./mdiAuto.ts";
import { withItemIcon, withMdiIcons } from "./mdiPlan.ts";
import type { Item, Plan } from "./types.ts";
import { splitPlanFile } from "./planFile.ts";

const LAMP: MdiIcon = { body: '<path d="M12 2a7 7 0 0 0-7 7"/>', width: 24, height: 24 };
const DOOR: MdiIcon = { body: '<path d="M12 3c-1.11 0-2 .89-2 2"/>', width: 24, height: 24 };
const item = (id: string, params?: Item["params"], entity?: string): Item => ({ id, kind: "lamp", x: 0, y: 0, rot: 0, w: 1, d: 1, h: 1, ...(params ? { params } : {}), ...(entity ? { entity } : {}) });
const plan = (items: Item[], icons?: Plan["icons"]): Plan => ({ walls: [], openings: [], rooms: [], items, ...(icons ? { icons } : {}) });

test("choosing a Material Design icon stores the pick on the item and its drawing in the plan, as one change", () => {
  const next = withItemIcon(plan([item("a"), item("b")]), "a", "mdi:lamp", LAMP);
  assert.equal(next.items[0].params?.icon, "mdi:lamp");
  assert.equal(next.items[1].params, undefined, "other items are untouched");
  assert.deepEqual(next.icons, { lamp: LAMP });
});

test("changing or clearing the pick drops the drawing nobody uses any more, and keeps one another item still names", () => {
  const two = withItemIcon(withItemIcon(plan([item("a"), item("b")]), "a", "mdi:lamp", LAMP), "b", "mdi:lamp", LAMP);
  const cleared = withItemIcon(two, "a", undefined, undefined);
  assert.deepEqual(cleared.icons, { lamp: LAMP }, "b still uses it");
  const swapped = withItemIcon(cleared, "b", "mdi:door-open", DOOR);
  assert.deepEqual(swapped.icons, { "door-open": DOOR });
  const one = withItemIcon(swapped, "b", "fan", undefined);
  assert.equal(one.icons, undefined, "no manual Material Design icon left: no field at all");
  assert.equal(one.items[1].params?.icon, "fan", "one of Doshy's own icons is stored as before");
});

test("a choice that changes nothing gives back the same plan (no empty undo step)", () => {
  const p = withItemIcon(plan([item("a")]), "a", "mdi:lamp", LAMP);
  assert.equal(withItemIcon(p, "a", "mdi:lamp", LAMP), p);
  const plain = plan([item("a")]);
  assert.equal(withItemIcon(plain, "a", undefined, undefined), plain);
});

test("params of the item that are not the icon survive a change of icon", () => {
  const p = withItemIcon(plan([item("a", { fov: 90 })]), "a", "mdi:lamp", LAMP);
  assert.deepEqual(p.items[0].params, { fov: 90, icon: "mdi:lamp" });
  assert.deepEqual(withItemIcon(p, "a", undefined, undefined).items[0].params, { fov: 90 });
});

test("a plan loaded from a hand-edited or imported file is scrubbed: bad drawings, unused icons and too-long text are dropped", () => {
  const dirty = plan([item("a", { icon: "mdi:lamp" }), item("b", { icon: "mdi:evil" }), item("c", { icon: "mdi:door-open" })], {
    lamp: LAMP,
    evil: { body: "<script>alert(1)</script>", width: 24, height: 24 },
    "door-open": { body: DOOR.body, width: 9999, height: 24 },
    unused: LAMP,
  });
  const clean = withMdiIcons(dirty);
  assert.deepEqual(clean.icons, { lamp: LAMP });
  assert.equal(withMdiIcons(clean), clean, "an already clean plan comes back as it is");
  assert.equal(withMdiIcons(plan([item("a")])).icons, undefined);
  const none = withMdiIcons(plan([item("a")], { lamp: LAMP }));
  assert.equal("icons" in none, false, "nothing used: the field goes");
});

test("a guest link carries the drawings of the picked icons and nothing else, and keeps the pick although it has a colon", () => {
  const stored = plan([item("a", { icon: "mdi:lamp", secret: "light.kitchen" }, "light.kitchen"), item("b", { icon: "mdi:evil" })], {
    lamp: LAMP,
    evil: { body: "<script/>", width: 24, height: 24 },
    other: DOOR,
  });
  const { plan: seen } = guestPlan(stored, { location: false, live: false });
  assert.deepEqual(seen.icons, { lamp: LAMP });
  assert.equal(seen.items[0].params?.icon, "mdi:lamp");
  assert.equal(seen.items[0].params?.secret, undefined, "an entity-looking param is still dropped");
  assert.equal(seen.items[0].entity, undefined);
  assert.equal(JSON.stringify(seen).includes("light.kitchen"), false);
});

test("the marker's icon: the owner's pick always wins, then Home Assistant's, and Doshy's own mode asks nothing of Home Assistant", () => {
  const door = { state: "on", attributes: { device_class: "door" } };
  assert.deepEqual(iconChoice({ icon: "fan" }, "binary_sensor.d", door, "ha"), { own: "fan" });
  assert.deepEqual(iconChoice({ icon: "mdi:lamp" }, "binary_sensor.d", door, "ha"), { mdi: "lamp" });
  assert.deepEqual(iconChoice(undefined, "binary_sensor.d", door, "ha"), { mdi: "door-open" });
  assert.deepEqual(iconChoice(undefined, "binary_sensor.d", { state: "off", attributes: { device_class: "door" } }, "ha"), { mdi: "door-closed" }, "follows the state");
  assert.deepEqual(iconChoice(undefined, "light.a", { state: "on", attributes: { icon: "mdi:lightbulb-group" } }, "ha"), { mdi: "lightbulb-group" });
  assert.deepEqual(iconChoice(undefined, "binary_sensor.d", door, "doshy"), {}, "Doshy's own: nothing automatic");
  assert.deepEqual(iconChoice({ icon: "mdi:lamp" }, "binary_sensor.d", door, "doshy"), { mdi: "lamp" }, "a pick still shows");
  assert.deepEqual(iconChoice(undefined, undefined, undefined, "ha"), {}, "an unlinked item is unchanged");
  assert.deepEqual(iconChoice(undefined, "zzz.a", { state: "on", attributes: {} }, "ha"), {}, "no icon for that kind: today's icon");
  assert.deepEqual(iconChoice({ icon: "not-an-icon" }, "light.a", { state: "on", attributes: {} }, "ha"), { mdi: "lightbulb" }, "a stale value is no pick");
});

test("the Device icons setting defaults to Home Assistant and survives garbage", () => {
  assert.deepEqual(cleanIconSettings(undefined), ICON_DEFAULTS);
  assert.deepEqual(cleanIconSettings({ source: "doshy", recent: ["lamp", "../x", "lamp", 5] }), { source: "doshy", recent: ["lamp"] });
  assert.equal(cleanIconSettings({ source: "banana" }).source, "ha");
});

test("exported JSON imports with only referenced sanitized drawings", () => {
  const chosen = withItemIcon(plan([item("a")]), "a", "mdi:lamp", LAMP);
  const file = JSON.parse(JSON.stringify({ ...chosen, icons: { ...chosen.icons, unused: DOOR, evil: { body: "<script/>", width: 24, height: 24 } } }));
  const imported = splitPlanFile(file).plan;
  assert.deepEqual(imported.icons, { lamp: LAMP });
  const guest = guestPlan(imported, { location: false, live: false }).plan;
  assert.deepEqual(guest.icons, { lamp: LAMP });
  assert.equal(iconChoice(guest.items[0].params, undefined, undefined, "ha").mdi, "lamp");
});

test("a full portable icon map never accepts a manual pick whose drawing would be dropped", () => {
  const items = Array.from({ length: MAX_PLAN_ICONS }, (_, n) => item(`i-${n}`, { icon: `mdi:icon-${n}` }));
  const full = plan([...items, item("extra")], Object.fromEntries(items.map((_, n) => [`icon-${n}`, LAMP])));
  assert.equal(withItemIcon(full, "extra", "mdi:door-open", DOOR), full);
  assert.equal(withItemIcon(full, "missing-item", "mdi:lamp", LAMP), full);
  assert.equal(withItemIcon(full, "extra", "mdi:icon-0", LAMP).items.at(-1)?.params?.icon, "mdi:icon-0");
});
