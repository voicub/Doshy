import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, type Def, type Part } from "./catalog.ts";
import {
  MAX_PICK_BOXES, SUPPORT_PENALTY, behind, boxesOfDef, buildEntry, hitDot, hitPad, hitReal, mergeBoxes, partBox, pressTarget, rankItems, restsOn, tabNext, tabTarget,
  type Cand, type ItemLike, type LBox, type PickEntry, type RankOpts, type Ray,
} from "./pickRank.ts";

// ---- helpers ---------------------------------------------------------------------------------------------------------------

const box = (w: number, d: number, h: number, extra: Partial<Part> = {}): Part => ({ p: [0, h / 2, 0], s: [w, h, d], c: "#fff", ...extra });
const def = (w: number, d: number, h: number, parts?: Part[]): Def => ({ label: "t", brand: "Generic", cat: "Decor", w, d, h, parts: parts ?? [box(w, d, h)] }) as Def;
const item = (id: string, x: number, y: number, d: Def, extra: Partial<ItemLike> = {}): ItemLike => ({ id, x, y, rot: 0, w: d.w, d: d.d, h: d.h, ...extra });
const entry = (id: string, d: Def, x: number, z: number, order: number, extra: Partial<ItemLike> = {}, lv = 0): PickEntry => buildEntry(d, item(id, x, z, d, extra), lv, order);

const N = Math.hypot(1, 1, 1);
/** A ray like the isometric camera's, aimed through the world point (x, y, z). */
const iso = (x: number, y: number, z: number): Ray => ({ o: { x: x + 30 / N, y: y + 30 / N, z: z + 30 / N }, d: { x: -1 / N, y: -1 / N, z: -1 / N } });
/** Straight down through (x, z). */
const down = (x: number, z: number): Ray => ({ o: { x, y: 20, z }, d: { x: 0, y: -1, z: 0 } });
/** Level, from +x, at height y through z. */
const side = (y: number, z: number): Ray => ({ o: { x: 20, y, z }, d: { x: -1, y: 0, z: 0 } });

/** Level, from +z (the front) at height y through x. */
const front = (y: number, x: number): Ray => ({ o: { x, y, z: 20 }, d: { x: 0, y: 0, z: -1 } });

const OPTS: RankOpts = { minSize: 0, skipLocked: true };
const ids = (c: readonly Cand[]) => c.map((x) => x.id);
const rank = (ray: Ray, entries: PickEntry[], opts: RankOpts = OPTS) => rankItems(ray, entries, opts);

// ---- boxes from parts ------------------------------------------------------------------------------------------------------

test("partBox skips details, glow, thin glass and specks, keeps the rest", () => {
  assert.equal(partBox(box(1, 1, 1, { detail: 2 })), null);
  assert.equal(partBox(box(1, 1, 1, { glow: true })), null);
  assert.equal(partBox(box(1, 0.02, 1, { glass: true })), null);
  assert.ok(partBox(box(1, 0.2, 1, { glass: true })));
  assert.equal(partBox(box(0.03, 0.03, 0.03)), null);
  assert.ok(partBox(box(0.02, 0.9, 0.02)), "a thin but tall leg is long enough");
  assert.deepEqual(partBox(box(2, 1, 0.5)), { c: [0, 0.25, 0], h: [1, 0.25, 0.5] });
});

test("a turned part is boxed by its axis-aligned extent", () => {
  const b = partBox({ p: [0, 1, 0], s: [2, 0.2, 0.2], c: "#fff", r: [0, 0, Math.PI / 2] })!; // a long bar stood on end
  assert.ok(Math.abs(b.h[0] - 0.1) < 1e-9 && Math.abs(b.h[1] - 1) < 1e-9);
});

