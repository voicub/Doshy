import test from "node:test";
import assert from "node:assert/strict";
import { checkPlan } from "./db/planDoc.ts";
import { byRoom, contacts, sceneDevices } from "./sceneDevices.ts";
import { PLAN, STATES } from "./sceneFixture.ts";
import { restoreSteps, snapshotFor } from "./sceneRestore.ts";
import { TEMPLATES, templateSteps } from "./sceneTemplates.ts";
import { duplicateScene, inBatches, pinnedIn, pinScene, removeSceneFrom, sceneActions, sceneOf, saveSceneIn, scenesOf, stepActions, stepOf, withScenes, type Scene } from "./scenes.ts";
import { checkBatch } from "./sceneRun.ts";

const scene = (over: Partial<Scene> = {}): Scene => ({ id: "s1", name: "Movie night", icon: "movie", steps: [{ entity: "light.living_main", on: true, brightness: 20 }], ...over });

test("a step keeps only what its device understands and clamps numbers", () => {
  assert.deepEqual(stepOf({ entity: "light.a", on: true, brightness: 250, kelvin: 20000, volume: 5, position: 3 }), { entity: "light.a", on: true, brightness: 100, kelvin: 9000 });
  assert.deepEqual(stepOf({ entity: "cover.a", position: 140 }), { entity: "cover.a", position: 100 });
  assert.deepEqual(stepOf({ entity: "cover.a", on: false }), { entity: "cover.a", position: 0 });
  assert.deepEqual(stepOf({ entity: "climate.a", temperature: 21.3 }), { entity: "climate.a", temperature: 21.5 });
  assert.deepEqual(stepOf({ entity: "media_player.a", on: true, volume: 40.4 }), { entity: "media_player.a", on: true, volume: 40 });
  assert.deepEqual(stepOf({ entity: "scene.evening" }), { entity: "scene.evening", run: true });
  assert.deepEqual(stepOf({ entity: "light.a", on: true, rgb: [1, 2, 3], kelvin: 3000 }), { entity: "light.a", on: true, rgb: [1, 2, 3] });
});

test("a step that is not usable is dropped, and domains outside the list never get in", () => {
  const bad: unknown[] = [null, 5, {}, { entity: "lock.front_door", on: false }, { entity: "alarm_control_panel.home", on: true }, { entity: "button.restart", on: true }, { entity: "light.a b", on: true }, { entity: "light.a" }, { entity: "climate.a" }];
  for (const b of bad) assert.equal(stepOf(b), null);
  assert.equal(stepOf({ entity: "light.a", on: true, rgb: [1, 2, 999] })?.rgb, undefined);
});

test("a saved scene is scrubbed: name, icon, duplicate devices, limits", () => {
  const s = sceneOf({ id: "x1", name: "  Cosy\u0007 evening  ", icon: "nope", steps: [{ entity: "light.a", on: true, brightness: 10 }, { entity: "light.a", on: false }, { entity: "lock.x", on: true }], pin: ["r1", 5] });
  assert.deepEqual(s, { id: "x1", name: "Cosy evening", icon: "custom", steps: [{ entity: "light.a", on: false }], pin: ["r1"] });
  assert.equal(sceneOf({ id: "bad id!", name: "x", steps: [] }), null);
  assert.equal(sceneOf({ id: "a", name: "   ", steps: [] }), null);
  const many = Array.from({ length: 80 }, (_, i) => ({ id: `s${i}`, name: `n${i}`, icon: "custom", steps: [] }));
  assert.equal(scenesOf(many)?.length, 40);
  assert.equal(scenesOf([scene(), scene()])?.length, 1, "ids are unique");
  assert.equal(scenesOf("x"), undefined);
});

test("a plan keeps its scenes through load, export and a copy, and a plan without scenes stays without", () => {
  const plain = { ...PLAN };
  assert.equal(withScenes(plain), plain);
  assert.equal("scenes" in withScenes(plain), false);
  const mine = saveSceneIn(PLAN, scene());
  assert.equal(withScenes(mine), mine, "already clean: the same object");
  const copy: unknown = JSON.parse(JSON.stringify(mine));
  assert.deepEqual(withScenes(copy as typeof mine).scenes, mine.scenes);
  const dirty = withScenes({ ...mine, scenes: [...(mine.scenes ?? []), { id: "z", name: "", steps: [] } as never] });
  assert.equal(dirty.scenes?.length, 1);
  assert.deepEqual(JSON.parse(checkPlan(mine).json).scenes, mine.scenes, "the server keeps the field");
});

test("save, replace, remove, duplicate and pin", () => {
  let p = saveSceneIn(PLAN, scene());
  p = saveSceneIn(p, scene({ name: "Renamed" }));
  assert.deepEqual(p.scenes?.map((s) => s.name), ["Renamed"]);
  assert.equal(saveSceneIn(p, { id: "bad id", name: "x", icon: "custom", steps: [] }), p);
  const copy = duplicateScene(scene(), "s2", ["Movie night copy"]);
  assert.equal(copy.name, "Movie night 2");
  p = pinScene(p, "s1", "bed", true);
  assert.deepEqual(pinnedIn(p, "bed").map((s) => s.id), ["s1"]);
  assert.deepEqual(pinnedIn(pinScene(p, "s1", "bed", false), "bed"), []);
  assert.equal(removeSceneFrom(p, "s1").scenes?.length, 0);
  assert.equal(removeSceneFrom(p, "nope"), p);
});

