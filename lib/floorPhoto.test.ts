import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AVG, DEFAULT_SCALE_M, SCALE_RANGE_M, cropBox, floorPhotoIdOf, floorPhotoIds, patchCmOf, sanitizeFloorPhoto, scaleFromPatchCm, setFloorPhoto, uvRepeat, withFloorPhotos } from "./floorPhoto.ts";
import { withDesign } from "./designFields.ts";
import { mergeBrush, paintHit, sampleHit, type Brush } from "./materials.ts";
import type { Plan, Room } from "./types.ts";

const room = (id: string, extra: Partial<Room> = {}): Room => ({ id, name: id, x: 0, y: 0, w: 4, h: 3, color: "#ffffff", floor: "wood", ...extra });
const plan = (...rooms: Room[]): Plan => ({ walls: [], openings: [], rooms, items: [] });
const good = { resourceId: "floor-0123456789abcdef01234567", scaleM: 0.4, rotation: 90, avg: "#a08060" };

test("a good floor photo is kept as it is", () => {
  assert.deepEqual(sanitizeFloorPhoto(good), good);
});

test("garbage is dropped: a missing or unsafe id, or not a record at all", () => {
  for (const bad of [null, undefined, 3, "x", [], {}, { ...good, resourceId: "no way" }, { ...good, resourceId: "../x" }, { ...good, resourceId: 7 }, { ...good, resourceId: "a".repeat(65) }]) {
    assert.equal(sanitizeFloorPhoto(bad), undefined, JSON.stringify(bad));
  }
});

test("the scale is clamped, the turn is normalised and a bad colour falls back", () => {
  assert.equal(sanitizeFloorPhoto({ ...good, scaleM: 0 })?.scaleM, SCALE_RANGE_M.min);
  assert.equal(sanitizeFloorPhoto({ ...good, scaleM: 99 })?.scaleM, SCALE_RANGE_M.max);
  assert.equal(sanitizeFloorPhoto({ ...good, scaleM: "big" })?.scaleM, DEFAULT_SCALE_M);
  assert.equal(sanitizeFloorPhoto({ ...good, scaleM: NaN })?.scaleM, DEFAULT_SCALE_M);
  assert.equal(sanitizeFloorPhoto({ ...good, rotation: 450 })?.rotation, 90);
  assert.equal(sanitizeFloorPhoto({ ...good, rotation: -180 })?.rotation, 180);
  assert.equal(sanitizeFloorPhoto({ ...good, rotation: Infinity })?.rotation, 0);
  assert.equal(sanitizeFloorPhoto({ ...good, avg: "red" })?.avg, DEFAULT_AVG);
  assert.equal(sanitizeFloorPhoto({ ...good, avg: "#A08060" })?.avg, "#a08060");
  assert.deepEqual(Object.keys(sanitizeFloorPhoto({ ...good, extra: 1 }) ?? {}).sort(), ["avg", "resourceId", "rotation", "scaleM"], "unknown fields are not carried along");
});

test("loading a plan repairs the rooms' photos and leaves a clean plan alone", () => {
  const clean = plan(room("a", { floorPhoto: good }), room("b"));
  assert.equal(withFloorPhotos(clean), clean);
  assert.equal(withDesign(clean), clean, "the plan loader goes through withDesign");
  const messy = plan(room("a", { floorPhoto: { ...good, scaleM: 500, rotation: 360 } }), room("b", { floorPhoto: { resourceId: "no way" } as never }), room("c"));
  const fixed = withDesign(messy);
  assert.equal(fixed.rooms[0].floorPhoto?.scaleM, SCALE_RANGE_M.max);
  assert.equal(fixed.rooms[0].floorPhoto?.rotation, 0);
  assert.equal("floorPhoto" in fixed.rooms[1], false, "a garbage photo is taken off, the room stays");
  assert.equal(fixed.rooms[2], messy.rooms[2]);
});

test("the textures a plan uses are listed once each", () => {
  const other = { ...good, resourceId: "floor-aaaaaaaaaaaaaaaaaaaaaaaa" };
  assert.deepEqual(floorPhotoIds(plan(room("a", { floorPhoto: good }), room("b", { floorPhoto: good }), room("c", { floorPhoto: other }), room("d"))), [good.resourceId, other.resourceId]);
});

test("setting and removing a room's photo", () => {
  const p = plan(room("a"), room("b"));
  const on = setFloorPhoto(p, "a", good);
  assert.deepEqual(on.rooms[0].floorPhoto, good);
  assert.equal(on.rooms[1], p.rooms[1]);
  assert.equal(setFloorPhoto(on, "a", good), on, "the same photo again is no change (no undo step)");
  assert.equal("floorPhoto" in setFloorPhoto(on, "a", null).rooms[0], false);
  assert.equal(setFloorPhoto(p, "a", null), p);
  assert.equal(setFloorPhoto(p, "nope", good), p);
});