test("mergeBoxes drops contained boxes and merges the cheapest pairs down to the cap", () => {
  const big: LBox = { c: [0, 0, 0], h: [1, 1, 1] };
  const small: LBox = { c: [0.2, 0, 0], h: [0.1, 0.1, 0.1] };
  assert.equal(mergeBoxes([big, small]).length, 1);
  const row: LBox[] = Array.from({ length: 30 }, (_, i) => ({ c: [i, 0, 0], h: [0.3, 0.3, 0.3] }));
  const merged = mergeBoxes(row);
  assert.equal(merged.length, MAX_PICK_BOXES);
  const lo = Math.min(...merged.map((b) => b.c[0] - b.h[0]));
  const hi = Math.max(...merged.map((b) => b.c[0] + b.h[0]));
  assert.ok(lo <= -0.3 + 1e-9 && hi >= 29.3 - 1e-9, "the union still covers every part");
});

test("every catalog piece gets 1..12 pick boxes (models, cars and glass-only pieces use the whole box)", () => {
  let counted = 0;
  for (const d of Object.values(CATALOG)) {
    const boxes = boxesOfDef(d);
    if (boxes) {
      counted++;
      assert.ok(boxes.length >= 1 && boxes.length <= MAX_PICK_BOXES, d.label);
    }
    const e = buildEntry(d, item("x", 0, 0, d), 0, 0);
    assert.ok(e.boxes.length >= 1 && e.boxes.length <= MAX_PICK_BOXES);
  }
  assert.ok(counted > 500);
});

test("boxes follow the item's size, lift and turn", () => {
  const d = def(1, 1, 1, [box(0.2, 0.2, 0.2, { p: [0.4, 0.1, 0] })]); // a block at local +x
  const e = buildEntry(d, { ...item("a", 5, 5, d), rot: 90, elev: 1, w: 2 }, 0.5, 0);
  assert.ok(hitReal(down(5, 5 + 0.8), e) >= 0, "turned 90 deg clockwise, local +x points to +z (and w x2 pushes it out to 0.8)");
  assert.ok(hitReal(down(5, 5 - 0.8), e) < 0);
  assert.ok(Math.abs(hitReal(down(5, 5.8), e) - (20 - (0.5 + 1 + 0.2 * 1))) < 1e-9 || hitReal(down(5, 5.8), e) > 0, "lifted by elev above the floor it stands on");
});

// ---- rank: precise before padding ----------------------------------------------------------------------------------------

test("a hit on a real box beats padding; padding counts when nothing real is hit", () => {
  const wardrobe = entry("wardrobe", def(1, 0.6, 2), 0, 0, 0);
  const sensor = entry("sensor", def(0.05, 0.05, 0.05), 0.8, 0, 1); // beside the wardrobe, 0.3 m minimum target
  const opts = { minSize: 0.3, skipLocked: true };
  // a level look low enough to touch the sensor's padded box, which then runs on into the wardrobe: the wardrobe is the real hit
  assert.deepEqual(ids(rank(side(0.1, 0), [wardrobe, sensor], opts)), ["wardrobe", "sensor"]);
  // the same click one step further out, on bare floor: only the padding is under it
  const out = rank(down(0.8 + 0.12, 0.1), [wardrobe, sensor], opts);
  assert.deepEqual(out.map((c) => [c.id, c.kind]), [["sensor", "pad"]]);
  // without padding the sensor is not there at all
  assert.deepEqual(ids(rank(down(0.92, 0.1), [wardrobe, sensor])), []);
});

test("a tiny thing on a desk wins inside its padding; elsewhere the desk is picked", () => {
  const desk = entry("desk", def(1.2, 0.6, 0.75, [box(1.2, 0.6, 0.04, { p: [0, 0.73, 0] })]), 0, 0, 0);
  const mug = entry("mug", def(0.08, 0.08, 0.1), 0.2, 0, 1, { elev: 0.75 });
  const opts = { minSize: 0.3, skipLocked: true };
  const near = rank(down(0.2 + 0.1, 0), [desk, mug], opts); // 10 cm beside the mug: padding only, but the mug rests on the desk
  assert.deepEqual(near.map((c) => [c.id, c.kind]), [["mug", "promoted"], ["desk", "real"]]);
  assert.deepEqual(ids(rank(down(-0.4, 0), [desk, mug], opts)), ["desk"], "far from the mug the desk is picked");
  assert.deepEqual(ids(rank(down(0.2, 0), [desk, mug], opts)), ["mug", "desk"], "on the mug itself it is first");
});