test("a step becomes the service calls Home Assistant takes", () => {
  assert.deepEqual(stepActions({ entity: "light.a", on: true, brightness: 30, kelvin: 2700 }), [{ domain: "light", service: "turn_on", entity_id: "light.a", data: { brightness_pct: 30, color_temp_kelvin: 2700 } }]);
  assert.deepEqual(stepActions({ entity: "light.a", on: true }), [{ domain: "light", service: "turn_on", entity_id: "light.a" }]);
  assert.deepEqual(stepActions({ entity: "light.a", on: false }).map((a) => a.service), ["turn_off"]);
  assert.deepEqual(stepActions({ entity: "cover.a", position: 0 }).map((a) => a.service), ["close_cover"]);
  assert.deepEqual(stepActions({ entity: "cover.a", position: 100 }).map((a) => a.service), ["open_cover"]);
  assert.deepEqual(stepActions({ entity: "cover.a", position: 40 }), [{ domain: "cover", service: "set_cover_position", entity_id: "cover.a", data: { position: 40 } }]);
  assert.deepEqual(stepActions({ entity: "media_player.a", on: true, volume: 25 }).map((a) => [a.service, a.data]), [["turn_on", undefined], ["volume_set", { volume_level: 0.25 }]]);
  assert.deepEqual(stepActions({ entity: "climate.a", temperature: 21 })[0].data, { temperature: 21 });
  assert.deepEqual(stepActions({ entity: "script.bye" }).map((a) => `${a.domain}.${a.service}`), ["script.turn_on"]);
  assert.equal(inBatches(Array.from({ length: 95 }, (_, i) => i)).map((b) => b.length).join(), "40,40,15");
});

test("every call of every template passes the server's validation", () => {
  const devices = sceneDevices(PLAN, STATES);
  for (const t of TEMPLATES) {
    const calls = sceneActions({ steps: templateSteps(t.id, devices) });
    if (!calls.length) continue; // the blank template
    const r = checkBatch({ actions: calls.slice(0, 40) }, STATES);
    assert.equal(r.ok, true, `${t.name}: ${r.ok ? "" : r.error}`);
  }
  assert.deepEqual(templateSteps("custom", devices), []);
});

test("templates pick sensible targets: dim the TV room, close curtains, leave the garage and the server alone", () => {
  const devices = sceneDevices(PLAN, STATES);
  const movie = templateSteps("movie", devices);
  assert.deepEqual(movie.find((s) => s.entity === "light.living_main"), { entity: "light.living_main", on: true, brightness: 15, kelvin: 2200 });
  assert.deepEqual(movie.find((s) => s.entity === "light.kitchen_ceiling"), { entity: "light.kitchen_ceiling", on: false });
  assert.deepEqual(movie.find((s) => s.entity === "cover.living_blind"), { entity: "cover.living_blind", position: 0 });
  assert.equal(movie.some((s) => s.entity === "cover.garage_door"), false);
  assert.equal(movie.some((s) => s.entity === "switch.server"), false);
  assert.deepEqual(movie.find((s) => s.entity === "media_player.living_tv"), { entity: "media_player.living_tv", on: true });
  const away = templateSteps("away", devices);
  assert.equal(away.find((s) => s.entity === "climate.living")?.temperature, 17);
  assert.equal(away.some((s) => s.entity === "switch.server"), false);
});

test("devices are grouped by room, each once, and the garage door is never offered", () => {
  const devices = sceneDevices(PLAN, STATES);
  assert.equal(devices.some((d) => d.entity === "cover.garage_door"), false);
  assert.equal(new Set(devices.map((d) => d.entity)).size, devices.length);
  const groups = byRoom(devices);
  assert.deepEqual(groups.map((g) => g.room).slice(0, 3), ["Bedroom", "Living room", "Kitchen"]);
  assert.deepEqual(groups[0].devices.map((d) => d.kind).sort(), ["cover", "light", "light"]);
  const bulb = devices.find((d) => d.entity === "light.bedroom_ceiling");
  assert.deepEqual({ dim: bulb?.dimmable, k: bulb?.kelvin }, { dim: true, k: [2700, 6500] });
  assert.equal(devices.find((d) => d.entity === "light.bedroom_lamp")?.dimmable, false);
  assert.deepEqual(devices.find((d) => d.entity === "climate.living")?.limits, { min: 7, max: 30, step: 0.5 });
});

test("window sensors are found by the wall they sit in", () => {
  const c = contacts(PLAN, STATES);
  assert.deepEqual(c.map((x) => [x.entity, x.room]).sort(), [["binary_sensor.bathroom_window", "Bathroom"], ["binary_sensor.kitchen_window", "Kitchen"]]);
});

test("restore puts a device back as it was", () => {
  const steps = [{ entity: "light.bedroom_ceiling", on: true as const, brightness: 10 }, { entity: "light.bedroom_lamp", on: true as const }, { entity: "cover.bedroom_curtain", position: 0 }, { entity: "media_player.living_tv", on: true as const }, { entity: "climate.living", temperature: 17 }, { entity: "scene.evening", run: true as const }];
  const before = snapshotFor(steps, STATES);
  assert.equal("scene.evening" in before, false);
  const back = restoreSteps(before);
  assert.deepEqual(back.find((s) => s.entity === "light.bedroom_ceiling"), { entity: "light.bedroom_ceiling", on: true, brightness: 50, kelvin: 3000 });
  assert.deepEqual(back.find((s) => s.entity === "light.bedroom_lamp"), { entity: "light.bedroom_lamp", on: false });
  assert.deepEqual(back.find((s) => s.entity === "cover.bedroom_curtain"), { entity: "cover.bedroom_curtain", position: 100 });
  assert.deepEqual(back.find((s) => s.entity === "media_player.living_tv"), { entity: "media_player.living_tv", on: false });
  assert.deepEqual(back.find((s) => s.entity === "climate.living"), { entity: "climate.living", temperature: 21 });
  assert.equal(checkBatch({ actions: sceneActions({ steps: back }) }, STATES).ok, true, "the way back passes the same validation");
});
