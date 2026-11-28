import assert from "node:assert/strict";
import test from "node:test";
import type { HAState } from "./ha.ts";
import { guestPlan } from "./guestPlan.ts";
import { callHaService, type HaFetch } from "./server/haCall.ts";
import {
  MAX_LINES, MAX_POINTS, addLine, dropLevelLines, duplicateLine, lineOf, moveLine, movePoint, patchLine, removeLine, reverseLine, sanitizeUtilities, splitSegment, utilityDomains,
  widthOf, withUtilities, type UtilityKind, type UtilityLine,
} from "./utilities.ts";
import { buildGraph, traceFrom } from "./utilitiesGraph.ts";
import { closedValves, mediumOfAlert, suggestShutoff, valveCall, valveState } from "./utilitiesShutoff.ts";
import type { Item, Plan } from "./types.ts";

const line = (id: string, kind: UtilityKind, pts: [number, number][], extra: Partial<UtilityLine> = {}): UtilityLine => ({ id, kind, pts: pts.map(([x, y]) => ({ x, y })), ...extra });
const item = (id: string, kind: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, kind, x, y, rot: 0, w: 0.2, d: 0.2, h: 0.2, ...extra });
const house = (utilities: UtilityLine[], items: Item[], extra: Partial<Plan> = {}): Plan => ({
  walls: [], openings: [], items, utilities,
  rooms: [{ id: "kit", name: "Kitchen", x: 5, y: 0, w: 5, h: 3, color: "#fff", floor: "wood" }, { id: "bath", name: "Bathroom", x: 0, y: 6, w: 5, h: 4, color: "#fff", floor: "tile" }],
  ...extra,
});
const st = (entity_id: string, state: string): HAState => ({ entity_id, state, attributes: {} });

// the water supply used by most tests: a main along y = 5 with a kitchen branch (T joint at 6,5) and a bathroom branch (T joint at 3,5)
const WATER = [
  line("main", "cold", [[0, 5], [10, 5]]),
  line("kitchen", "cold", [[6, 5], [6, 1], [9, 1]]),
  line("bath", "cold", [[3, 5], [3, 9]]),
];
const MAIN_VALVE = item("vmain", "ut_water_main", 1, 5, { entity: "valve.main_water" });
const ZONE_VALVE = item("vzone", "ut_zone_valve", 6, 3, { entity: "valve.kitchen_water" });
const KITCHEN_LEAK = item("leak", "sn_leak_puck", 7.5, 1.2, { entity: "binary_sensor.kitchen_leak" });
const BATH_LEAK = item("bleak", "sn_leak_puck", 3.2, 8, { entity: "binary_sensor.bath_leak" });

const trace = (p: Plan, sensor: Item, closed: string[] = []) => traceFrom(buildGraph(p, "water"), { x: sensor.x, y: sensor.y, level: "L0" }, new Set(closed));
const ids = (list: { itemId: string }[]) => list.map((v) => v.itemId);

// ---- the saved data ----------------------------------------------------------------------------------------------------------------------------------------

test("a saved plan keeps its valid pipes and loses broken ones; a plan without pipes stays without", () => {
  const good = line("a", "cold", [[0, 0], [2, 0]], { level: "L1", h: 2.4, width: 0.03, name: "Kitchen supply" });
  const clean = sanitizeUtilities([
    good, { ...good }, { id: "bad id", kind: "cold", pts: good.pts }, { id: "k", kind: "steam", pts: good.pts }, { id: "one", kind: "gas", pts: [{ x: 0, y: 0 }] },
    { id: "same", kind: "gas", pts: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }, { id: "far", kind: "gas", pts: [{ x: 0, y: 0 }, { x: 99999, y: 0 }] }, "junk", null,
    { id: "dots", kind: "drain", pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: Number.NaN, y: 1 }, { x: 2, y: 0 }], h: 99, width: 5, name: "<b>x</b>\n" },
  ]);
  assert.deepEqual(clean?.map((l) => l.id), ["a", "dots"]);
  assert.deepEqual(clean?.[1].pts, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], "a repeated point and a point that is not a number go");
  assert.equal(clean?.[1].h, 8);
  assert.equal(clean?.[1].width, 0.2);
  assert.equal(clean?.[1].name, "b x /b", "markup characters become spaces");
  assert.equal(sanitizeUtilities([]), undefined);
  assert.equal(sanitizeUtilities("x"), undefined);
  const plain = house([], []);
  assert.equal(withUtilities({ ...plain, utilities: undefined }).utilities, undefined);
  const mine = addLine(plain, good);
  assert.equal(withUtilities(mine), mine, "already clean: the same object");
  assert.deepEqual(withUtilities(JSON.parse(JSON.stringify(mine)) as Plan).utilities, mine.utilities);
  assert.equal("utilities" in withUtilities({ ...mine, utilities: [{ id: "x" } as never] }), false);
});