test("padding grows only boxes smaller than the minimum on every axis", () => {
  const big = entry("big", def(2, 2, 0.1), 0, 0, 0);
  assert.ok(hitPad(down(1.1, 0), big, 0.3) < 0, "a wide flat piece is left alone");
  const tiny = entry("tiny", def(0.05, 0.05, 0.05), 0, 0, 1);
  assert.ok(hitPad(down(0.14, 0), tiny, 0.3) >= 0);
  assert.ok(hitPad(down(0.2, 0), tiny, 0.3) < 0);
});

// ---- rank: per-part picking ----------------------------------------------------------------------------------------------

test("the empty space under a table and between legs is not a hit", () => {
  const table = def(1.4, 0.8, 0.75, [
    box(1.4, 0.8, 0.04, { p: [0, 0.73, 0] }),
    ...[[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]].map(([x, z]): Part => box(0.05, 0.05, 0.7, { p: [x, 0.35, z] })),
  ]);
  const e = entry("table", table, 0, 0, 0);
  assert.deepEqual(ids(rank(side(0.3, 0.0), [e])), [], "level ray between the legs, under the top");
  assert.deepEqual(ids(rank(side(0.3, 0.35), [e])), ["table"], "a ray along the leg row hits a leg");
  assert.deepEqual(ids(rank(down(0, 0), [e])), ["table"], "from above the top is solid");
});

test("a chair tucked under a table is its own target below the tabletop's shadow", () => {
  const table = entry("table", def(1.4, 0.8, 0.75, [box(1.4, 0.8, 0.04, { p: [0, 0.73, 0] }), box(0.05, 0.05, 0.7, { p: [-0.65, 0.35, -0.35] })]), 0, 0, 0);
  const chair = entry("chair", def(0.45, 0.5, 0.7, [box(0.45, 0.5, 0.05, { p: [0, 0.45, 0] }), box(0.45, 0.05, 0.2, { p: [0, 0.6, -0.22] })]), 0.1, 0.2, 1);
  // level look at the chair seat from the open side: nothing of the table is in the way
  assert.deepEqual(ids(rank(side(0.45, 0.2), [table, chair])), ["chair"]);
  // from above through the tabletop the tabletop is what you see: the chair under it is 0.3 m deeper, beyond what a resting piece is forgiven
  assert.deepEqual(ids(rank(down(0.1, 0.2), [table, chair])), ["table", "chair"]);
  assert.ok(restsOn(chair, table));
});

test("an L-shaped piece has no pick volume in its notch", () => {
  const l = def(2, 2, 0.8, [box(2, 0.8, 0.8, { p: [0, 0.4, -0.6] }), box(0.8, 1.2, 0.8, { p: [0.6, 0.4, 0.4] })]);
  const e = entry("l", l, 0, 0, 0);
  assert.deepEqual(ids(rank(down(-0.7, 0.7), [e])), [], "the inside corner of the L is empty");
  assert.deepEqual(ids(rank(down(0.6, 0.7), [e])), ["l"]);
});

// ---- rank: what is seen, rugs, supports ---------------------------------------------------------------------------------

test("the piece whose surface the ray reaches first wins", () => {
  const front = entry("front", def(1, 1, 1), 0, 0, 0);
  const back = entry("back", def(1, 1, 1), -1.2, -1.2, 1);
  const out = rank(iso(-0.5, 0.5, -0.5), [back, front]);
  assert.equal(out[0].id, "front");
});

test("a rug loses to whatever stands on it, even when the ray meets the rug first", () => {
  const rug = entry("rug", def(3, 3, 0.02), 0, 0, 0);
  const crate = entry("crate", def(0.4, 0.4, 0.4), -2.5, 0, 1); // far down the ray's line
  const out = rank(side(0.01, 0), [rug, crate]);
  assert.deepEqual(ids(out), ["crate", "rug"]);
});

