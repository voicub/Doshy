import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PLATE_STYLE, PLATE_HOLDER, PLATE_MAX, PLATE_STYLES, isPlateStyle, plateKey, plateOf, plateSize, plateYellow, sanitizePlate } from "./plate.ts";
import { plateCanvasSize } from "./plateDraw.ts";
import { buildCar } from "./carGeometry.ts";
import { carSpec } from "./cars.ts";
import { CAR_TABLE } from "./cars.data.ts";

test("sanitising: upper case, A-Z 0-9 space hyphen only, accents dropped, at most 10 characters", () => {
  assert.equal(sanitizePlate("b 123 abc"), "B 123 ABC");
  assert.equal(sanitizePlate("  b-12!@# abc  "), "B-12 ABC");
  assert.equal(sanitizePlate("București"), "BUCURESTI");
  assert.equal(sanitizePlate("AB  12"), "AB 12");
  assert.equal(sanitizePlate("ABCDEFGHIJKLMNOP").length, PLATE_MAX);
  assert.equal(sanitizePlate("<script>"), "SCRIPT");
  assert.equal(sanitizePlate(""), "");
  assert.equal(sanitizePlate("B "), "B"); // committed text has no trailing space
  assert.equal(sanitizePlate("B ", true), "B "); // while typing it stays
  assert.equal(sanitizePlate("ABCDEFGHI  ", true).length, PLATE_MAX);
});

test("style defaults: a car nobody touched has a blank EU plate; bad saved values fall back", () => {
  assert.deepEqual(plateOf(undefined), { text: "", style: "eu" });
  assert.deepEqual(plateOf({ finish: "matte" }), { text: "", style: DEFAULT_PLATE_STYLE });
  assert.deepEqual(plateOf({ plate: "b 123 abc", plateStyle: "ro" }), { text: "B 123 ABC", style: "ro" });
  assert.deepEqual(plateOf({ plate: 5, plateStyle: "mars" }), { text: "", style: "eu" });
  assert.ok(PLATE_STYLES.every((s) => isPlateStyle(s.id)) && !isPlateStyle("x"));
});

test("texture cache keys: same look = same key; text, style and the UK rear colour change it; blank ignores the text", () => {
  const k = (t: string, s: Parameters<typeof plateKey>[1], e: Parameters<typeof plateKey>[2] = "front") => plateKey(t, s, e);
  assert.equal(k("B 123 ABC", "ro", "front"), k("B 123 ABC", "ro", "rear"));
  assert.notEqual(k("B 123 ABC", "ro"), k("B 123 ABD", "ro"));
  assert.notEqual(k("B 123 ABC", "ro"), k("B 123 ABC", "eu"));
  assert.notEqual(k("X1", "uk", "front"), k("X1", "uk", "rear"));
  assert.ok(plateYellow("uk", "rear") && !plateYellow("uk", "front") && !plateYellow("eu", "rear"));
  assert.equal(k("TEXT", "blank"), k("OTHER", "blank"));
});

test("plate sizes: 520 x 110 mm EU / Romanian, 520 x 111 mm UK, 12 x 6 in US; picture aspect matches", () => {
  for (const e of ["front", "rear"] as const) {
    assert.deepEqual(plateSize("eu", e), [0.52, 0.11]);
    assert.deepEqual(plateSize("ro", e), [0.52, 0.11]);
    assert.deepEqual(plateSize("uk", e), [0.52, 0.111]);
    assert.deepEqual(plateSize("us", e), [0.305, 0.152]);
  }
  for (const s of PLATE_STYLES) {
    const [w, h] = plateCanvasSize(s.id, "rear");
    const [pw, ph] = plateSize(s.id, "rear");
    assert.ok(Math.abs(w / h - pw / ph) < 0.01, s.id);
    assert.ok(pw <= PLATE_HOLDER[0] && ph <= PLATE_HOLDER[1], `${s.id} fits the holder`);
  }
});

test("each body style puts a front and a rear plate mount on its bumper, the right way round", () => {
  const onePerBody = new Map(CAR_TABLE.map((row) => [carSpec(row).bodyStyle, row])); // buildCar for all ~190 cars takes seconds; mounts only depend on the shape
  for (const row of onePerBody.values()) {
    const s = carSpec(row);
    const g = buildCar(s);
    const front = g.plates.find((p) => p.end === "front")!;
    const rear = g.plates.find((p) => p.end === "rear")!;
    assert.ok(front && rear, s.id);
    assert.ok(front.p[2] > s.length / 2 - 0.1 && front.p[2] < s.length / 2 + 0.015, `${s.id} front z ${front.p[2]}`);
    assert.ok(rear.p[2] < -s.length / 2 + 0.1 && rear.p[2] > -s.length / 2 - 0.015, `${s.id} rear z ${rear.p[2]}`);
    assert.equal(front.p[0], 0);
    assert.equal(rear.rot[1], Math.PI); // faces backwards
    assert.equal(front.rot[1], 0);
    assert.ok(front.p[1] > 0.15 && front.p[1] < s.height * 0.6 && rear.p[1] > 0.15 && rear.p[1] < s.height * 0.7, `${s.id} plate heights ${front.p[1]} ${rear.p[1]}`);
  }
});

test("a car built without a plate holder at one end has a smaller black layer, the same plate mounts and the other end's holder", () => {
  const s = carSpec(CAR_TABLE.find((row) => carSpec(row).bodyStyle === "sedan") ?? CAR_TABLE[0]);
  const full = buildCar(s);
  const bareRear = buildCar(s, 0, { front: true, rear: false });
  const bare = buildCar(s, 0, { front: false, rear: false });
  assert.ok(bareRear.layers.black.pos.length < full.layers.black.pos.length);
  assert.ok(bare.layers.black.pos.length <= bareRear.layers.black.pos.length);
  assert.deepEqual(bareRear.plates, full.plates);
  assert.equal(buildCar(s, 0, { front: true, rear: true }), full, "the default is cached as the full car");
});
