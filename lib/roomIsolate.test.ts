import test from "node:test";
import assert from "node:assert/strict";
import { frameRects, hasOpenPlan, isolationOf, itemsIn, markerInZone, openingsIn, roomOrder, stayingItems, stepRoom, viewAxes, wallRole, wallRoles, zoneMembers, zoneOf, DEFAULT_AZIMUTH, DEFAULT_ELEVATION, type Zone } from "./roomIsolate.ts";
import { starterPlan } from "./starterPlan.ts";
import type { Item, Opening, Plan, Room, Wall } from "./types.ts";

/** Is a label for this entity shown in Room mode? */
const entityInZone = (plan: Plan, z: Zone, entity: string): boolean => zoneMembers(plan, z).some((m) => m.entity === entity);

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({ id, name: id, x, y, w, h, floor: "wood", color: "#fff", ...extra });
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster", ...extra });
const item = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, kind: "marker", x, y, rot: 0, w: 0.5, d: 0.5, h: 0.5, ...extra });

// A (0,0 4x4) | B (4.12,0 4x4), C (0,4.12 4x4) under A; walls 0.12 thick between them, a door A-B and a door A-C
const plan: Plan = {
  rooms: [
    room("A", 0, 0, 4, 4, { tempEntity: "sensor.a_temp", presenceEntities: ["binary_sensor.a_presence"], powerEntities: ["sensor.a_power"] }),
    room("A2", 4, 1, 0.12, 1, { parent: "A" }), // alcove: part of A
    room("B", 4.12, 0, 4, 4, { humidityEntity: "sensor.b_hum" }),
    room("C", 0, 4.12, 4, 4),
  ],
  walls: [
    wall("n", -0.06, -0.06, 8.18, -0.06),
    wall("s", -0.06, 8.18, 4.06, 8.18),
    wall("w", -0.06, -0.06, -0.06, 8.18),
    wall("e", 8.18, -0.06, 8.18, 4.06),
    wall("mid", 4.06, -0.06, 4.06, 8.18),
    wall("h", -0.06, 4.06, 8.18, 4.06),
    wall("fence", 9, 0, 9, 4, { style: "fence_picket" }),
    wall("up", 0, 0, 1, 0, { level: "L1" }),
  ],
  openings: [
    { id: "dAB", wallId: "mid", t: 2.06 / 8.24, width: 0.9, type: "door", sill: 0, height: 2.1 },
    { id: "dAC", wallId: "h", t: 2.06 / 8.24, width: 0.9, type: "door", sill: 0, height: 2.1, entity: "binary_sensor.ac_door" },
    { id: "winA", wallId: "n", t: 2 / 8.24, width: 1, type: "window", sill: 0.9, height: 1.2, entity: "binary_sensor.a_window" },
    { id: "winB", wallId: "n", t: 6 / 8.24, width: 1, type: "window", sill: 0.9, height: 1.2, entity: "binary_sensor.b_window" },
  ] as Opening[],
  items: [
    item("lamp", 1, 1, { entity: "light.a_lamp" }),
    item("onShelf", 1, 1, { entity: "sensor.shelf_temp", elev: 1.4 }), // same centre as the lamp, higher up
    item("alcoveItem", 4.05, 1.5, { entity: "switch.alcove" }),
    item("alias", 2, 2, { entity: "light.a_lamp" }), // same entity twice: listed once
    item("inB", 5, 1, { entity: "light.b_lamp" }),
    item("inC", 1, 5, { entity: "light.c_lamp" }),
    item("bare", 2, 3),
    item("upstairs", 1, 1, { entity: "light.up", level: "L1" }),
  ],
  levels: [{ id: "L0", name: "Ground", elevation: 0, height: 2.78 }, { id: "L1", name: "Up", elevation: 2.78, height: 2.78 }],
} as Plan;