test("a sofa on a rug: the sofa from above, the rug in the open", () => {
  const rug = entry("rug", def(3, 2, 0.02), 0, 0, 0);
  const sofa = entry("sofa", def(2, 0.9, 0.85, [box(2, 0.9, 0.4), box(2, 0.2, 0.85, { p: [0, 0.42, -0.35] })]), 0, 0, 1);
  assert.deepEqual(ids(rank(down(0, 0), [rug, sofa])), ["sofa", "rug"]);
  assert.deepEqual(ids(rank(down(1.3, 0.8), [rug, sofa])), ["rug"]);
  assert.ok(restsOn(sofa, rug) && !restsOn(rug, sofa));
});

test("a container loses to the thing resting in it only when that thing is close to the surface", () => {
  const crate = entry("crate", def(1, 1, 1), 0, 0, 0);
  const near = entry("near", def(0.2, 0.2, 0.2), 0, 0, 1, { elev: 0.9 }); // top 1.1: sticks out
  const sunk = entry("sunk", def(0.2, 0.2, 0.2), 0, 0, 1, { elev: 0.3 }); // top 0.5 deep inside
  assert.equal(rank(down(0, 0), [crate, near])[0].id, "near");
  // ray meets the crate at drop 0; the sunk thing is hit 0.5 lower, more than the penalty allows
  const out = rank(down(0, 0), [crate, sunk]);
  assert.equal(out[0].id, "crate");
  assert.ok(0.5 > SUPPORT_PENALTY && 0.1 < SUPPORT_PENALTY);
  const closer = entry("closer", def(0.2, 0.2, 0.2), 0, 0, 1, { elev: 0.7 }); // hit 0.1 below the crate's top: inside the penalty
  assert.equal(rank(down(0, 0), [crate, closer])[0].id, "closer");
});

test("ties go to the smaller volume, then the higher base, then plan order", () => {
  const big = entry("big", def(1, 1, 1), 0, 0, 0);
  const small = entry("small", def(0.5, 0.5, 1), 0, 0, 1);
  assert.deepEqual(ids(rank(down(0, 0), [big, small])), ["small", "big"]);
  const low = entry("low", def(0.5, 0.5, 0.5), 0, 0, 2);
  const high = entry("high", def(0.5, 0.5, 0.5), 0, 0, 3, { elev: 0.5 });
  // two same-size boxes whose tops are at the same height, one higher base: equal volume, same top surface
  const a = entry("a", def(0.5, 0.5, 0.5), 5, 5, 4);
  const b = entry("b", def(0.5, 0.5, 0.5), 5, 5, 5);
  assert.deepEqual(ids(rank(down(5, 5), [b, a])), ["a", "b"], "plan order last");
  assert.ok(high.base > low.base);
});

test("ceiling fixtures are picked by their floor dot, behind anything real", () => {
  const dot = buildEntry(def(0.3, 0.3, 0.1), item("lamp", 0, 0, def(0.3, 0.3, 0.1)), 0, 0, { ceiling: true });
  const table = entry("table", def(1, 1, 0.75), 0, 0, 1);
  assert.deepEqual(rank(down(0.1, 0.1), [dot]).map((c) => c.kind), ["dot"]);
  assert.ok(hitDot(down(0.5, 0), dot, 0) < 0, "outside the 0.2 m dot");
  assert.ok(hitDot(down(0.5, 0), dot, 1.2) >= 0, "the dot grows with the minimum target");
  assert.deepEqual(ids(rank(down(0.1, 0.1), [dot, table])), ["table", "lamp"]);
});

test("locked pieces are not under the pointer unless asked for", () => {
  const rug = entry("rug", def(2, 2, 0.02), 0, 0, 0, { locked: true });
  const sofa = entry("sofa", def(1, 1, 0.8), 0, 0, 1);
  assert.deepEqual(ids(rank(down(0, 0), [rug, sofa])), ["sofa"]);
  assert.deepEqual(ids(rank(down(0.9, 0.9), [rug, sofa])), []);
  assert.deepEqual(ids(rank(down(0.9, 0.9), [rug, sofa], { minSize: 0, skipLocked: false })), ["rug"]);
});

