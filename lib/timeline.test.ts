import assert from "node:assert/strict";
import { test } from "node:test";
import type { HAState } from "./ha.ts";
import { advance, clampTime, createReplayer, dayMarks, eventTicks, indexAt, parseReplay, replayEntities, stateAt, statesAt, sunTicks, type ReplayWire } from "./timeline.ts";
import type { Plan } from "./types.ts";

const H = 3_600_000;
const T0 = new Date(2026, 5, 10, 12, 0, 0).getTime(); // local noon
const wire = (entities: ReplayWire["entities"], over: Partial<ReplayWire> = {}): ReplayWire => ({ from: T0, to: T0 + 24 * H, bucketMs: 60_000, entities, ...over });

const lightHistory: ReplayWire["entities"] = {
  "light.lamp": [[T0, "off"], [T0 + H, "on", { brightness: 200, rgb_color: [255, 0, 0] }], [T0 + 2 * H, "off"]],
  "binary_sensor.door": [[T0, "off"], [T0 + H, "on"], [T0 + 2 * H, "off"], [T0 + 5 * H, "on"]],
  "sun.sun": [[T0, "above_horizon"], [T0 + 6 * H, "below_horizon"], [T0 + 18 * H, "above_horizon"]],
};

const live = (id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id: id, state, attributes });

test("parseReplay keeps good events, drops bad ones, sorts and validates attributes", () => {
  const tl = parseReplay(
    wire({
      "sensor.t": [[T0 + 2, "21"], [T0, "20"], ["x" as unknown as number, "9"], [T0 + 1, 5 as unknown as string], [T0 + 3, "22", { current_temperature: 22, "Bad Key": 1, long: "x".repeat(200), list: [1, 2], nested: { a: 1 } } as never]],
      "Not An Id": [[T0, "1"]],
      "sensor.empty": [],
    }),
  );
  assert.deepEqual(Object.keys(tl.tracks), ["sensor.t"]);
  assert.deepEqual(tl.tracks["sensor.t"].t, [T0, T0 + 2, T0 + 3]);
  assert.deepEqual(tl.tracks["sensor.t"].a[2], { current_temperature: 22, list: [1, 2] });
});

test("parseReplay refuses an answer that is not the wire format", () => {
  for (const bad of [null, [], {}, { from: 1, to: 2, bucketMs: 60_000 }, wire({}, { to: T0 }), wire({}, { bucketMs: 0 }), wire({}, { to: T0 + 30 * 24 * H })]) assert.throws(() => parseReplay(bad), /expected shape/);
});

test("indexAt / stateAt: binary search edges", () => {
  const tl = parseReplay(wire(lightHistory));
  const tr = tl.tracks["light.lamp"];
  assert.equal(indexAt(tr, T0 - 1), -1, "before the first sample");
  assert.equal(indexAt(tr, T0), 0, "exactly on a sample");
  assert.equal(indexAt(tr, T0 + H - 1), 0);
  assert.equal(indexAt(tr, T0 + H), 1);
  assert.equal(indexAt(tr, T0 + 99 * H), 2, "after the last one it holds");
  assert.equal(stateAt(tl, "light.lamp", T0 - 1), undefined);
  assert.equal(stateAt(tl, "light.nope", T0), undefined);
  assert.deepEqual(stateAt(tl, "light.lamp", T0 + H + 5), { t: T0 + H, state: "on", attrs: { brightness: 200, rgb_color: [255, 0, 0] } });
  assert.equal(indexAt({ t: [], s: [], a: [] }, T0), -1);
});

test("statesAt: tracked entities come from history over the live static attributes, the rest stay live", () => {
  const tl = parseReplay(wire(lightHistory));
  const now = {
    "light.lamp": live("light.lamp", "off", { friendly_name: "Lamp", brightness: 10, supported_color_modes: ["rgb"] }),
    "binary_sensor.door": live("binary_sensor.door", "off", { friendly_name: "Door", device_class: "door" }),
    "weather.home": live("weather.home", "sunny"),
    "sun.sun": live("sun.sun", "above_horizon", { elevation: 40 }),
  };
  const at = statesAt(tl, T0 + H + 60_000, now);
  assert.equal(at["light.lamp"].state, "on");
  assert.deepEqual(at["light.lamp"].attributes, { friendly_name: "Lamp", supported_color_modes: ["rgb"], brightness: 200, rgb_color: [255, 0, 0] }, "live brightness is not borrowed");
  assert.equal(at["light.lamp"].last_changed, new Date(T0 + H).toISOString());
  assert.equal(at["binary_sensor.door"].state, "on");
  assert.equal(at["binary_sensor.door"].attributes.device_class, "door");
  assert.equal(at["weather.home"], now["weather.home"], "untracked: the very same object");
  assert.equal(at["sun.sun"], now["sun.sun"], "the sun's readings (and so the sky) stay live");
});

test("statesAt: before the first sample an entity shows unknown, still named; the cursor at the end holds the last state", () => {
  const tl = parseReplay(wire({ "light.lamp": [[T0 + H, "on"]] }));
  const now = { "light.lamp": live("light.lamp", "off", { friendly_name: "Lamp" }), "light.gone": live("light.gone", "on") };
  const early = statesAt(tl, T0, now);
  assert.equal(early["light.lamp"].state, "unknown");
  assert.equal(early["light.lamp"].attributes.friendly_name, "Lamp");
  assert.equal(early["light.lamp"].last_changed, undefined);
  assert.equal(statesAt(tl, T0 + 24 * H, now)["light.lamp"].state, "on");
  assert.equal(statesAt(tl, T0, {})["light.lamp"], undefined, "an entity Home Assistant no longer has is not invented");
});

