import assert from "node:assert/strict";
import { test } from "node:test";
import { COLOR_RE, ICON_RE, MAX_NAME, freeName, planSettingsKey } from "./planIdentity.ts";

test("a plan's settings row is housey-plan.<id>", () => {
  assert.equal(planSettingsKey(7), "housey-plan.7");
});

test("a free name: the base itself, else base 2, base 3...; names are compared ignoring case", () => {
  assert.equal(freeName("Garden", []), "Garden");
  assert.equal(freeName("Garden", ["Home"]), "Garden");
  assert.equal(freeName("Garden", ["garden"]), "Garden 2");
  assert.equal(freeName("Garden", ["Garden", "GARDEN 2", "Garden 3"]), "Garden 4");
});

test("a long name is shortened to leave room for the number, never past the limit", () => {
  const long = "x".repeat(MAX_NAME);
  const name = freeName(long, [long]);
  assert.equal(name.length, MAX_NAME);
  assert.ok(name.endsWith(" 2"));
});

test("icons are lowercase keys and colours are #rrggbb", () => {
  for (const ok of ["house", "tree-2", "a"]) assert.ok(ICON_RE.test(ok), ok);
  for (const bad of ["", "House", "has space", "x".repeat(33)]) assert.ok(!ICON_RE.test(bad), bad);
  for (const ok of ["#abcdef", "#ABCDEF", "#000000"]) assert.ok(COLOR_RE.test(ok), ok);
  for (const bad of ["abcdef", "#abc", "#abcdeg", "#abcdef0"]) assert.ok(!COLOR_RE.test(bad), bad);
});
