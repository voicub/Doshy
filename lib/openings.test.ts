import test from "node:test";
import assert from "node:assert/strict";
import { FRAME_COLORS, FRAME_DARK, FRAME_LIGHT, OPENING_STYLES, STYLES_OF, chipOf, frameColor, inwardSign, openOpenings, openingRooms, restyle, styleOf, styleSize, swings } from "./openings.ts";
import { WALL_H } from "./geometry.ts";
import { snapTarget } from "./climate.ts";
import type { HAState } from "./ha.ts";
import type { Plan } from "./types.ts";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster" as const });
const room = (id: string, name: string, x: number, y: number, w: number, h: number, extra = {}) => ({ id, name, x, y, w, h, floor: "wood" as const, color: "#fff", ...extra });
const plan: Plan = {
  walls: [wall("n", 0, 0, 6, 0), wall("mid", 3, 0, 3, 4)],
  rooms: [room("a", "Bedroom", 0, 0, 3, 4), room("b", "Office", 3, 0, 3, 4), room("a2", "Nook", 0, 4, 1, 1, { parent: "a" })],
  openings: [
    { id: "w1", wallId: "n", t: 0.25, width: 1, type: "window", sill: 0.9, height: 1.2, entity: "binary_sensor.bed_window" },
    { id: "d1", wallId: "mid", t: 0.5, width: 0.9, type: "door", sill: 0, height: 2.04, entity: "binary_sensor.mid_door" },
    { id: "w2", wallId: "n", t: 0.75, width: 1, type: "window", sill: 0.9, height: 1.2, entity: "binary_sensor.off_window" },
  ],
  items: [],
};
const st = (entity_id: string, state: string): HAState => ({ entity_id, state, attributes: {} });

test("a window serves the room it looks into and is exterior; a door between rooms serves both and is interior", () => {
  const w = openingRooms(plan, plan.openings[0]);
  assert.deepEqual(w.rooms.map((r) => r.id), ["a"]);
  assert.equal(w.exterior, true);
  const d = openingRooms(plan, plan.openings[1]);
  assert.deepEqual(d.rooms.map((r) => r.id).sort(), ["a", "b"]);
  assert.equal(d.exterior, false);
});

test("only openings whose sensor reads open are listed", () => {
  const open = openOpenings(plan, { "binary_sensor.bed_window": st("binary_sensor.bed_window", "on"), "binary_sensor.off_window": st("binary_sensor.off_window", "off") });
  assert.deepEqual(open.map((o) => o.opening.id), ["w1"]);
  assert.deepEqual(open[0].rooms, ["Bedroom"]);
});

test("snapTarget rounds to the step inside the limits", () => {
  assert.equal(snapTarget(21.84, 0.1, 15, 25), 21.8);
  assert.equal(snapTarget(21.84, 0.5, 15, 25), 22);
  assert.equal(snapTarget(99, 0.5, 15, 25), 25);
  assert.equal(snapTarget(3, 0.1, 15, 25), 15);
});

test("every gallery style exists once, matches its type and has a sane default size", () => {
  const listed = [...STYLES_OF.door, ...STYLES_OF.window];
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual(new Set(listed), new Set(Object.keys(OPENING_STYLES)));
  for (const type of ["door", "window"] as const) {
    for (const id of STYLES_OF[type]) {
      const s = OPENING_STYLES[id];
      assert.equal(s.type, type, id);
      for (const chip of ["Standard", "Wide", "Tall"] as const) {
        const z = styleSize(id, chip);
        assert.ok(z.width > 0 && z.height > 0 && z.sill >= 0 && z.sill + z.height <= WALL_H + 1e-9, `${id} ${chip}`);
      }
    }
  }
});

test("Wide changes only the width, Tall only the height", () => {
  const std = styleSize("casement");
  assert.equal(styleSize("casement", "Wide").height, std.height);
  assert.ok(styleSize("casement", "Wide").width > std.width);
  assert.equal(styleSize("casement", "Tall").width, std.width);
  assert.ok(styleSize("casement", "Tall").height > std.height);
  assert.equal(chipOf("casement", styleSize("casement", "Wide")), "Wide");
  assert.equal(chipOf("casement", { width: 1.33, height: 1.2, sill: 0.9 }), null);
});

test("plans without a style keep the plain door and casement window; a mismatched style falls back", () => {
  assert.equal(styleOf({ type: "door" }), "single");
  assert.equal(styleOf({ type: "window" }), "casement");
  assert.equal(styleOf({ type: "window", style: "garageSectional" }), "casement");
  assert.equal(styleOf({ type: "door", style: "arch" }), "arch");
  assert.ok(swings({ type: "door" }) && swings({ type: "window" }));
  assert.ok(!swings({ type: "door", style: "garageRoller" }) && !swings({ type: "window", style: "picture" }));
});

test("swapping style keeps a typed size but follows the chip when the old size was a preset", () => {
  const onChip = restyle({ type: "door", ...styleSize("single", "Wide") }, "double");
  assert.deepEqual({ w: onChip.width, h: onChip.height }, { w: styleSize("double", "Wide").width, h: styleSize("double", "Wide").height });
  const typed = restyle({ type: "door", width: 1.07, height: 2.0, sill: 0 }, "double");
  assert.deepEqual(typed, { style: "double" });
});

test("a bay window sticks out away from the room: inwardSign points to the room side", () => {
  const p: Plan = { ...plan, openings: [] };
  // the north wall runs west to east; the room is south of it (+y), which is local +z
  assert.equal(inwardSign(p, p.walls[0], 0.25), 1);
  assert.equal(inwardSign(p, { ...p.walls[0], a: p.walls[0].b, b: p.walls[0].a }, 0.75), -1);
});

test("the frame colour is the one the user chose for every style, else the style's own", () => {
  const anthracite = FRAME_COLORS.find((c) => c.label === "Anthracite")!.color;
  for (const type of ["door", "window"] as const)
    for (const style of STYLES_OF[type]) {
      assert.equal(frameColor({ type, style, color: anthracite }), anthracite, style);
      assert.match(frameColor({ type, style }), /^#[0-9a-f]{6}$/i, `${style} has a default`);
    }
  // what saved plans were drawn with before the colour was resolved in one place
  assert.equal(frameColor({ type: "window" }), FRAME_DARK, "a plain window frame is dark");
  assert.equal(frameColor({ type: "door" }), FRAME_LIGHT, "a plain door frame is light");
  assert.equal(frameColor({ type: "door", style: "slidingGlass" }), FRAME_DARK);
  assert.equal(frameColor({ type: "window", style: "glassBlock" }), "#c9c5bd");
});

test("a style that does not belong to the opening's type falls back to the type's plain look, colour kept", () => {
  assert.equal(frameColor({ type: "window", style: "single" }), frameColor({ type: "window" }));
  assert.equal(frameColor({ type: "window", style: "single", color: "#123456" }), "#123456");
});