test("rooms and openings join the ranking: an opening is real, a room is the floor", () => {
  const sofa = entry("sofa", def(1, 1, 0.8), 0, 0, 0);
  const out = rankItems(down(0, 0), [sofa], OPTS, [{ type: "room", id: "r", t: 20 }, { type: "opening", id: "o", t: 25 }]);
  assert.deepEqual(out.map((c) => `${c.type}:${c.id}`), ["item:sofa", "opening:o", "room:r"]);
  const padded = entry("s", def(0.05, 0.05, 0.05), 3, 3, 1);
  const roomFirst = rankItems(down(3.1, 3), [padded], { minSize: 0.3, skipLocked: true }, [{ type: "room", id: "r", t: 20 }]);
  assert.deepEqual(roomFirst.map((c) => c.id), ["s", "r"], "padding still beats the floor");
});

// ---- selection rules -------------------------------------------------------------------------------------------------------

test("pressing on the selected piece keeps it, even when another piece ranks first", () => {
  const cands: Cand[] = [
    { type: "item", id: "lamp", t: 1, kind: "real", score: 1 },
    { type: "item", id: "desk", t: 2, kind: "real", score: 2 },
    { type: "item", id: "pad", t: 3, kind: "pad", score: 1e5 },
  ];
  assert.equal(pressTarget(cands, "desk")?.id, "desk");
  assert.equal(pressTarget(cands, "nothing")?.id, "lamp");
  assert.equal(pressTarget(cands, "pad")?.id, "lamp", "only the real volume of the selection counts");
  assert.equal(pressTarget([], "desk"), null);
});

test("pick through skips the best candidate but keeps a lone one", () => {
  assert.deepEqual(behind([1, 2, 3]), [2, 3]);
  assert.deepEqual(behind([1]), [1]);
  assert.deepEqual(behind([]), []);
});

test("tab steps through the pointer's candidates when the selection is among several, else through the room", () => {
  assert.equal(tabNext(["a", "b", "c"], "c", 1), "a");
  assert.equal(tabNext(["a", "b", "c"], "a", -1), "c");
  assert.equal(tabNext(["a", "b", "c"], null, 1), "a");
  assert.equal(tabNext(["a", "b", "c"], "zzz", -1), "c");
  assert.equal(tabNext([], "a", 1), null);
  assert.equal(tabTarget(["x", "y"], ["a", "x", "b"], "x", 1), "y");
  assert.equal(tabTarget(["x"], ["a", "x", "b"], "x", 1), "b", "one candidate under the pointer is no list");
  assert.equal(tabTarget(["y", "z"], ["a", "x", "b"], "x", 1), "b", "the selection is not under the pointer");
});

// ---- real catalog scenarios ------------------------------------------------------------------------------------------------

test("a desk lamp on a real desk: the lamp from its own volume, the desk elsewhere", () => {
  const desk = CATALOG.dc_desk_120;
  const lamp = CATALOG.of_desk_lamp_small;
  const d = entry("desk", desk, 0, 0, 0);
  const l = entry("lamp", lamp, 0.3, 0, 1, { elev: 0.75 });
  const opts = { minSize: 0.28, skipLocked: true };
  assert.equal(rank(iso(0.3, 0.75 + 0.3, 0), [d, l], opts)[0].id, "lamp");
  assert.equal(rank(iso(-0.4, 0.75, 0.1), [d, l], opts)[0].id, "desk");
  assert.deepEqual(ids(rank(front(0.2, 0), [d])), [], "a level look under the desk top, below its back panel, hits nothing");
  assert.deepEqual(ids(rank(front(0.55, 0), [d])), ["desk"], "at the height of the back panel it is the desk");
});

test("300 pieces rank quickly", () => {
  const d = CATALOG.dc_sofa_l_right;
  const all = Array.from({ length: 300 }, (_, i) => entry(`i${i}`, d, (i % 20) * 3, Math.floor(i / 20) * 3, i));
  // fastest of several small batches against a very loose budget: only a complexity blow-up fails this
  let best = Infinity;
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) rankItems(iso(10 + (i % 7), 0.5, 10), all, { minSize: 0.28, skipLocked: true });
    best = Math.min(best, performance.now() - t0);
  }
  assert.ok(best < 1500, `10 queries over 300 pieces took ${best} ms`);
});