test("a hostile file cannot fill the plan with pipes or points", () => {
  const many = Array.from({ length: MAX_LINES + 30 }, (_, i) => line(`p${i}`, "cold", [[0, i], [1, i]]));
  assert.equal(sanitizeUtilities(many)?.length, MAX_LINES);
  const long = lineOf({ id: "long", kind: "cold", pts: Array.from({ length: 500 }, (_, i) => ({ x: i, y: 0 })) });
  assert.equal(long?.pts.length, MAX_POINTS);
  const fat = Array.from({ length: 60 }, (_, i) => line(`f${i}`, "cold", Array.from({ length: MAX_POINTS }, (_, k) => [k, i] as [number, number])));
  assert.ok((sanitizeUtilities(fat)?.length ?? 0) <= 37, "the points of the whole plan are capped too");
});

test("add, edit, move, split, reverse, copy and delete round-trip; a broken edit is refused; the last pipe leaves no field", () => {
  let p = addLine(house([], []), line("a", "cold", [[0, 0], [4, 0]]));
  assert.equal(addLine(p, line("a", "gas", [[0, 0], [1, 0]])), p, "the same id twice changes nothing");
  assert.equal(addLine(p, line("short", "cold", [[0, 0]])), p);
  assert.equal(patchLine(p, "a", { pts: [{ x: 0, y: 0 }] }), p, "a one-point pipe is refused");
  assert.equal(patchLine(p, "ghost", { h: 1 }), p);
  p = patchLine(p, "a", { kind: "hot", h: 2.4, name: "Kitchen hot" });
  assert.deepEqual([p.utilities?.[0].kind, p.utilities?.[0].h, p.utilities?.[0].name], ["hot", 2.4, "Kitchen hot"]);
  p = patchLine(p, "a", { h: undefined });
  assert.equal(p.utilities?.[0].h, undefined, "undefined clears an optional field");
  assert.equal(widthOf({ kind: "hot" }), 0.022);
  p = moveLine(p, "a", 1, 2);
  assert.deepEqual(p.utilities?.[0].pts, [{ x: 1, y: 2 }, { x: 5, y: 2 }]);
  p = movePoint(p, "a", 1, { x: 6, y: 3 });
  assert.deepEqual(p.utilities?.[0].pts[1], { x: 6, y: 3 });
  p = splitSegment(p, "a", 0);
  assert.equal(p.utilities?.[0].pts.length, 3);
  assert.deepEqual(p.utilities?.[0].pts[1], { x: 3.5, y: 2.5 });
  p = reverseLine(p, "a");
  assert.deepEqual(p.utilities?.[0].pts[0], { x: 6, y: 3 });
  p = duplicateLine(p, "a", "b");
  assert.deepEqual(p.utilities?.map((l) => l.id), ["a", "b"]);
  assert.equal(removeLine(removeLine(p, "a"), "b").utilities, undefined);
  assert.equal(removeLine(p, "ghost"), p);
});

test("deleting a level takes its pipes with it, and pipes without a level belong to the first", () => {
  const p = house([line("g", "cold", [[0, 0], [1, 0]]), line("u", "cold", [[0, 0], [1, 0]], { level: "L1" })], []);
  assert.deepEqual(dropLevelLines(p, "L1", "L0").utilities?.map((l) => l.id), ["g"]);
  assert.deepEqual(dropLevelLines(p, "L0", "L0").utilities?.map((l) => l.id), ["u"]);
  assert.equal(dropLevelLines(p, "L9", "L0"), p);
});

