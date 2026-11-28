import assert from "node:assert/strict";
import test from "node:test";
import { withDesign } from "./designFields.ts";
import { MATERIAL_SCALE_M, type MaterialRef } from "./materialRef.ts";
import { mergeBrush, paintFloor, paintHit, paintWall, sampleHit, type Brush } from "./materials.ts";
import { initialScaleM, materialDetail, materialIds, materialScaleFromCm, setFloorMaterial, setGroundMaterial, setWallMaterial, turnedMaterial, withMaterials, withoutMaterials } from "./planMaterials.ts";
import { paintGround } from "./ground.ts";
import { setFloorPhoto } from "./floorPhoto.ts";
import type { GroundArea, GroundPath, Plan, Room, Wall } from "./types.ts";

const ref = (n: string, over: Partial<MaterialRef> = {}): MaterialRef => ({ resourceId: `mat-${n.repeat(24)}`, scaleM: 1, rotation: 0, avg: "#887766", ...over });
const A = ref("a");
const B = ref("b");
const room = (id: string, over: Partial<Room> = {}): Room => ({ id, name: id, x: 0, y: 0, w: 3, h: 3, color: "#fff", floor: "wood", ...over });
const wall = (id: string, over: Partial<Wall> = {}): Wall => ({ id, a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, style: "plaster", ...over });
const area = (id: string, over: Partial<GroundArea> = {}): GroundArea => ({ id, x: 0, y: 0, w: 2, h: 2, kind: "grass", ...over });
const path = (id: string, over: Partial<GroundPath> = {}): GroundPath => ({ id, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 1, kind: "gravel", ...over });
const plan = (over: Partial<Plan> = {}): Plan => ({ walls: [], openings: [], rooms: [], items: [], ...over });

test("a clean plan is left alone and a plan without materials stays without them", () => {
  const clean = plan({ rooms: [room("r", { floorMaterial: A })], walls: [wall("w", { material: A, materialB: B })], ground: [area("g", { material: A })], paths: [path("p", { material: B })] });
  assert.equal(withMaterials(clean), clean);
  assert.equal(withDesign(clean), clean, "the loader goes through withDesign");
  const none = plan({ rooms: [room("r")], walls: [wall("w")] });
  assert.equal(withMaterials(none), none);
  assert.equal("ground" in withMaterials(none), false);
});

test("loading repairs numbers and drops unusable references everywhere, leaving the rest of each row", () => {
  const bad = { resourceId: "../x", scaleM: 1, rotation: 0, avg: "#fff" } as unknown as MaterialRef;
  const messy = plan({
    rooms: [room("r", { floorMaterial: { ...A, scaleM: 9999, rotation: 450 } }), room("s", { floorMaterial: bad })],
    walls: [wall("w", { material: bad, materialB: { ...B, avg: "red" } })],
    ground: [area("g", { material: bad })],
    paths: [path("p", { material: { ...A, scaleM: 0 } })],
  });
  const fixed = withDesign(messy);
  assert.equal(fixed.rooms[0].floorMaterial?.scaleM, MATERIAL_SCALE_M.max);
  assert.equal(fixed.rooms[0].floorMaterial?.rotation, 90);
  assert.equal("floorMaterial" in fixed.rooms[1], false);
  assert.equal(fixed.rooms[1].name, "s");
  assert.equal("material" in fixed.walls[0], false);
  assert.equal(fixed.walls[0].materialB?.avg, "#b4b4b4");
  assert.equal("material" in (fixed.ground?.[0] ?? {}), false);
  assert.equal(fixed.paths?.[0].material?.scaleM, MATERIAL_SCALE_M.min);
});

test("a floor never wears a photo and a material: a hand-edited file keeps the photo", () => {
  const photo = { resourceId: "floor-0123456789abcdef01234567", scaleM: 0.4, rotation: 0, avg: "#a08060" };
  const fixed = withDesign(plan({ rooms: [room("r", { floorPhoto: photo, floorMaterial: A })] }));
  assert.deepEqual(fixed.rooms[0].floorPhoto, photo);
  assert.equal("floorMaterial" in fixed.rooms[0], false);
  const lost = withDesign(plan({ rooms: [room("r", { floorPhoto: { resourceId: "no way" } as never, floorMaterial: A })] }));
  assert.deepEqual(lost.rooms[0].floorMaterial, A, "an unusable photo does not take the material down with it");
});