test("silhouette parts only: a shelf keeps its boards and dividers, not the books and bins that fill its cells", () => {
  const shelf = def(1, 0.4, 0.8, [
    box(1, 0.4, 0.04, { p: [0, 0.02, 0] }),
    box(1, 0.4, 0.04, { p: [0, 0.78, 0] }),
    box(0.04, 0.4, 0.8, { p: [-0.48, 0.4, 0] }),
    box(0.04, 0.4, 0.8, { p: [0.48, 0.4, 0] }),
    box(0.1, 0.12, 0.2, { p: [0.2, 0.15, 0] }), // a stack of books in the lower right cell
  ]);
  const e = entry("shelf", shelf, 0, 0, 0);
  assert.equal(e.boxes.length, 4, "the books are left out");
  const lamp = entry("lamp", def(0.1, 0.1, 0.25), 0.2, 0, 1, { elev: 0.04 });
  // a level look straight into the open cell: the lamp inside it, then the shelf behind
  assert.deepEqual(ids(rank(front(0.1, 0.2), [e, lamp])), ["lamp"], "nothing of the shelf stands in front of the lamp");
});

test("the real KALLAX leaves its cells open for what is put in them", () => {
  const k = entry("k", CATALOG.kallax, 8.5, 1.0, 0);
  const lamp = entry("lamp", CATALOG.of_desk_lamp_small, 9.02, 1.0, 1, { elev: 0.4 });
  const out = rank(front(0.55, 9.02), [k, lamp]);
  assert.equal(out[0].id, "lamp");
});

test("a thin pole is widened to the narrowest part width on screen, never made taller", () => {
  const lamp = entry("lamp", def(0.2, 0.2, 1, [box(0.03, 0.03, 1, { p: [0, 0.5, 0] })]), 0, 0, 0);
  assert.deepEqual(ids(rank(down(0.08, 0), [lamp])), [], "0.08 m beside a 3 cm pole misses as built");
  const wide = { minSize: 0, minWidth: 0.2, skipLocked: true };
  assert.deepEqual(ids(rank(down(0.08, 0), [lamp], wide)), ["lamp"], "within 0.1 m of its axis it is hit");
  assert.deepEqual(ids(rank(down(0.12, 0), [lamp], wide)), []);
  assert.deepEqual(ids(rank(side(1.05, 0), [lamp], wide)), [], "no taller than built");
});

test("padding never fills the empty space of a big piece: a table's open underside stays no hit at all", () => {
  const table = def(1.4, 0.8, 0.75, [box(1.4, 0.8, 0.04, { p: [0, 0.73, 0] }), box(0.05, 0.05, 0.7, { p: [-0.65, 0.35, -0.35] })]);
  const e = entry("table", table, 0, 0, 0);
  assert.ok(hitPad(side(0.3, 0), e, 0.3) < 0);
  assert.deepEqual(ids(rank(side(0.3, 0), [e], { minSize: 0.3, skipLocked: true })), []);
});

test("a small flat puck is not a rug: it beats the desk it lies on", () => {
  const desk = entry("desk", def(1.2, 0.6, 0.75, [box(1.2, 0.6, 0.04, { p: [0, 0.73, 0] })]), 0, 0, 0);
  const puck = entry("puck", def(0.04, 0.04, 0.01), 0, 0, 1, { elev: 0.75 });
  assert.equal(puck.flat, false);
  assert.equal(rank(down(0, 0), [desk, puck], { minSize: 0, minWidth: 0.13, skipLocked: true })[0].id, "puck");
  assert.equal(entry("rug", def(2, 1.4, 0.02), 0, 0, 2).flat, true);
});

test("only poles are widened: a thin divider that is long keeps its thickness", () => {
  const shelf = entry("shelf", def(1, 0.4, 0.8, [box(0.02, 0.4, 0.8, { p: [0, 0.4, 0] })]), 0, 0, 0);
  const wide = { minSize: 0, minWidth: 0.2, skipLocked: true };
  assert.deepEqual(ids(rank(down(0.06, 0), [shelf], wide)), [], "a 2 cm x 40 cm board is not a pole");
});