test("a guest keeps drawn pipes but never maintenance tasks or real valve entity ids", () => {
  const p = { ...house(WATER, [MAIN_VALVE, ZONE_VALVE]), maintenance: { tasks: [{ id: "private", name: "Private", every: 1, unit: "day" as const, due: "2026-11-27" }] } };
  const guest = guestPlan(p, { live: false, location: false }).plan;
  const out = JSON.stringify(guest);
  assert.deepEqual(guest.utilities, WATER);
  assert.ok(!out.includes("maintenance") && !out.includes("valve.main_water") && !out.includes("kitchen_water"));
  assert.ok(out.includes("ut_water_main"), "the valve is still a piece of furniture");
});

// ---- the graph and the trace -------------------------------------------------------------------------------------------------------------------------------

test("a branch that ends on the main joins it, and the leak is traced to the valve that stops it, closest first", () => {
  const p = house(WATER, [MAIN_VALVE, ZONE_VALVE, KITCHEN_LEAK]);
  const t = trace(p, KITCHEN_LEAK);
  assert.deepEqual([t.found, t.connected, t.supplied], [true, true, true]);
  assert.deepEqual(ids(t.sources), ["vmain"]);
  assert.deepEqual(ids(t.cutters), ["vzone", "vmain"], "the zone valve is on the kitchen branch only, the main stops everything");
  const lines = new Set(t.pieces.map((x) => x.line));
  assert.deepEqual([...lines].sort(), ["kitchen", "main"], "the path runs along the kitchen branch and the main, never the bathroom one");
});

test("a pipe that is not on the leak's path does not offer its valve", () => {
  const p = house(WATER, [MAIN_VALVE, ZONE_VALVE, BATH_LEAK]);
  const t = trace(p, BATH_LEAK);
  assert.deepEqual(ids(t.cutters), ["vmain"]);
  assert.ok(!t.pieces.some((x) => x.line === "kitchen"));
});

test("the suggestion offers the closest valve Doshy can close, and names the others", () => {
  const p = house(WATER, [MAIN_VALVE, ZONE_VALVE, KITCHEN_LEAK]);
  const s = suggestShutoff(p, {}, { medium: "water", alert: "leak", itemId: "leak" });
  assert.deepEqual([ids(s?.close ?? []), ids(s?.alternatives ?? [])], [["vzone"], ["vmain"]]);
  assert.equal(s?.area, "Kitchen");
  assert.match(s?.headline ?? "", /kitchen supply/);
  assert.equal(s?.question, "Close the zone valve?");
  const manualZone = house(WATER, [MAIN_VALVE, { ...ZONE_VALVE, entity: undefined }, KITCHEN_LEAK]);
  assert.deepEqual(ids(suggestShutoff(manualZone, {}, { medium: "water", itemId: "leak" })?.close ?? []), ["vmain"], "a valve nobody linked is not the one Doshy offers to close");
  const allManual = house(WATER, [{ ...MAIN_VALVE, entity: undefined }, KITCHEN_LEAK]);
  assert.equal(valveCall(suggestShutoff(allManual, {}, { medium: "water", itemId: "leak" })?.close[0].entity, "close"), null, "with no linked valve there is a name to close by hand, not a call");
});

test("a valve already closed means the pipe is already cut, and what to open again is named", () => {
  const p = house(WATER, [MAIN_VALVE, ZONE_VALVE, KITCHEN_LEAK]);
  const states = { "valve.kitchen_water": st("valve.kitchen_water", "closed"), "valve.main_water": st("valve.main_water", "open") };
  assert.deepEqual([...closedValves(p, states)], ["vzone"]);
  const t = trace(p, KITCHEN_LEAK, ["vzone"]);
  assert.deepEqual([t.connected, t.supplied, t.cutters.length], [true, false, 0]);
  assert.deepEqual(ids(t.blockedBy), ["vzone"]);
  const s = suggestShutoff(p, states, { medium: "water", itemId: "leak" });
  assert.deepEqual([ids(s?.close ?? []), ids(s?.reopen ?? [])], [[], ["vzone"]]);
});

test("a loop fed from two main valves has no single valve that stops it: both are offered", () => {
  const loop = [line("ring", "cold", [[0, 0], [10, 0], [10, 6], [0, 6], [0, 0]]), line("a", "cold", [[-2, 0], [0, 0]]), line("b", "cold", [[10, 6], [12, 6]])];
  const p = house(loop, [item("m1", "ut_water_main", -1, 0), item("m2", "ut_water_main", 11, 6), item("s", "sn_leak_puck", 5, 0.1)]);
  const t = trace(p, p.items[2]);
  assert.deepEqual([t.connected, t.supplied, t.cutters.length], [true, true, 0]);
  assert.deepEqual(ids(t.closeAll).sort(), ["m1", "m2"]);
  const withOne = house(loop, [item("m1", "ut_water_main", -1, 0), item("s", "sn_leak_puck", 5, 0.1)]);
  assert.deepEqual(ids(trace(withOne, withOne.items[1]).cutters), ["m1"], "a loop fed from one side: that valve stops it");
});

