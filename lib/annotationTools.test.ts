import test from "node:test";
import assert from "node:assert/strict";
import { ANNOTATION_COLORS, annotationLabel, annotationsOnLevel, buildAnnotation, dimensionOf, hitAnnotation, movedBy, pinPoint, type Draft } from "./annotationTools.ts";
import { addAnnotation, patchAnnotation, removeAnnotation, sanitizeAnnotations } from "./annotations.ts";
import type { Annotation } from "./designTypes.ts";
import type { Plan } from "./types.ts";

const draft = (o: Partial<Draft>): Draft => ({ kind: "note", a: { x: 1, y: 2 }, b: { x: 4, y: 6 }, text: "Hi", color: "#5ad7ff", pin: false, ...o });
const basePlan = (extra: Partial<Plan> = {}): Plan => ({ walls: [], openings: [], rooms: [], items: [], ...extra }) as Plan;

test("a note needs words; the colour and level are kept", () => {
  assert.deepEqual(buildAnnotation(draft({}), "n1", "L0"), { id: "n1", level: "L0", color: "#5ad7ff", kind: "note", x: 1, y: 2, text: "Hi" });
  assert.equal(buildAnnotation(draft({ text: "   " }), "n1", "L0"), null);
});

test("a zone is the rectangle between two corners, whichever way it was dragged", () => {
  const z = buildAnnotation(draft({ kind: "zone", a: { x: 4, y: 6 }, b: { x: 1, y: 2 }, text: "Radiator here" }), "z", "L0");
  assert.ok(z && z.kind === "zone");
  assert.deepEqual([z.x, z.y, z.w, z.h], [1, 2, 3, 4]);
});

test("a zone dragged by accident (smaller than 10 cm) or an arrow of no length is not made", () => {
  assert.equal(buildAnnotation(draft({ kind: "zone", a: { x: 1, y: 1 }, b: { x: 1.05, y: 3 }, text: "x" }), "z", "L0"), null);
  assert.equal(buildAnnotation(draft({ kind: "arrow", a: { x: 1, y: 1 }, b: { x: 1.01, y: 1 } }), "a", "L0"), null);
  assert.equal(buildAnnotation(draft({ kind: "dimension", a: { x: 1, y: 1 }, b: { x: 1, y: 1 } }), "d", "L0"), null);
});

test("an arrow's words are optional; a pin is only for notes and zones", () => {
  const arrow = buildAnnotation(draft({ kind: "arrow", text: "", pin: true }), "a", "L0");
  assert.ok(arrow && arrow.kind === "arrow");
  assert.equal(arrow.text, undefined);
  assert.equal(arrow.pin, undefined);
  assert.equal(buildAnnotation(draft({ pin: true }), "n", "L0")?.pin, true);
  assert.equal(buildAnnotation(draft({ kind: "dimension", pin: true }), "d", "L0")?.pin, undefined);
});

test("a dimension says its real length; a kept measure becomes one", () => {
  const d = dimensionOf({ x: 0, y: 0 }, { x: 3, y: 4 }, "d1", "L0");
  assert.ok(d);
  assert.equal(annotationLabel(d), "5.00 m");
  assert.equal(annotationLabel({ id: "n", kind: "note", x: 0, y: 0, text: "Plug" }), "Plug");
});

test("a 3D pin stands on a note's point or in the middle of a zone, never for lines", () => {
  assert.deepEqual(pinPoint({ id: "n", kind: "note", x: 1, y: 2, text: "t" }), { x: 1, y: 2 });
  assert.deepEqual(pinPoint({ id: "z", kind: "zone", x: 1, y: 2, w: 2, h: 4, text: "t" }), { x: 2, y: 4 });
  assert.equal(pinPoint({ id: "a", kind: "arrow", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }), null);
});

const list: Annotation[] = [
  { id: "zone", kind: "zone", x: 0, y: 0, w: 4, h: 4, text: "Big" },
  { id: "small", kind: "zone", x: 1, y: 1, w: 1, h: 1, text: "Small" },
  { id: "note", kind: "note", x: 1.5, y: 1.5, text: "N" },
  { id: "arrow", kind: "arrow", a: { x: 3, y: 0 }, b: { x: 3, y: 3 } },
];

test("a click finds the nearest note or line within reach before any zone", () => {
  assert.equal(hitAnnotation(list, { x: 1.55, y: 1.5 }, 0.1), "note");
  assert.equal(hitAnnotation(list, { x: 3.05, y: 2 }, 0.1), "arrow");
});

test("inside zones the smallest one wins; outside everything nothing is hit", () => {
  assert.equal(hitAnnotation(list, { x: 1.9, y: 1.1 }, 0.1), "small");
  assert.equal(hitAnnotation(list, { x: 0.5, y: 3.5 }, 0.1), "zone");
  assert.equal(hitAnnotation(list, { x: 9, y: 9 }, 0.1), null);
});

test("a finger's reach finds a note a thumb away, a mouse does not", () => {
  assert.equal(hitAnnotation(list.slice(2, 3), { x: 1.8, y: 1.5 }, 0.1), null);
  assert.equal(hitAnnotation(list.slice(2, 3), { x: 1.8, y: 1.5 }, 0.35), "note");
});

test("moving shifts every point of the annotation", () => {
  assert.deepEqual(movedBy(list[2], 1, -1), { x: 2.5, y: 0.5 });
  assert.deepEqual(movedBy(list[3], 1, 1), { a: { x: 4, y: 1 }, b: { x: 4, y: 4 } });
});

test("a move goes through patchAnnotation and the original is untouched", () => {
  const plan = basePlan({ annotations: list });
  const next = patchAnnotation(plan, "note", movedBy(list[2], 1, 1));
  assert.deepEqual(next.annotations?.find((a) => a.id === "note"), { id: "note", kind: "note", x: 2.5, y: 2.5, text: "N" });
  assert.deepEqual(plan.annotations?.find((a) => a.id === "note"), { id: "note", kind: "note", x: 1.5, y: 1.5, text: "N" }); // the plan it came from is unchanged
});

test("only the level shown is listed; an annotation without a level is on the first one", () => {
  const plan = basePlan({ levels: [{ id: "L0", name: "G", elevation: 0, height: 2.78 }, { id: "L1", name: "1", elevation: 2.78, height: 2.78 }], annotations: [{ id: "a", kind: "note", x: 0, y: 0, text: "g" }, { id: "b", kind: "note", x: 0, y: 0, text: "up", level: "L1" }] });
  assert.deepEqual(annotationsOnLevel(plan, "L0").map((a) => a.id), ["a"]);
  assert.deepEqual(annotationsOnLevel(plan, "L1").map((a) => a.id), ["b"]);
});

test("add, edit the words and delete round-trip through the plan and survive a reload", () => {
  const made = buildAnnotation(draft({ pin: true }), "n1", "L0");
  assert.ok(made);
  let plan = addAnnotation(basePlan(), made);
  plan = patchAnnotation(plan, "n1", { text: "Ask about this socket" });
  assert.deepEqual(sanitizeAnnotations(JSON.parse(JSON.stringify(plan.annotations))), plan.annotations);
  assert.equal(patchAnnotation(plan, "n1", { text: "   " }), plan, "emptying a note's words is refused");
  assert.equal(removeAnnotation(plan, "n1").annotations, undefined);
});

test("six colour swatches, all valid hex", () => {
  assert.equal(ANNOTATION_COLORS.length, 6);
  for (const c of ANNOTATION_COLORS) assert.match(c, /^#[0-9a-f]{6}$/);
});