test("the id is the content's fingerprint", () => {
  assert.equal(floorPhotoIdOf("0123456789abcdef0123456789abcdef0123"), "floor-0123456789abcdef01234567");
});

test("a 40 cm patch is 0.4 m per repeat, and a 4 x 3 m room shows it 10 x 7.5 times", () => {
  assert.equal(scaleFromPatchCm(40), 0.4);
  assert.deepEqual(uvRepeat(4, 3, scaleFromPatchCm(40)), { u: 10, v: 7.5 });
  assert.deepEqual(uvRepeat(6, 2, 2), { u: 3, v: 1 });
  assert.equal(scaleFromPatchCm(1), SCALE_RANGE_M.min, "a patch of 1 cm is not believable: kept in range");
  assert.equal(scaleFromPatchCm(5000), SCALE_RANGE_M.max);
  assert.equal(scaleFromPatchCm(NaN), DEFAULT_SCALE_M);
  assert.deepEqual([0.4, 0.05, 1.234].map(patchCmOf), [40, 5, 123]);
});

test("the crop square stays inside the picture and shrinks with the zoom", () => {
  assert.deepEqual(cropBox(400, 300, 200, 150, 1), { x: 50, y: 0, side: 300 });
  assert.deepEqual(cropBox(400, 300, 200, 150, 2), { x: 125, y: 75, side: 150 });
  assert.deepEqual(cropBox(400, 300, -50, 999, 3), { x: 0, y: 200, side: 100 }, "a centre beyond the edge is pulled in");
  assert.deepEqual(cropBox(400, 300, 200, 150, 100), { x: 181, y: 131, side: 38 }, "the zoom is capped at 8x");
  assert.equal(cropBox(10, 10, 5, 5, NaN).side, 10);
});

test("the paint bucket lays a photo on a room's floor, and any other paint takes it off again", () => {
  const p = plan(room("a"), room("b", { floor: "oak", color: "#c8a273" }));
  const photoBrush: Brush = { material: null, color: good.avg, floorPhoto: good };
  const on = paintHit(p, { type: "room", id: "a" }, photoBrush);
  assert.deepEqual(on.rooms[0].floorPhoto, good);
  assert.equal(on.rooms[0].floor, "wood", "the floor kind underneath is kept");
  assert.equal(paintHit(on, { type: "room", id: "a" }, { ...photoBrush, roomWalls: true }).rooms[0].floorPhoto?.resourceId, good.resourceId, "a stale walls setting does not turn a photo into wall paint");
  assert.equal(paintHit(on, { type: "room", id: "a" }, photoBrush), on, "the same photo again is no change");
  const colour = paintHit(on, { type: "room", id: "a" }, { material: null, color: "#445566" });
  assert.equal("floorPhoto" in colour.rooms[0], false);
  assert.equal(colour.rooms[0].color, "#445566");
  const kind = paintHit(on, { type: "room", id: "a" }, { material: { kind: "floor", id: "marble" }, color: null });
  assert.deepEqual([kind.rooms[0].floor, "floorPhoto" in kind.rooms[0]], ["marble", false]);
  const natural = paintHit(on, { type: "room", id: "a" }, { material: null, color: "#ffffff" });
  assert.equal("floorPhoto" in natural.rooms[0], false, "even a brush that matches the room's colour takes the photo off");
});

test("a photo brush leaves walls alone and the eyedropper picks a photo floor back up", () => {
  const wall = { id: "w", a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, style: "brick" } as never;
  const p = { ...plan(room("a", { floorPhoto: good })), walls: [wall] };
  const brush: Brush = { material: null, color: good.avg, floorPhoto: good };
  assert.equal(paintHit(p, { type: "wall", id: "w", face: "A" }, brush), p);
  assert.deepEqual(sampleHit(p, { type: "room", id: "a" }), brush);
});

test("a new material or colour replaces the brush's photo; other settings leave it", () => {
  const held: Brush = { material: null, color: good.avg, floorPhoto: good };
  assert.deepEqual(mergeBrush(held, { roomWalls: true }).floorPhoto, good);
  assert.equal("floorPhoto" in mergeBrush(held, { material: { kind: "floor", id: "oak" } }), false);
  assert.equal("floorPhoto" in mergeBrush(held, { color: "#123456" }), false, "the eyedropper on furniture");
  assert.equal("floorPhoto" in mergeBrush(held, { material: null, color: "#123456" }), false);
  const other = { ...good, resourceId: "floor-bbbbbbbbbbbbbbbbbbbbbbbb" };
  assert.deepEqual(mergeBrush(held, { material: null, color: other.avg, floorPhoto: other }).floorPhoto, other);
});