test("materialIds lists each distinct texture once, rooms then walls then ground then paths", () => {
  const p = plan({ rooms: [room("r", { floorMaterial: A }), room("s", { floorMaterial: A })], walls: [wall("w", { material: B, materialB: A }), wall("v")], ground: [area("g", { material: ref("c") })], paths: [path("p", { material: B })] });
  assert.deepEqual(materialIds(p), [A.resourceId, B.resourceId, ref("c").resourceId]);
  assert.deepEqual(materialIds(plan()), []);
  assert.deepEqual(materialIds({ rooms: [{ floorMaterial: { resourceId: "nope" } } as never], walls: [], }), [], "unusable references are not needed");
});

test("setting and removing a floor material is one change each, and a no-op gives the same plan back", () => {
  const p = plan({ rooms: [room("r"), room("s")] });
  const on = setFloorMaterial(p, "r", A);
  assert.deepEqual(on.rooms[0].floorMaterial, A);
  assert.equal(on.rooms[1], p.rooms[1]);
  assert.equal(setFloorMaterial(on, "r", A), on);
  assert.equal(setFloorMaterial(on, "r", { ...A }), on, "an equal reference is no change");
  assert.equal(setFloorMaterial(p, "r", null), p);
  assert.equal(setFloorMaterial(p, "nope", A), p);
  const off = setFloorMaterial(on, "r", null);
  assert.equal("floorMaterial" in off.rooms[0], false);
  assert.equal(setFloorMaterial(on, "r", { ...A, rotation: 90 }).rooms[0].floorMaterial?.rotation, 90);
});

test("a floor photo and a floor material replace each other, and plain paint takes both off", () => {
  const photo = { resourceId: "floor-0123456789abcdef01234567", scaleM: 0.4, rotation: 0, avg: "#a08060" };
  const withPhoto = setFloorPhoto(plan({ rooms: [room("r")] }), "r", photo);
  const mat = setFloorMaterial(withPhoto, "r", A);
  assert.equal("floorPhoto" in mat.rooms[0], false);
  assert.deepEqual(mat.rooms[0].floorMaterial, A);
  const back = setFloorPhoto(mat, "r", photo);
  assert.equal("floorMaterial" in back.rooms[0], false);
  assert.deepEqual(back.rooms[0].floorPhoto, photo);
  assert.deepEqual(setFloorMaterial(back, "r", null).rooms[0].floorPhoto, photo, "removing a material that is not there keeps the photo");
  const brush: Brush = { material: { kind: "floor", id: "tile" }, color: null };
  const painted = paintFloor(mat, "r", brush);
  assert.equal("floorMaterial" in painted.rooms[0], false);
  assert.equal(painted.rooms[0].floor, "tile");
  assert.equal(paintFloor(painted, "r", brush), painted);
});

test("the paint brush can carry a texture: it lays it on a room's floor, never on walls, and sampling picks it up", () => {
  const p = plan({ rooms: [room("r")], walls: [wall("w")] });
  const brush: Brush = { material: null, color: A.avg, floorMaterial: A };
  assert.deepEqual(paintHit(p, { type: "room", id: "r" }, brush).rooms[0].floorMaterial, A);
  assert.equal(paintHit(p, { type: "room", id: "r" }, { ...brush, roomWalls: true }).walls[0], p.walls[0], "a texture brush never paints the walls around a room");
  assert.equal(paintWall(p.walls[0], "A", brush), p.walls[0]);
  const on = setFloorMaterial(p, "r", A);
  assert.deepEqual(sampleHit(on, { type: "room", id: "r" })?.floorMaterial, A);
  assert.equal("floorMaterial" in mergeBrush(brush, { color: "#fff" }), false, "a new colour replaces the texture the brush held");
});

test("a wall face wears a material without losing its style; two faces are independent", () => {
  const p = plan({ walls: [wall("w", { style: "brick", color: "#c00" }), wall("v")] });
  const a = setWallMaterial(p, ["w"], "A", A);
  assert.deepEqual(a.walls[0].material, A);
  assert.equal(a.walls[0].style, "brick");
  assert.equal(a.walls[0].color, "#c00");
  assert.equal("materialB" in a.walls[0], false);
  assert.equal(a.walls[1], p.walls[1]);
  const ab = setWallMaterial(a, ["w", "v"], "B", B);
  assert.deepEqual([ab.walls[0].material, ab.walls[0].materialB, ab.walls[1].materialB], [A, B, B]);
  assert.equal(setWallMaterial(ab, ["w", "v"], "B", B), ab);
  const off = setWallMaterial(ab, ["w"], "A", null);
  assert.deepEqual(off.walls[0], { ...p.walls[0], materialB: B }, "the old look is back");
  assert.equal(setWallMaterial(p, ["w"], "A", null), p);
  assert.equal(setWallMaterial(p, [], "A", A), p);
  assert.equal(setWallMaterial(p, ["nope"], "A", A), p);
});