test("a loop with a valve on each side of the leak needs both; one on a spur does not stop the loop", () => {
  const loop = [line("feed", "cold", [[-2, 0], [0, 0]]), line("ring", "cold", [[0, 0], [10, 0], [10, 6], [0, 6], [0, 0]])];
  const p = house(loop, [item("m", "ut_water_main", -1, 0), item("v1", "ut_water_valve", 5, 0), item("s", "sn_leak_puck", 5.2, 6.1)]);
  const t = trace(p, p.items[2]);
  assert.deepEqual(ids(t.cutters), ["m"], "the valve on one side of the ring does not cut the other way round");
});

test("pipes that are not connected to a main valve are found but cannot be traced to a source", () => {
  const p = house([...WATER, line("island", "cold", [[20, 20], [25, 20]])], [MAIN_VALVE, item("s", "sn_leak_puck", 22, 20.5)]);
  const t = traceFrom(buildGraph(p, "water"), { x: 22, y: 20.5, level: "L0" });
  assert.deepEqual([t.found, t.connected, t.supplied, t.cutters.length], [true, false, false, 0]);
  assert.equal(suggestShutoff(p, {}, { medium: "water", itemId: "s" })?.close.length, 0);
});

test("a sensor far from every pipe falls back to the pipes in its room, else nothing", () => {
  const p = house(WATER, [MAIN_VALVE, item("far", "sn_leak_puck", 9.5, 2.9)]);
  const g = buildGraph(p, "water");
  assert.equal(traceFrom(g, { x: 30, y: 30, level: "L0" }).found, false);
  const inRoom = traceFrom(g, { x: 9.8, y: 2.9, level: "L0", room: { x: 5, y: 0, w: 5, h: 3 } });
  assert.equal(inRoom.found, true, "the kitchen branch runs inside the kitchen");
  assert.equal(traceFrom(g, { x: 1, y: 1, level: "L5" }).found, false, "another level has no pipes");
  assert.equal(suggestShutoff(p, {}, { medium: "water", roomId: "nowhere" }), null);
  assert.equal(suggestShutoff(house([], [MAIN_VALVE]), {}, { medium: "water", roomId: "kit" }), null, "no pipes drawn, nothing to say");
});

test("gas and water never mix: a gas pipe over the water main is not joined to it", () => {
  const gasLine = line("gas", "gas", [[6, 3], [6, 7]]); // crosses the water main at (6, 5) and ends on the kitchen branch's T joint
  const p = house([...WATER, gasLine], [MAIN_VALVE, item("gvalve", "ut_gas_main", 6, 6.5), item("gleak", "sn_gas", 6.2, 4)]);
  const water = buildGraph(p, "water");
  const gas = buildGraph(p, "gas");
  assert.ok(water.edges.every((e) => e.line !== "gas") && gas.edges.every((e) => e.line === "gas"));
  const gt = traceFrom(gas, { x: 6.2, y: 4, level: "L0" });
  assert.deepEqual(ids(gt.sources), ["gvalve"]);
  assert.deepEqual(ids(gt.cutters), ["gvalve"]);
  assert.deepEqual(ids(traceFrom(water, { x: 6.2, y: 4, level: "L0" }).sources), ["vmain"], "the water network still ends at the water valve");
  assert.equal(water.loose.length, 0);
  assert.deepEqual(gas.loose.map((v) => v.itemId), [], "the gas valve is on the gas pipe");
});