test("a replayer keeps object identity for what did not change and the same map when nothing did", () => {
  const tl = parseReplay(wire(lightHistory));
  const now = { "light.lamp": live("light.lamp", "off"), "binary_sensor.door": live("binary_sensor.door", "off") };
  const at = createReplayer(tl, now);
  const a = at(T0 + 10);
  const b = at(T0 + 20);
  assert.equal(b, a, "no change: the same map");
  const c = at(T0 + H + 10); // the lamp and the door both changed at +1 h
  assert.notEqual(c, a);
  const d = at(T0 + 3 * H); // the lamp changed at +2 h, the door too; go to a time where only the lamp differs from c
  assert.equal(d["light.lamp"].state, "off");
  const e = at(T0 + 3 * H + 1000);
  assert.equal(e, d);
  const f = at(T0 + 5 * H); // only the door changes (+5 h)
  assert.equal(f["light.lamp"], d["light.lamp"], "unchanged entity keeps its object");
  assert.notEqual(f["binary_sensor.door"], d["binary_sensor.door"]);
});

test("eventTicks: closed -> open moments inside the window, oldest first; the first reading is not an event", () => {
  const tl = parseReplay(wire({ ...lightHistory, "cover.blind": [[T0, "open"], [T0 + 3 * H, "closing"], [T0 + 4 * H, "opening"]] }));
  assert.deepEqual(eventTicks(tl, ["binary_sensor.door", "cover.blind", "light.none"], T0, T0 + 24 * H), [
    { t: T0 + H, id: "binary_sensor.door" },
    { t: T0 + 4 * H, id: "cover.blind" },
    { t: T0 + 5 * H, id: "binary_sensor.door" },
  ]);
  assert.deepEqual(eventTicks(tl, ["binary_sensor.door"], T0 + 2 * H, T0 + 4 * H), []);
});

test("sunTicks reads sunrise and sunset from the sun's changes", () => {
  const tl = parseReplay(wire(lightHistory));
  assert.deepEqual(sunTicks(tl), [{ t: T0 + 6 * H, kind: "sunset" }, { t: T0 + 18 * H, kind: "sunrise" }]);
  assert.deepEqual(sunTicks(parseReplay(wire({ "light.lamp": [[T0, "on"]] }))), []);
});

test("dayMarks: local midnights strictly inside the span", () => {
  const marks = dayMarks(T0, T0 + 24 * H);
  assert.equal(marks.length, 1);
  assert.equal(new Date(marks[0].t).getHours(), 0);
  assert.equal(dayMarks(T0, T0 + 3600_000).length, 0);
  assert.equal(dayMarks(T0, T0 + 7 * 24 * H).length, 7);
});

const plan = (over: Partial<Plan>): Plan => ({ walls: [], openings: [], rooms: [], items: [], ...over }) as Plan;

test("replayEntities: linked entities present in the states, sun first, lights then covers then doors, climate, other devices, sensors, capped", () => {
  const ids = ["sensor.power", "sensor.temp", "light.a", "cover.c", "binary_sensor.d", "climate.k", "switch.s", "sun.sun", "binary_sensor.pir"];
  const states = Object.fromEntries(ids.map((id) => [id, live(id, "x")]));
  const p = plan({
    items: [
      { id: "1", kind: "sofa", x: 0, y: 0, rot: 0, entity: "sensor.power" } as never,
      { id: "2", kind: "lamp", x: 0, y: 0, rot: 0, entity: "light.a", params: { soc: "sensor.temp", calX: 3, note: "not an id", ghost: "light.missing" } } as never,
      { id: "3", kind: "x", x: 0, y: 0, rot: 0, entity: "switch.s" } as never,
    ],
    openings: [{ id: "o", wallId: "w", t: 0.5, width: 1, height: 1, entity: "cover.c" } as never, { id: "o2", wallId: "w", t: 0.5, width: 1, height: 1, entity: "binary_sensor.d" } as never],
    rooms: [{ id: "r", name: "R", x: 0, y: 0, w: 1, h: 1, floor: "wood", tempEntity: "climate.k", presenceEntities: ["binary_sensor.pir"] } as never],
  });
  assert.deepEqual(replayEntities(p, states), ["sun.sun", "light.a", "cover.c", "binary_sensor.d", "binary_sensor.pir", "climate.k", "switch.s", "sensor.power", "sensor.temp"]);
  assert.deepEqual(replayEntities(p, states, ["light.missing", "light.a"]), ["sun.sun", "light.a", "cover.c", "binary_sensor.d", "binary_sensor.pir", "climate.k", "switch.s", "sensor.power", "sensor.temp"]);

  const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`sensor.s${i}`, live(`sensor.s${i}`, "1")]));
  const big = plan({ items: Object.keys(many).map((entity, i) => ({ id: String(i), kind: "x", x: 0, y: 0, rot: 0, entity }) as never) });
  assert.equal(replayEntities(big, many).length, 120);
});

test("time helpers", () => {
  assert.equal(clampTime(5, 10, 20), 10);
  assert.equal(clampTime(25, 10, 20), 20);
  assert.deepEqual(advance(1000, 250, 60, 1_000_000), { at: 16_000, end: false });
  assert.deepEqual(advance(990_000, 250, 60, 1_000_000), { at: 1_000_000, end: true });
});
