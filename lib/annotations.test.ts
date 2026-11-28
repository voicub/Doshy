import assert from "node:assert/strict";
import test from "node:test";
import { MAX_ANNOTATIONS, addAnnotation, patchAnnotation, removeAnnotation, sanitizeAnnotations } from "./annotations.ts";
import { withDesign } from "./designFields.ts";
import type { Annotation } from "./designTypes.ts";
import type { Plan } from "./types.ts";

const empty = (): Plan => ({ walls: [], openings: [], rooms: [], items: [] });
const note: Annotation = { id: "n1", kind: "note", x: 1, y: 2, text: "Radiator here", color: "#ff8800" };

test("a saved plan keeps its valid annotations and loses the broken ones", () => {
  const kept = sanitizeAnnotations([
    note,
    { id: "z1", kind: "zone", x: 0, y: 0, w: 1, h: 2, text: "Pipe in the wall", pin: true, junk: 1 },
    { id: "bad1", kind: "note", x: "1", y: 2, text: "x" }, // not a number
    { id: "bad2", kind: "zone", x: 0, y: 0, w: 0, h: 1, text: "flat" }, // no size
    { id: "bad3", kind: "note", x: 0, y: 0, text: "   " }, // no text
    { id: "n1", kind: "note", x: 9, y: 9, text: "same id twice" },
    { id: "../x", kind: "note", x: 0, y: 0, text: "bad id" },
    { id: "q", kind: "stamp" },
    "nope",
  ]);
  assert.deepEqual(kept?.map((a) => a.id), ["n1", "z1"]);
  assert.equal(kept?.[1].pin, true);
  assert.ok(kept && !("junk" in kept[1]));
});

test("no annotations means no field, so older plans stay as they were", () => {
  assert.equal(sanitizeAnnotations(undefined), undefined);
  assert.equal(sanitizeAnnotations([]), undefined);
  assert.equal(sanitizeAnnotations({ id: "n1" }), undefined);
  const plan = empty();
  assert.equal(withDesign(plan), plan);
});

test("colours must be hex and text is cut to a sane length", () => {
  const [a] = sanitizeAnnotations([{ id: "a", kind: "note", x: 0, y: 0, text: "x".repeat(500), color: "red" }]) ?? [];
  assert.equal(a.kind === "note" && a.text.length, 200);
  assert.equal(a.color, undefined);
});

test("a hostile file cannot fill the plan with annotations", () => {
  const many = Array.from({ length: MAX_ANNOTATIONS + 50 }, (_, i) => ({ id: `n${i}`, kind: "note", x: 0, y: 0, text: "x" }));
  assert.equal(sanitizeAnnotations(many)?.length, MAX_ANNOTATIONS);
});

test("add, change and remove are plain plan edits, and the last removal drops the field", () => {
  const added = addAnnotation(empty(), note);
  assert.deepEqual(added.annotations, [note]);
  assert.equal(addAnnotation(added, note), added, "the same id twice changes nothing");
  const moved = patchAnnotation(added, "n1", { text: "Radiator moves", kind: "arrow" } as Partial<Annotation>);
  assert.equal(moved.annotations?.[0].kind, "note", "a kind never changes");
  assert.equal(moved.annotations?.[0].kind === "note" && moved.annotations[0].text, "Radiator moves");
  assert.equal(patchAnnotation(added, "n1", { text: "" } as Partial<Annotation>), added, "an edit that would break it is refused");
  assert.equal(patchAnnotation(added, "missing", { text: "x" } as Partial<Annotation>), added);
  const gone = removeAnnotation(added, "n1");
  assert.equal("annotations" in gone, false);
});