test("cold and hot are one water network when a pipe end meets the other, but a bare crossing does not join them", () => {
  const touching = house([line("c", "cold", [[0, 0], [5, 0]]), line("h", "hot", [[5, 0], [5, 4]])], [item("m", "ut_water_main", 0.2, 0)]);
  assert.equal(traceFrom(buildGraph(touching, "water"), { x: 5.1, y: 3, level: "L0" }).connected, true);
  const crossing = house([line("c", "cold", [[0, 2], [6, 2]]), line("h", "hot", [[3, 0], [3, 4]])], [item("m", "ut_water_main", 0.2, 2)]);
  assert.equal(traceFrom(buildGraph(crossing, "water"), { x: 3.1, y: 3.5, level: "L0" }).connected, false, "two pipes passing over each other");
  const sameKind = house([line("a", "cold", [[0, 2], [6, 2]]), line("b", "cold", [[3, 0], [3, 4]])], [item("m", "ut_water_main", 0.2, 2)]);
  assert.equal(traceFrom(buildGraph(sameKind, "water"), { x: 3.1, y: 3.5, level: "L0" }).connected, true, "two pipes of one kind that cross are a junction");
});

test("tolerance: a branch 10 cm short of the main still joins, one 40 cm short does not", () => {
  const branch = (gap: number) => house([line("m", "cold", [[0, 5], [10, 5]]), line("b", "cold", [[5, 5 - gap], [5, 1]])], [item("v", "ut_water_main", 1, 5), item("s", "sn_leak_puck", 5.1, 2)]);
  const reach = (p: Plan) => traceFrom(buildGraph(p, "water"), { x: 5.1, y: 2, level: "L0" }).connected;
  assert.equal(reach(branch(0.1)), true);
  assert.equal(reach(branch(0.4)), false);
});

test("a riser: pipe ends at the same spot on two levels are joined, a crossing on another level is not", () => {
  const levels = [{ id: "L0", name: "G", elevation: 0, height: 2.8 }, { id: "L1", name: "1", elevation: 2.8, height: 2.8 }];
  const p = house([line("down", "cold", [[0, 5], [8, 5]]), line("up", "cold", [[8, 5.05], [8, 1]], { level: "L1" })], [item("m", "ut_water_main", 1, 5), item("s", "sn_leak_puck", 8.2, 2, { level: "L1" })], { levels });
  const t = traceFrom(buildGraph(p, "water"), { x: 8.2, y: 2, level: "L1" });
  assert.deepEqual([t.found, t.connected], [true, true]);
  assert.deepEqual([...new Set(t.pieces.map((x) => x.line))].sort(), ["down", "up"]);
  const apart = house([line("down", "cold", [[0, 5], [8, 5]]), line("up", "cold", [[4, 0], [4, 9]], { level: "L1" })], [item("m", "ut_water_main", 1, 5)], { levels });
  assert.equal(traceFrom(buildGraph(apart, "water"), { x: 4.1, y: 2, level: "L1" }).connected, false, "a pipe upstairs over a pipe downstairs is not a riser");
});

test("a meter on the way is passed through, never offered to close; a valve far from every pipe is reported loose", () => {
  const p = house(WATER, [MAIN_VALVE, item("meter", "ut_water_usage", 2, 5), KITCHEN_LEAK, item("lost", "ut_water_valve", 50, 50)]);
  const t = trace(p, KITCHEN_LEAK);
  assert.deepEqual(ids(t.cutters), ["vmain"]);
  assert.deepEqual(buildGraph(p, "water").loose.map((v) => v.itemId), ["lost"]);
});

test("the pipes have no direction: a main valve anywhere on the connected pipes is a source", () => {
  const p = house(WATER, [item("late", "ut_water_main", 9.5, 5), KITCHEN_LEAK]);
  assert.deepEqual(ids(trace(p, KITCHEN_LEAK).cutters), ["late"]);
});

// ---- valves, alerts and the service ------------------------------------------------------------------------------------------------------------------------

test("which alerts are about which supply", () => {
  assert.deepEqual((["leak", "gas", "co", "smoke", "intrusion", "problem", "door_open"] as const).map(mediumOfAlert), ["water", "gas", "gas", "gas", undefined, undefined, undefined]);
});