test("a room's zone covers its alcoves and no other room", () => {
  const z = zoneOf(plan, "A", false)!;
  assert.deepEqual([...z.rooms].sort(), ["A", "A2"]);
  assert.deepEqual(z.hosts, ["A"]);
  assert.equal(z.level, "L0");
  assert.equal(zoneOf(plan, "A2", false)!.hosts[0], "A"); // entering an alcove enters its room
  assert.equal(zoneOf(plan, "nope", false), undefined);
});

test("items belong by centre point: alcove and shelf items count, other rooms and storeys do not", () => {
  const z = zoneOf(plan, "A", false)!;
  assert.deepEqual(itemsIn(plan, z).map((i) => i.id).sort(), ["alcoveItem", "alias", "bare", "lamp", "onShelf"]);
  assert.deepEqual([...stayingItems(plan, z)].sort(), ["alcoveItem", "alias", "bare", "lamp", "onShelf"]);
});

test("doors and windows count when they sit in a wall of the room, doors between rooms for both", () => {
  assert.deepEqual(openingsIn(plan, zoneOf(plan, "A", false)!).map((o) => o.id).sort(), ["dAB", "dAC", "winA"]);
  assert.deepEqual(openingsIn(plan, zoneOf(plan, "B", false)!).map((o) => o.id).sort(), ["dAB", "winB"]);
  assert.deepEqual(openingsIn(plan, zoneOf(plan, "C", false)!).map((o) => o.id), ["dAC"]);
});

test("members list each entity once: furniture, then door and window sensors, then the room's own sensors", () => {
  const m = zoneMembers(plan, zoneOf(plan, "A", false)!);
  assert.deepEqual(m.map((x) => `${x.source}:${x.entity}`), [
    "item:light.a_lamp", "item:sensor.shelf_temp", "item:switch.alcove",
    "opening:binary_sensor.ac_door", "opening:binary_sensor.a_window",
    "room:sensor.a_temp", "room:binary_sensor.a_presence", "room:sensor.a_power",
  ]);
});

test("a label shows only for entities of the room", () => {
  const a = zoneOf(plan, "A", false)!;
  assert.equal(entityInZone(plan, a, "sensor.a_temp"), true);
  assert.equal(entityInZone(plan, a, "binary_sensor.a_window"), true);
  assert.equal(entityInZone(plan, a, "light.b_lamp"), false);
  assert.equal(entityInZone(plan, a, "sensor.b_hum"), false);
  assert.equal(entityInZone(plan, zoneOf(plan, "B", false)!, "sensor.b_hum"), true);
  assert.equal(entityInZone(plan, a, "light.up"), false, "another storey");
});

test("a marker is in the room by position and storey", () => {
  const a = zoneOf(plan, "A", false)!;
  assert.equal(markerInZone(a, 1, 1.2, 1), true);
  assert.equal(markerInZone(a, 4.06, 1.2, 1.5), true, "in the wall of the room");
  assert.equal(markerInZone(a, 5, 1.2, 1), false);
  assert.equal(markerInZone(a, 1, 3.5, 1), false, "the storey above");
});

test("walls: far sides stand, near sides are cut, others go; fences stay", () => {
  const a = zoneOf(plan, "A", false)!;
  const role = (id: string) => wallRole(plan, a, plan.walls.find((w) => w.id === id)!);
  assert.equal(role("n"), "tall");
  assert.equal(role("w"), "tall");
  assert.equal(role("mid"), "cut");
  assert.equal(role("h"), "cut");
  assert.equal(role("s"), "hide");
  assert.equal(role("e"), "hide");
  assert.equal(role("fence"), "keep");
  assert.equal(role("up"), "hide", "another storey");
  const b = zoneOf(plan, "B", false)!;
  assert.equal(wallRole(plan, b, plan.walls.find((w) => w.id === "mid")!), "tall", "the same wall is a far side from the other room");
  assert.equal(wallRole(plan, b, plan.walls.find((w) => w.id === "e")!), "cut");
});

