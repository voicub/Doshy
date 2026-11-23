import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "./catalog.ts";
import { WALL_T, wallLen } from "./geometry.ts";
import { classify, corners, hitsWall } from "./placement.ts";
import { starterPlan } from "./starterPlan.ts";

const plan = starterPlan();
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} !~ ${b}`);
const roomNamed = (n: string) => plan.rooms.find((r) => r.name === n)!;

// a wall on the line `c` (y when horiz, else x) that covers position `at` along it
const wallAt = (horiz: boolean, c: number, at: number) =>
  plan.walls.some((w) => {
    const [line, lo, hi] = horiz ? [w.a.y, w.a.x, w.b.x] : [w.a.x, w.a.y, w.b.y];
    return (horiz ? w.a.y === w.b.y : w.a.x === w.b.x) && Math.abs(line - c) < ((w.thickness ?? WALL_T) / 2 - WALL_T / 2) + 1e-6 && at >= Math.min(lo, hi) && at <= Math.max(lo, hi);
  });

test("walls enclose every room, shared walls are one wall, the hall is open to the living column", () => {
  const h = WALL_T / 2;
  for (const n of ["Living & kitchen", "Hall", "Office", "Bathroom", "Bedroom"]) {
    const r = roomNamed(n);
    const [mx, my] = [r.x + r.w / 2, r.y + r.h / 2];
    const open = n === "Hall" ? ["w"] : n === "Bedroom" ? ["n"] : []; // the bedroom opens north into its wardrobe niche
    const edges: [string, boolean, number, number][] = [["n", true, r.y - h, mx], ["s", true, r.y + r.h + h, mx], ["w", false, r.x - h, my], ["e", false, r.x + r.w + h, my]];
    for (const [side, horiz, c, at] of edges) if (!open.includes(side)) assert.ok(wallAt(horiz, c, at), `${n} ${side}`);
  }
  const hall = roomNamed("Hall");
  const living = roomNamed("Living & kitchen");
  assert.ok(!wallAt(false, living.x + living.w + h, 0.8)); // hall opening to the living column
  assert.ok(wallAt(false, living.x + living.w + h, 3)); // living and office share a wall
  const office = roomNamed("Office");
  const arm = roomNamed("Bedroom alcove");
  const southOfHall = hall.y + hall.h + h;
  assert.ok(wallAt(true, southOfHall, office.x + 1) && wallAt(true, southOfHall, arm.x + 0.5)); // hall south wall is the office's and the arm's north wall
  near(office.y, hall.y + hall.h + WALL_T);
  near(arm.y, office.y);
  near(roomNamed("Bedroom").y, arm.y + arm.h); // the arm sits on the main body
  assert.ok(wallAt(true, living.y + living.h + h, 1) && wallAt(true, living.y + living.h + h, 7)); // one south wall line
  for (const w of plan.walls) assert.ok(wallLen(w) > 0 && (w.a.x === w.b.x || w.a.y === w.b.y));
});

test("every opening sits on a wall of the plan, inside it", () => {
  const ids = new Set(plan.walls.map((w) => w.id));
  for (const o of plan.openings) {
    assert.ok(ids.has(o.wallId));
    assert.ok(o.t > 0 && o.t < 1);
    const w = plan.walls.find((w) => w.id === o.wallId)!;
    assert.ok(o.width < wallLen(w));
  }
});

/** A solid item (column, riser, drawer partition) as one thick wall, the way the editor treats it for collisions. */
const solidWall = (i: (typeof plan.items)[number]) => {
  const r = (i.rot * Math.PI) / 180;
  const u = { x: Math.cos(r), y: Math.sin(r) };
  const e = (i.w - i.d) / 2;
  return { id: i.id, a: { x: i.x - u.x * e, y: i.y - u.y * e }, b: { x: i.x + u.x * e, y: i.y + u.y * e }, style: "plaster" as const, thickness: i.d };
};
const solids = plan.items.filter((i) => CATALOG[i.kind].solid);

test("no floor-standing furniture intersects a wall or a solid item", () => {
  const virtual = solids.map(solidWall);
  const offenders = plan.items
    .filter((i) => classify(CATALOG[i.kind], i.kind) === "floor" && !i.elev)
    .filter((i) => hitsWall(i, plan.walls) || hitsWall(i, virtual.filter((w) => w.id !== i.id)))
    .filter((i) => i.kind !== "column" && i.kind !== "balcony_railing") // columns straddle the facade on purpose; railing modules abut end to end
    .map((i) => i.kind);
  assert.deepEqual(offenders, []);
});

test("four structural columns stand on the facades and clear the doors and windows", () => {
  const cols = plan.items.filter((i) => i.kind === "column");
  assert.equal(cols.length, 4);
  assert.deepEqual(cols.map((c) => c.y > 3).sort(), [false, false, true, true]);
  for (const c of cols) for (const o of plan.openings) {
    const w = plan.walls.find((w) => w.id === o.wallId)!;
    const horiz = w.a.y === w.b.y;
    if (!horiz || Math.abs(w.a.y - c.y) > 1e-6) continue;
    const at = w.a.x + o.t * (w.b.x - w.a.x);
    assert.ok(Math.abs(at - c.x) > o.width / 2 + c.w / 2, `column at ${c.x} blocks an opening at ${at}`);
  }
});

test("the bathroom and the bedroom are separated by exactly one wall, never two parallel ones", () => {
  const bath = roomNamed("Bathroom");
  const bed = [roomNamed("Bedroom alcove"), roomNamed("Bedroom"), roomNamed("Bedroom wardrobe niche")];
  const faces = (w: (typeof plan.walls)[number], horiz: boolean) => { const t = (w.thickness ?? WALL_T) / 2; const c = horiz ? w.a.y : w.a.x; return [c - t, c + t]; };
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.05;
  for (const horiz of [true, false]) {
    const ws = plan.walls.filter((w) => (horiz ? w.a.y === w.b.y : w.a.x === w.b.x) && (horiz ? overlap(Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x), bath.x, bath.x + bath.w) : overlap(Math.min(w.a.y, w.b.y), Math.max(w.a.y, w.b.y), bath.y, bath.y + bath.h)));
    const between = ws.filter((w) => { const [lo, hi] = faces(w, horiz); const [r0, r1] = horiz ? [bath.y + bath.h, Math.min(...bed.map((r) => r.y).filter((y) => y > bath.y))] : [Math.max(...bed.map((r) => r.x + r.w).filter((x) => x <= bath.x)), bath.x]; return lo >= r0 - 0.2 && hi <= r1 + 0.2 && hi > r0 && lo < r1; });
    for (let i = 0; i < between.length; i++) for (let j = i + 1; j < between.length; j++) {
      const [a, b] = [between[i], between[j]];
      const spanA: [number, number] = horiz ? [Math.min(a.a.x, a.b.x), Math.max(a.a.x, a.b.x)] : [Math.min(a.a.y, a.b.y), Math.max(a.a.y, a.b.y)];
      const spanB: [number, number] = horiz ? [Math.min(b.a.x, b.b.x), Math.max(b.a.x, b.b.x)] : [Math.min(b.a.y, b.b.y), Math.max(b.a.y, b.b.y)];
      assert.ok(!overlap(...spanA, ...spanB) || Math.abs((horiz ? a.a.y - b.a.y : a.a.x - b.a.x)) < 1e-6, "two parallel walls over the same span");
    }
  }
  // along the whole arm / bathroom shared stretch a single wall slab covers the gap between the two floors
  const arm = roomNamed("Bedroom alcove");
  const gapX0 = arm.x + arm.w;
  const gapX1 = bath.x;
  for (const y of [1.9, 2.1, 2.4, 2.6]) {
    const covering = plan.walls.filter((w) => w.a.x === w.b.x && y >= Math.min(w.a.y, w.b.y) - WALL_T && y <= Math.max(w.a.y, w.b.y) + WALL_T && w.a.x - (w.thickness ?? WALL_T) / 2 <= gapX0 + 1e-6 && w.a.x + (w.thickness ?? WALL_T) / 2 >= gapX1 - 1e-6);
    assert.equal(covering.length, 1, `one wall between the arm and the bathroom at y=${y}`);
  }
});

const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6;

test("no floor gaps: the hall/lounge opening and every door threshold are covered by a room", () => {
  const hall = roomNamed("Hall");
  const living = roomNamed("Living & kitchen");
  for (let y = hall.y + 0.05; y < hall.y + hall.h; y += 0.1) for (let x = living.x + living.w - 0.01; x <= hall.x + 0.01; x += 0.02) assert.ok(plan.rooms.some((r) => inRect(r, x, y)), `hall/lounge floor gap at ${x.toFixed(2)},${y.toFixed(2)}`);
  for (const o of plan.openings.filter((o) => o.type === "door")) {
    const w = plan.walls.find((w) => w.id === o.wallId)!;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const [ux, uy] = [(w.b.x - w.a.x) / len, (w.b.y - w.a.y) / len];
    const [cx, cy] = [w.a.x + ux * o.t * len, w.a.y + uy * o.t * len];
    const half = (w.thickness ?? WALL_T) / 2;
    for (const s of [-0.9, -0.5, 0, 0.5, 0.9]) for (const d of [-half + 0.01, 0, half - 0.01]) {
      const [px, py] = [cx + ux * s * o.width / 2 + uy * d, cy + uy * s * o.width / 2 - ux * d];
      assert.ok(plan.rooms.some((r) => inRect(r, px, py)), `no floor under the door at ${px.toFixed(2)},${py.toFixed(2)}`);
    }
  }
  for (const r of plan.rooms.filter((r) => r.parent)) assert.ok(plan.rooms.some((p) => p.id === r.parent && !p.parent), `${r.name} has a top-level parent`);
});

/** Points of a door's swing quarter-disc(s): a leaf as wide as the door (half that, from both hinges, for a double door). */
function swingPoints(o: (typeof plan.openings)[number]) {
  const w = plan.walls.find((w) => w.id === o.wallId)!;
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const u = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
  const c = { x: w.a.x + u.x * o.t * len, y: w.a.y + u.y * o.t * len };
  const left = { x: u.y, y: -u.x };
  const n = o.swing === "right" ? { x: -left.x, y: -left.y } : left;
  const double = o.width > 1.2;
  const leaf = double ? o.width / 2 : o.width;
  const pts: { x: number; y: number }[] = [];
  for (const h of double ? [-1, 1] : [o.hinge === "end" ? 1 : -1]) {
    const P = { x: c.x + u.x * h * o.width / 2, y: c.y + u.y * h * o.width / 2 };
    const dir = { x: -u.x * h, y: -u.y * h };
    for (let r = 0.03; r <= leaf; r += 0.03) for (let deg = 0; deg <= 90; deg += 5) {
      const a = (deg * Math.PI) / 180;
      pts.push({ x: P.x + r * (Math.cos(a) * dir.x + Math.sin(a) * n.x), y: P.y + r * (Math.cos(a) * dir.y + Math.sin(a) * n.y) });
    }
  }
  return pts;
}

test("every door has a hinge and swing, and no floor item stands in a door's swing", () => {
  const doors = plan.openings.filter((o) => o.type === "door");
  assert.equal(doors.length, 5);
  for (const o of doors) assert.ok(o.hinge && o.swing, "door has hinge and swing");
  for (const wn of plan.openings.filter((o) => o.type === "window")) assert.ok(!wn.hinge && !wn.swing);
  const floor = plan.items.filter((i) => classify(CATALOG[i.kind], i.kind) === "floor" && !i.elev && i.kind !== "balcony_railing");
  const hits: string[] = [];
  for (const o of doors) for (const p of swingPoints(o)) for (const i of floor) {
    const q = corners(i);
    let pos = 0, neg = 0;
    for (let k = 0; k < 4; k++) { const [a, b] = [q[k], q[(k + 1) % 4]]; const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); if (cr > 1e-9) pos++; if (cr < -1e-9) neg++; }
    if (!(pos && neg)) hits.push(i.kind);
  }
  assert.deepEqual([...new Set(hits)], []);
  // the office and bathroom doors open into their rooms (office photo, bathroom photos)
  const office = roomNamed("Office");
  const bath = roomNamed("Bathroom");
  const probe = (o: (typeof doors)[number]) => { const pts = swingPoints(o); return pts[pts.length - 1]; };
  const officeDoor = doors.find((o) => Math.abs(plan.walls.find((w) => w.id === o.wallId)!.a.y - (office.y - WALL_T / 2)) < 1e-6 && Math.abs(plan.walls.find((w) => w.id === o.wallId)!.a.x + o.t * (plan.walls.find((w) => w.id === o.wallId)!.b.x - plan.walls.find((w) => w.id === o.wallId)!.a.x) - 3.45) < 0.01)!;
  assert.ok(inRect(office, probe(officeDoor).x, probe(officeDoor).y), "office door opens into the office");
  const bathDoor = doors.find((o) => plan.walls.find((w) => w.id === o.wallId)!.a.x === bath.x - WALL_T / 2 + (plan.walls.find((w) => w.id === o.wallId)!.a.x - (bath.x - WALL_T / 2)) && swingPoints(o).some((p) => inRect(bath, p.x, p.y)))!;
  assert.ok(bathDoor, "bathroom door opens into the bathroom");
});

test("the balcony has a railing on its three open sides", () => {
  const b = roomNamed("Balcony");
  const rails = plan.items.filter((i) => i.kind === "balcony_railing");
  const along = (pick: (i: (typeof rails)[number]) => boolean) => rails.filter(pick).reduce((sum, i) => sum + i.w, 0);
  near(along((i) => i.rot === 0 && i.y > b.y + b.h - 0.1), b.w); // south edge
  near(along((i) => i.rot === 90 && i.x < b.x + 0.1), b.h - CATALOG.balcony_railing.d); // west edge up to the south railing
  near(along((i) => i.rot === 90 && i.x > b.x + b.w - 0.1), b.h - CATALOG.balcony_railing.d); // east edge
  for (const i of rails) assert.ok(i.x - 0.03 >= b.x - 1e-6 && i.x + 0.03 <= b.x + b.w + 1e-6 && i.y + 0.03 <= b.y + b.h + 1e-6 && i.y >= b.y); // inside the slab, none on the building wall
  assert.ok(!rails.some((i) => i.y < b.y + 0.1 && i.rot === 0));
});

test("every item uses a real catalog kind and a light item has a glow part", () => {
  for (const i of plan.items) assert.ok(CATALOG[i.kind], i.kind);
  for (const [k, d] of Object.entries(CATALOG)) if (d.light) assert.ok(d.parts.some((p) => p.glow), `${k} has a light but no glow part`);
});

test("catalog parts stay inside their footprint", () => {
  const bad: string[] = [];
  for (const [k, d] of Object.entries(CATALOG)) {
    if (!["echo_dot", "kettle_set", "washer", "bt_washer", "thermostat_wall", "kt_fridge_steel", "kt_microwave", "of_dehumidifier", "kt_hob_oven"].includes(k)) continue;
    for (const p of d.parts) {
      const [sx, sy, sz] = p.s;
      const tol = 0.0051;
      const rotated = p.r && p.r[0] !== 0; // a quarter-turn cylinder lies on its side: height becomes z-extent
      const ez = rotated ? sy : sz;
      const ey = rotated ? sz : sy;
      if (Math.abs(p.p[0]) + sx / 2 > d.w / 2 + tol || Math.abs(p.p[2]) + ez / 2 > d.d / 2 + tol || p.p[1] + ey / 2 > d.h + tol || p.p[1] - ey / 2 < -tol) bad.push(`${k}`);
    }
  }
  assert.deepEqual(bad, []);
});