test("valve states: a valve says it, a shut-off switch is open when on, anything else is unknown", () => {
  const states = { "valve.a": st("valve.a", "closed"), "valve.b": st("valve.b", "open"), "valve.c": st("valve.c", "unavailable"), "switch.d": st("switch.d", "off"), "switch.e": st("switch.e", "on"), "sensor.f": st("sensor.f", "on") };
  assert.deepEqual(["valve.a", "valve.b", "valve.c", "switch.d", "switch.e", "sensor.f", "valve.gone", undefined].map((e) => valveState(e, states)), ["closed", "open", "unknown", "closed", "open", "unknown", "unknown", "unknown"]);
  assert.deepEqual(valveCall("valve.a", "close"), { domain: "valve", service: "close_valve", entity_id: "valve.a" });
  assert.deepEqual(valveCall("valve.a", "open"), { domain: "valve", service: "open_valve", entity_id: "valve.a" });
  assert.deepEqual(valveCall("switch.d", "close"), { domain: "switch", service: "turn_off", entity_id: "switch.d" });
  assert.equal(valveCall("cover.garage", "close"), null);
  assert.equal(valveCall(undefined, "close"), null);
});

test("a valve links to a valve or a switch, a meter to a sensor, anything else to nothing special", () => {
  assert.deepEqual(utilityDomains("ut_water_main"), ["valve", "switch"]);
  assert.deepEqual(utilityDomains("ut_gas_usage"), ["sensor"]);
  assert.equal(utilityDomains("sofa"), undefined);
});

// the service route against a fake Home Assistant: what is sent, and what is refused before anything is sent
function fakeHa(known: string[]) {
  const calls: { path: string; body: string }[] = [];
  const fetchHa: HaFetch = async (path, init) => {
    if (init?.method === "POST") {
      calls.push({ path, body: String(init.body) });
      return new Response("[]", { status: 200 });
    }
    const id = path.replace(/^states\//, "");
    return known.includes(id) ? Response.json({ entity_id: id, state: "open", attributes: {} }) : new Response("{}", { status: 404 });
  };
  return { fetchHa, calls };
}

test("closing and reopening a valve send exactly the valve call, and only for an entity Home Assistant has", async () => {
  const ha = fakeHa(["valve.main_water"]);
  assert.deepEqual(await callHaService({ domain: "valve", service: "close_valve", entity_id: "valve.main_water" }, ha.fetchHa), { ok: true });
  assert.deepEqual(await callHaService({ domain: "valve", service: "open_valve", entity_id: "valve.main_water" }, ha.fetchHa), { ok: true });
  assert.deepEqual(ha.calls.map((c) => [c.path, JSON.parse(c.body)]), [["services/valve/close_valve", { entity_id: "valve.main_water" }], ["services/valve/open_valve", { entity_id: "valve.main_water" }]]);
  const missing = await callHaService({ domain: "valve", service: "close_valve", entity_id: "valve.not_there" }, ha.fetchHa);
  assert.deepEqual([missing.ok, !missing.ok && missing.status], [false, 404]);
  assert.equal(ha.calls.length, 2, "nothing was sent for the missing valve");
});

test("a valve service refuses the wrong domain, extra data and a malformed id, and sends nothing", async () => {
  const ha = fakeHa(["valve.main_water", "switch.shutoff"]);
  const bad: unknown[] = [
    { domain: "valve", service: "close_valve", entity_id: "switch.shutoff" },
    { domain: "valve", service: "close_valve", entity_id: "valve.main_water", data: { position: 0 } },
    { domain: "valve", service: "close_valve", entity_id: "valve.main water" },
    { domain: "valve", service: "close_valve", entity_id: "../../config" },
    { domain: "valve", service: "close_valve" },
    { domain: "valve", service: "set_valve_position", entity_id: "valve.main_water", data: { position: 0 } },
    { domain: "valve", service: "toggle", entity_id: "valve.main_water" },
  ];
  for (const body of bad) assert.equal((await callHaService(body, ha.fetchHa)).ok, false, JSON.stringify(body));
  assert.deepEqual(ha.calls, []);
  assert.equal((await callHaService({ domain: "switch", service: "turn_off", entity_id: "switch.shutoff" }, ha.fetchHa)).ok, true, "a shut-off switch goes through the usual switch call");
});

test("a shut-off switch must exist before either open or close is sent", async () => {
  const ha = fakeHa(["switch.water_shutoff"]);
  for (const service of ["turn_off", "turn_on"]) {
    assert.deepEqual(await callHaService({ domain: "switch", service, entity_id: "switch.water_shutoff" }, ha.fetchHa), { ok: true });
    const missing = await callHaService({ domain: "switch", service, entity_id: "switch.missing" }, ha.fetchHa);
    assert.deepEqual(missing, { ok: false, status: 404, error: "Home Assistant has no switch.missing" });
  }
  assert.equal(ha.calls.length, 2);
});