test("a wall that divides the zone itself is cut, and roles are cached per zone", () => {
  const both: Zone = { level: "L0", rects: [{ x: 0, y: 0, w: 4, h: 4 }, { x: 4.12, y: 0, w: 4, h: 4 }], rooms: ["A", "B"], hosts: ["A", "B"], y0: 0, y1: 2.78 };
  assert.equal(wallRole(plan, both, plan.walls.find((w) => w.id === "mid")!), "cut");
  assert.equal(wallRoles(plan, both), wallRoles(plan, both));
});

test("walls follow the camera: turn it to the other corner and the near and far sides swap", () => {
  const a = zoneOf(plan, "A", false)!;
  const role = (id: string, az: number) => wallRole(plan, a, plan.walls.find((w) => w.id === id)!, az);
  assert.equal(role("n", 45), "tall");
  assert.equal(role("n", 225), "cut");
  assert.equal(role("mid", 225), "tall", "the shared wall east of A is the far side from the west");
  assert.equal(role("w", 135), "tall", "from the north-east the west wall is still behind the room");
  assert.equal(role("n", 135), "cut");
  assert.equal(role("s", 225), "hide", "other rooms' walls go whichever way we look");
  assert.equal(role("fence", 225), "keep");
  assert.equal(wallRoles(plan, a, 225).get("n"), "cut");
  assert.equal(wallRoles(plan, a, 225), wallRoles(plan, a, 225), "cached per azimuth");
  assert.equal(wallRoles(plan, a, 45).get("n"), "tall", "and recomputed when the azimuth changes");
  assert.equal(wallRole(plan, a, plan.walls.find((w) => w.id === "n")!), "tall", "the isometric default");
});

test("isolation state: off outside the live view, stable identity while nothing changes", () => {
  const s = { plan, isolatedRoom: "A", isolateOpen: true, view: "live" };
  assert.equal(isolationOf({ ...s, view: "plan" }), undefined);
  assert.equal(isolationOf({ ...s, isolatedRoom: null }), undefined);
  assert.equal(isolationOf({ ...s, isolatedRoom: "gone" }), undefined);
  assert.equal(isolationOf(s), isolationOf({ ...s }));
});

// ---- the starter flat ---------------------------------------------------------------------------------------------------------------------

const flat = starterPlan();
const named = (n: string) => flat.rooms.find((r) => r.name === n)!;

test("starter flat: hall, living room and kitchen are one space, the rest are single rooms", () => {
  assert.equal(hasOpenPlan(flat, named("Hall").id), true);
  assert.equal(hasOpenPlan(flat, named("Living & kitchen").id), true);
  for (const n of ["Office", "Bedroom", "Bathroom", "Balcony"]) assert.equal(hasOpenPlan(flat, named(n).id), false, n);
  const z = zoneOf(flat, named("Hall").id, true)!;
  assert.deepEqual([...z.hosts].sort(), [named("Hall").id, named("Living & kitchen").id].sort());
  assert.deepEqual(zoneOf(flat, named("Hall").id, false)!.hosts, [named("Hall").id]);
});

test("starter flat: the bedroom's alcoves are part of the bedroom, and every room can be entered", () => {
  const bed = named("Bedroom");
  const z = zoneOf(flat, bed.id, true)!;
  assert.ok(z.rooms.includes(named("Bedroom alcove").id) && z.rooms.includes(named("Bedroom wardrobe niche").id));
  for (const r of flat.rooms.filter((x) => !x.parent)) {
    const zone = zoneOf(flat, r.id, true)!;
    assert.ok(zone.rects.length >= 1, r.name);
    assert.ok(zone.hosts.includes(r.id), r.name);
  }
});

test("starter flat: the office zone holds the office's furniture and none of the hall's", () => {
  const office = zoneOf(flat, named("Office").id, true)!;
  const hall = zoneOf(flat, named("Hall").id, true)!;
  const mine = new Set(itemsIn(flat, office).map((i) => i.id));
  const theirs = new Set(itemsIn(flat, hall).map((i) => i.id));
  assert.ok(mine.size > 0 && theirs.size > 0);
  for (const id of mine) assert.ok(!theirs.has(id), id);
  const linked = flat.items.find((i) => i.entity && mine.has(i.id))!;
  assert.equal(entityInZone(flat, office, linked.entity!), true);
  assert.equal(entityInZone(flat, hall, linked.entity!), false);
});

