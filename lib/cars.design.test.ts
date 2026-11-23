import test from "node:test";
import assert from "node:assert/strict";
import { carId } from "./cars.ts";
import { CAR_TABLE } from "./cars.data.ts";
import { BRAND_DESIGNS, MODEL_DESIGNS } from "./cars.design.data.ts";
import { BEDS, CABS, DRLS, EXHAUSTS, GRILLES, INTAKES, LAMPS, MIRRORS, PILLARS, REAR_LAMPS, RIM_STYLES, ROOFS, SKIDS, TOPS, TRIMS, designOf, isResearched, tyreDiameter } from "./cars.design.ts";

const IDS = CAR_TABLE.map((r) => carId(r[0], r[1]));
const HEX = /^#[0-9a-f]{6}$/i;
const inList = (list: readonly string[], v: string | undefined) => v === undefined || list.includes(v);
const inRange = (v: number | undefined, lo: number, hi: number) => v === undefined || (v >= lo && v <= hi);

test("every catalogue model has a design and every brand has brand defaults", () => {
  assert.equal(new Set(IDS).size, IDS.length);
  for (const id of IDS) assert.ok(designOf(id).face.id, id);
  for (const brand of new Set(CAR_TABLE.map((r) => r[0]))) assert.ok(brand in BRAND_DESIGNS, `no brand design for ${brand}`);
});

test("every design row belongs to a catalogue model and every brand entry to a catalogue brand", () => {
  const brands = new Set(CAR_TABLE.map((r) => r[0]));
  for (const id of Object.keys(MODEL_DESIGNS)) assert.ok(IDS.includes(id), `row for unknown model ${id}`);
  for (const b of Object.keys(BRAND_DESIGNS)) assert.ok(brands.has(b), `design for unknown brand ${b}`);
});

test("every model is researched individually: notes and a source on each row", () => {
  for (const id of IDS) {
    assert.ok(isResearched(id), `${id} only has the brand default`);
    const row = MODEL_DESIGNS[id];
    assert.ok(row?.notes && row.notes.trim().length > 10 && row.notes.length <= 260, `${id} notes`);
    assert.ok(row?.source && row.source.trim().length > 0, `${id} source`);
  }
});

test("all enum values and numeric ranges are valid for every resolved design", () => {
  for (const id of IDS) {
    const { face, rear, body, wheels } = designOf(id);
    assert.ok(GRILLES.includes(face.grille), `${id} grille`);
    assert.ok(LAMPS.includes(face.lamp), `${id} lamp`);
    assert.ok(DRLS.includes(face.drl), `${id} drl`);
    assert.ok(INTAKES.includes(face.intake), `${id} intake`);
    assert.ok(inRange(face.grilleW, 0.3, 0.6), `${id} grilleW`);
    assert.ok(inRange(face.bars, 0, 20), `${id} bars`);
    assert.equal(typeof face.grilleChrome, "boolean", id);
    assert.equal(typeof face.fog, "boolean", id);
    assert.ok(REAR_LAMPS.includes(rear.lamp), `${id} rear lamp`);
    assert.ok(EXHAUSTS.includes(rear.exhaust), `${id} exhaust`);
    assert.ok(inList(ROOFS, body.roof), `${id} roof`);
    assert.ok(inList(PILLARS, body.pillars), `${id} pillars`);
    assert.ok(inList(TRIMS, body.windowTrim), `${id} windowTrim`);
    assert.ok(inList(TOPS, body.top), `${id} top`);
    assert.ok(inList(CABS, body.cab), `${id} cab`);
    assert.ok(inList(BEDS, body.bed), `${id} bed`);
    assert.ok(inList(MIRRORS, body.mirror), `${id} mirror`);
    assert.ok(inList(SKIDS, body.skid), `${id} skid`);
    assert.ok(inRange(body.belt, 0.6, 0.75), `${id} belt`);
    assert.ok(inRange(body.roofTaper, 0, 0.12), `${id} roofTaper`);
    assert.ok(inRange(body.tumble, 0.05, 0.15), `${id} tumble`);
    assert.ok(inRange(body.hood, 0.04, 0.45), `${id} hood`);
    assert.ok(inRange(body.ws, 0.3, 2.5), `${id} ws`);
    assert.ok(inRange(body.rr, 0, 3), `${id} rr`);
    assert.ok(inRange(body.crease, 0, 1), `${id} crease`);
    assert.ok(inRange(body.cladding, 0, 1), `${id} cladding`);
    assert.ok(inRange(body.clearance, 0.08, 0.35), `${id} clearance`);
    if (body.accent !== undefined) assert.match(body.accent, HEX, `${id} accent`);
    assert.ok(RIM_STYLES.includes(wheels.style), `${id} wheel style`);
    assert.ok(wheels.spokes >= 5 && wheels.spokes <= 10, `${id} spokes`);
    assert.ok(wheels.size >= 0.45 && wheels.size <= 0.85, `${id} wheel size ${wheels.size}`);
    assert.ok(inRange(wheels.rim, 10, 24), `${id} rim`);
  }
});

test("electric cars show no exhaust tip unless their row says otherwise", () => {
  for (const r of CAR_TABLE.filter((row) => row[3] === "ev")) {
    const id = carId(r[0], r[1]);
    const d = designOf(id);
    assert.notEqual(d.rear.exhaust, "single", `${id} has an exhaust`);
  }
});

test("pickups carry a cab and a bed, vans and minivans with sliding doors say so, convertibles have a soft top", () => {
  for (const r of CAR_TABLE) {
    const d = designOf(carId(r[0], r[1]));
    if (r[2] === "pickup") assert.ok(d.body.cab && d.body.bed, `${r[1]} cab/bed`);
    if (r[2] === "van") assert.equal(d.body.slide, true, `${r[1]} slide`);
    if (r[2] === "convertible") assert.equal(d.body.top, "soft", `${r[1]} top`);
  }
});

test("unknown ids fall back to the generic design without throwing", () => {
  const d = designOf("car_does_not_exist");
  assert.equal(d.face.id, "generic");
  assert.ok(d.wheels.size > 0.5);
});

test("tyre diameter: rim plus two sidewalls, exact when the tyre size is given", () => {
  assert.ok(Math.abs(tyreDiameter(18, "225/55") - 0.7046) < 0.001);
  assert.ok(tyreDiameter(16) < tyreDiameter(18) && tyreDiameter(18) < tyreDiameter(20));
});