test("painting a wall face takes only that face's material off, and keeps materials when the wall is restyled", () => {
  const w = wall("w", { material: A, materialB: B });
  const paintedA = paintWall(w, "A", { material: { kind: "wall", id: "brick" }, color: null });
  assert.equal("material" in paintedA, false);
  assert.deepEqual(paintedA.materialB, B);
  const both = paintWall(w, "both", { material: null, color: "#123456" });
  assert.equal("material" in both || "materialB" in both, false);
  assert.equal(paintWall(wall("x"), "A", { material: { kind: "wall", id: "plaster" }, color: null }).style, "plaster");
});

test("ground areas and paths take, change and lose a material independently", () => {
  const p = plan({ ground: [area("g"), area("h")], paths: [path("p")] });
  const on = setGroundMaterial(setGroundMaterial(p, { type: "ground", id: "g" }, A), { type: "path", id: "p" }, B);
  assert.deepEqual([on.ground?.[0].material, on.ground?.[1].material, on.paths?.[0].material], [A, undefined, B]);
  assert.equal(on.ground?.[1], p.ground?.[1]);
  assert.equal(setGroundMaterial(on, { type: "ground", id: "g" }, A), on);
  assert.equal(setGroundMaterial(p, { type: "path", id: "p" }, null), p);
  assert.equal(setGroundMaterial(p, { type: "ground", id: "nope" }, A), p);
  assert.equal(setGroundMaterial(plan(), { type: "path", id: "p" }, A).paths, undefined);
  assert.equal("material" in (setGroundMaterial(on, { type: "ground", id: "g" }, null).ground?.[0] ?? {}), false);
  assert.equal("material" in (paintGround(on, { type: "ground", id: "g" }, { material: null, color: "#112233" }).ground?.[0] ?? {}), false, "painting the surface takes the texture off");
  assert.deepEqual(paintGround(p, { type: "path", id: "p" }, { material: null, color: A.avg, floorMaterial: A }).paths?.[0].material, A, "the paint brush can carry a texture to ground too");
});

test("a texture that could not come along is taken off everything that wore it, and nothing else", () => {
  const p = plan({ rooms: [room("r", { floorMaterial: A }), room("s", { floorMaterial: B })], walls: [wall("w", { material: A, materialB: B })], ground: [area("g", { material: A })], paths: [path("p", { material: B })] });
  const out = withoutMaterials(p, [A.resourceId]);
  assert.deepEqual(materialIds(out), [B.resourceId]);
  assert.equal(out.rooms[1], p.rooms[1]);
  assert.deepEqual(out.walls[0].materialB, B);
  assert.equal("material" in out.walls[0], false);
  assert.equal(out.paths, p.paths);
  assert.equal(withoutMaterials(p, []), p);
  assert.equal(withoutMaterials(plan({ rooms: [room("r")] }), [A.resourceId]).rooms.length, 1);
});

test("turning goes round in quarters and stays within (-180, 180]", () => {
  let m = A;
  const seen: number[] = [];
  for (let i = 0; i < 5; i++) {
    m = turnedMaterial(m);
    seen.push(m.rotation);
  }
  assert.deepEqual(seen, [90, 180, -90, 0, 90]);
});

test("a typed size in cm is clamped to the range; garbage keeps the old size", () => {
  assert.equal(materialScaleFromCm(80, 1), 0.8);
  assert.equal(materialScaleFromCm(1, 1), MATERIAL_SCALE_M.min);
  assert.equal(materialScaleFromCm(1e9, 1), MATERIAL_SCALE_M.max);
  for (const bad of [0, -5, NaN, Infinity]) assert.equal(materialScaleFromCm(bad, 0.7), 0.7, String(bad));
});

test("a fresh texture's size is the file's, else the smaller side of the listing's, else one metre", () => {
  assert.equal(initialScaleM(0.6, [2, 3]), 0.6);
  assert.equal(initialScaleM(undefined, [2, 3]), 2);
  assert.equal(initialScaleM(undefined, undefined), MATERIAL_SCALE_M.fallback);
  assert.equal(initialScaleM(undefined, []), MATERIAL_SCALE_M.fallback);
  assert.equal(initialScaleM(500, undefined), MATERIAL_SCALE_M.max);
});

test("the browse dialog says how much real surface one picture covers, and nothing when the size is unknown", () => {
  assert.match(materialDetail({ dims: [0.8, 0.8] })?.text ?? "", /80 cm by 80 cm/);
  assert.match(materialDetail({ dims: [2, 1.5] })?.text ?? "", /2 m by 1\.5 m/);
  assert.equal(materialDetail({}), null);
  assert.equal(materialDetail({ dims: [] }), null);
});
