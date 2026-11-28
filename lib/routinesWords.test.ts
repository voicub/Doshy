import test from "node:test";
import assert from "node:assert/strict";
import { validateRecipe, type World } from "./automations.ts";
import { detectRoutines, type RoutineSuggestion, type Suggestion } from "./routines.ts";
import { ZONE, anchor, changes, daysBefore, DAY_MS, merge, noon } from "./routinesFixture.ts";
import { EMPTY_PREFS, SNOOZE_MS, dismiss, isHidden, parsePrefs, pendingCount, snooze, withScan } from "./routinesPrefs.ts";
import { recipeOf } from "./routinesRecipe.ts";
import { wordsOf } from "./routinesWords.ts";
import { STATES } from "./sceneFixture.ts";

const TODAY = "2026-11-20";
const NOW = noon(TODAY);
const name = (e: string) => STATES[e]?.attributes.friendly_name ?? e;
const world: World = { states: { ...STATES, "zone.home": { state: "1", attributes: {} } }, notify: [] };

function found(entities: Parameters<typeof detectRoutines>[0]["entities"]): Suggestion[] {
  const from = NOW - 23 * DAY_MS;
  return detectRoutines({ entities: { "binary_sensor.anchor": anchor(from, NOW), ...entities }, from, to: NOW, now: NOW, windowDays: 21, zone: ZONE, lat: 44.43, lon: 26.1 });
}

const days = daysBefore(TODAY, 21);
const nightly = found({ "light.kitchen_ceiling": merge(changes(days, "18:00", "on"), changes(days, "23:10", "off", [-3, 0, 4])) });

test("a suggestion is said in three plain parts that name the device, the time and the evidence", () => {
  const [s] = nightly;
  assert.ok(s && s.kind === "routine");
  const w = wordsOf(s, name);
  assert.match(w.habit, /Kitchen ceiling/);
  assert.match(w.habit, /23:\d\d/);
  assert.match(w.habit, /every night/);
  assert.match(w.seen, new RegExp(`${s.support.n}`));
  assert.match(w.seen, new RegExp(`${s.support.of}`));
  assert.match(w.question, /\?$/);
  assert.match(w.question, /automatically/);
});

test("a suggestion made into a recipe passes the same validation the server runs", () => {
  const [s] = nightly;
  const recipe = recipeOf(s, { onlyHome: false });
  assert.equal(recipe.type, "device-at");
  assert.equal(validateRecipe(recipe, world).ok, true);
  const edited = recipeOf(s, { onlyHome: false, time: "22:45" });
  assert.ok(edited.type === "device-at" && edited.time === "22:45");
  assert.equal(validateRecipe(edited, world).ok, true);
  assert.equal(validateRecipe(recipeOf(s, { onlyHome: false, time: "25:99" }), world).ok, false, "an edited time is checked too");
});

test("a 'left on' suggestion becomes the existing motion recipe", () => {
  const idle: Suggestion = { kind: "idle", id: "r00000000", entity: "light.kitchen_ceiling", motion: "binary_sensor.hall_motion", minutes: 20, hoursLeftOn: 3, support: { n: 4, of: 10 }, confidence: 0.4, strip: [], examples: [], windowDays: 21 };
  const recipe = recipeOf(idle, { onlyHome: false, minutes: 25 });
  assert.deepEqual(recipe, { type: "light-off-no-motion", motion: "binary_sensor.hall_motion", lights: ["light.kitchen_ceiling"], minutes: 25 });
  assert.equal(validateRecipe(recipe, world).ok, true);
  assert.match(wordsOf(idle, name).question, /20 minutes/);
});

test("a sun suggestion keeps its sun event and takes an edited offset", () => {
  const s: RoutineSuggestion = { kind: "routine", id: "r00000001", entity: "cover.living_blind", action: { verb: "close" }, when: { kind: "sun", event: "sunset", offset: 10, tolerance: 10, days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }, support: { n: 8, of: 10 }, confidence: 0.8, strip: [], examples: [], windowDays: 21 };
  const r = recipeOf(s, { onlyHome: false, offset: -20 });
  assert.ok(r.type === "device-sun" && r.sun === "sunset" && r.offset === -20);
  assert.equal(validateRecipe(r, world).ok, true);
  assert.match(wordsOf(s, name).question, /10 minutes after sunset/);
  assert.equal(validateRecipe(recipeOf(s, { onlyHome: false, offset: 9999 }), world).ok, true, "an absurd offset is clamped, never passed on");
});

test("what the person said is kept small and checked on every read", () => {
  const now = 1_000_000;
  let p = dismiss(EMPTY_PREFS, "r1234abcd");
  p = snooze(p, "r0000ffff", now);
  assert.ok(isHidden(p, "r1234abcd", now + 10 * SNOOZE_MS), "never means never");
  assert.ok(isHidden(p, "r0000ffff", now + SNOOZE_MS - 1));
  assert.ok(!isHidden(p, "r0000ffff", now + SNOOZE_MS + 1), "a snooze ends");
  assert.ok(!isHidden(p, "r99999999", now));
  p = withScan(p, now, ["r1234abcd", "r0000ffff", "r99999999"]);
  assert.equal(pendingCount(p, now), 1);
  assert.deepEqual(parsePrefs(JSON.parse(JSON.stringify(p))), p, "survives storage");
  assert.deepEqual(parsePrefs({ dismissed: ["r1234abcd", "x", 5, "r1234abcd"], snoozed: { r0000ffff: 5, bad: 1, r00000001: "x" }, scan: { at: "x", found: [] } }), { dismissed: ["r1234abcd"], snoozed: { r0000ffff: 5 }, scan: null });
  assert.deepEqual(parsePrefs("junk"), EMPTY_PREFS);
  assert.deepEqual(parsePrefs(null), EMPTY_PREFS);
});

test("the same idea snoozed twice does not pile up, and old snoozes are dropped", () => {
  let p = snooze(EMPTY_PREFS, "r00000001", 1000);
  p = snooze(p, "r00000002", 1000 + SNOOZE_MS + 5);
  assert.deepEqual(Object.keys(p.snoozed), ["r00000002"]);
});