test("starter flat: the office has a far wall to stand on, a near wall to cut and nothing of the neighbours", () => {
  const z = zoneOf(flat, named("Office").id, true)!;
  const roles = [...wallRoles(flat, z).values()];
  assert.ok(roles.includes("tall") && roles.includes("cut") && roles.includes("hide"));
  assert.ok(roles.filter((r) => r === "tall").length >= 1 && roles.filter((r) => r === "tall").length <= 4);
});

// ---- stepping ------------------------------------------------------------------------------------------------------------------------------

test("stepping visits every room once, an open-plan space counts once, and wraps round", () => {
  const order = roomOrder(flat, "L0", true);
  const hosts = flat.rooms.filter((r) => !r.parent && (r.level ?? "L0") === "L0").map((r) => r.id).sort();
  assert.deepEqual(order.flat().sort(), hosts);
  assert.equal(order.length, hosts.length - 1, "hall + living are one stop");
  assert.equal(roomOrder(flat, "L0", false).length, hosts.length);
  const first = order[0][0];
  const seen = [first];
  for (let id = stepRoom(flat, first, 1, true)!; id !== first; id = stepRoom(flat, id, 1, true)!) seen.push(id);
  assert.equal(seen.length, order.length);
  assert.equal(stepRoom(flat, seen[1], -1, true), first, "left undoes right");
});

test("stepping follows doors, left to right where there is a choice", () => {
  assert.deepEqual(roomOrder(plan, "L0", false).map((h) => h[0]), ["A", "C", "B"]);
});

test("stepping from an alcove steps from its room; a single room has nowhere to go", () => {
  const alcove = named("Bedroom alcove");
  assert.equal(stepRoom(flat, alcove.id, 1, true), stepRoom(flat, named("Bedroom").id, 1, true));
  assert.equal(stepRoom({ ...plan, rooms: [plan.rooms[0]] }, "A", 1, true), undefined);
  assert.equal(stepRoom(plan, "missing", 1, true), undefined);
});

test("stepping from a plan with no doors still reaches every room left to right", () => {
  const noDoors = { ...plan, openings: [] };
  assert.deepEqual(roomOrder(noDoors, "L0", false).map((h) => h[0]), ["A", "C", "B"]);
});

// ---- camera framing ----------------------------------------------------------------------------------------------------------------------

const iso = viewAxes(DEFAULT_AZIMUTH, DEFAULT_ELEVATION);
const opts = { pad: 1, yLow: 0, yHigh: 2.2, minZoom: 1, maxZoom: 1000, axes: iso };
const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Screen offset (px) of a world point from the screen centre for a camera framing. */
const screen = (f: { target: number[]; zoom: number }, p: number[], axes = iso) => {
  const d = [p[0] - f.target[0], p[1] - f.target[1], p[2] - f.target[2]];
  return { x: dot3(d, axes.right) * f.zoom, y: -dot3(d, axes.up) * f.zoom };
};
const corners = (rects: { x: number; y: number; w: number; h: number }[], y0: number, y1: number) =>
  rects.flatMap((r) => [r.x, r.x + r.w].flatMap((x) => [r.y, r.y + r.h].flatMap((z) => [y0, y1].map((y) => [x, y, z]))));

test("the isometric axes are the classic ones", () => {
  const near = (a: number[], b: number[]) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-3, `${a} vs ${b}`));
  near(iso.right, [1 / Math.SQRT2, 0, -1 / Math.SQRT2]);
  near(iso.up, [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)]);
  near(iso.dir, [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]);
});

