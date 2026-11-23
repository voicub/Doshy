import assert from "node:assert/strict";
import test from "node:test";
import { DEVICE_ICONS, iconOf, searchIcons, withIcon } from "./deviceIcons.ts";

test("ids are unique and every icon has a plain name and search words", () => {
  assert.equal(new Set(DEVICE_ICONS.map((i) => i.id)).size, DEVICE_ICONS.length);
  for (const i of DEVICE_ICONS) assert.ok(i.label.length > 1 && i.words.length > 1, i.id);
});

test("search needs every typed word and puts name matches first", () => {
  assert.ok(searchIcons("lamp").some((i) => i.id === "lamp"));
  assert.equal(searchIcons("lamp")[0].id, "lamp", "the icon named Table lamp beats the ones that only list lamp as a word");
  assert.deepEqual(searchIcons("zzzz"), []);
  assert.equal(searchIcons("  ").length, DEVICE_ICONS.length);
  assert.ok(searchIcons("door open").every((i) => /door/.test(`${i.label} ${i.words}`.toLowerCase())));
});

test("a stale or hand-edited icon value counts as none", () => {
  assert.equal(iconOf({ icon: "fan" }), "fan");
  assert.equal(iconOf({ icon: "not-an-icon" }), undefined);
  assert.equal(iconOf({ icon: 3 }), undefined);
  assert.equal(iconOf(undefined), undefined);
});

test("setting and clearing the icon keeps every other param", () => {
  assert.deepEqual(withIcon({ fov: 90 }, "camera"), { fov: 90, icon: "camera" });
  assert.deepEqual(withIcon({ fov: 90, icon: "camera" }, "bell"), { fov: 90, icon: "bell" });
  assert.deepEqual(withIcon({ fov: 90, icon: "camera" }, undefined), { fov: 90 });
  assert.equal(withIcon({ icon: "camera" }, undefined), undefined, "no params left: none at all");
  assert.deepEqual(withIcon({ fov: 90 }, "bogus"), { fov: 90 }, "an unknown id is never stored");
});