test("a rectangular room is centred and fills the viewport on its tighter axis", () => {
  const r = [{ x: 2, y: 3, w: 4, h: 4 }];
  const f = frameRects(r, 1000, 800, opts);
  assert.ok(Math.abs(f.target[0] - 4) < 1e-9 && Math.abs(f.target[2] - 5) < 1e-9 && Math.abs(f.target[1] - 1.1) < 1e-9);
  const xs = corners(r, 0, 2.2).map((p) => screen(f, p));
  assert.ok(Math.max(...xs.map((p) => Math.abs(p.y))) <= 400 + 1e-6);
  assert.ok(Math.abs(Math.max(...xs.map((p) => Math.abs(p.y))) - 400) < 1e-6 || Math.abs(Math.max(...xs.map((p) => Math.abs(p.x))) - 500) < 1e-6);
  assert.ok(Math.max(...xs.map((p) => Math.abs(p.x))) <= 500 + 1e-6);
});

test("an L-shaped room is framed by its outline, not its bounding box", () => {
  const L = [{ x: 0, y: 0, w: 6, h: 2 }, { x: 0, y: 2, w: 2, h: 4 }];
  const box = [{ x: 0, y: 0, w: 6, h: 6 }];
  const fl = frameRects(L, 1000, 800, opts);
  const fb = frameRects(box, 1000, 800, opts);
  assert.ok(fl.zoom >= fb.zoom, "never zooms out further than the box");
  for (const p of corners(L, 0, 2.2).map((q) => screen(fl, q))) assert.ok(Math.abs(p.x) <= 500 + 1e-6 && Math.abs(p.y) <= 400 + 1e-6);
  assert.ok(Math.hypot(fl.target[0] - fb.target[0], fl.target[2] - fb.target[2]) > 0.05, "the target follows the outline");
});

test("padding leaves room, the zoom is clamped, and an empty footprint is harmless", () => {
  const r = [{ x: 0, y: 0, w: 4, h: 4 }];
  const tight = frameRects(r, 1000, 800, opts);
  const loose = frameRects(r, 1000, 800, { ...opts, pad: 1.5 });
  assert.ok(Math.abs(loose.zoom * 1.5 - tight.zoom) < 1e-6);
  assert.equal(frameRects(r, 1000, 800, { ...opts, maxZoom: 50 }).zoom, 50);
  assert.equal(frameRects(r, 1000, 800, { ...opts, minZoom: 500 }).zoom, 500);
  assert.equal(frameRects([], 1000, 800, opts).zoom, 1);
});

test("panels over the viewport push the room into the free area", () => {
  const r = [{ x: 0, y: 0, w: 4, h: 4 }];
  const inset = { left: 200, right: 360, top: 100, bottom: 60 };
  const f = frameRects(r, 1600, 900, { ...opts, inset });
  const centre = screen(f, [2, 1.1, 2]);
  assert.ok(Math.abs(centre.x - (200 - 360) / 2) < 1e-6, `x ${centre.x}`);
  assert.ok(Math.abs(centre.y - (100 - 60) / 2) < 1e-6, `y ${centre.y}`);
  for (const p of corners(r, 0, 2.2).map((q) => screen(f, q))) {
    assert.ok(p.x >= -800 + 200 - 1e-6 && p.x <= 800 - 360 + 1e-6, `x ${p.x}`);
    assert.ok(p.y >= -450 + 100 - 1e-6 && p.y <= 450 - 60 + 1e-6, `y ${p.y}`);
  }
  assert.ok(f.zoom < frameRects(r, 1600, 900, opts).zoom);
});

test("a lower camera sees the room from the side: it frames a taller extent at the same footprint", () => {
  const r = [{ x: 0, y: 0, w: 4, h: 4 }];
  const low = frameRects(r, 1000, 1000, { ...opts, axes: viewAxes(45, 29) });
  assert.ok(low.zoom > 0 && Number.isFinite(low.zoom));
  const p = screen(low, [0, 2.2, 0], viewAxes(45, 29));
  assert.ok(Math.abs(p.x) <= 500 + 1e-6 && Math.abs(p.y) <= 500 + 1e-6);
});
