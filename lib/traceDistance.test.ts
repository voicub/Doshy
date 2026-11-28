import assert from "node:assert/strict";
import { test } from "node:test";
import { lenText, parseDistance } from "./traceDistance.ts";

test("understands the ways people type a length", () => {
  assert.equal(parseDistance("4.2"), 4.2);
  assert.equal(parseDistance("4,2"), 4.2);
  assert.equal(parseDistance("4.2 m"), 4.2);
  assert.equal(parseDistance(" 4.2m "), 4.2);
  assert.equal(parseDistance("420 cm"), 4.2);
  assert.equal(parseDistance("4200mm"), 4.2);
  assert.equal(parseDistance("3 metres"), 3);
  assert.equal(parseDistance(".5"), 0.5);
  assert.equal(parseDistance("4."), 4);
});

test("refuses what is not a usable length", () => {
  for (const bad of ["", "m", "abc", "0", "0 cm", "-3", "4.2.1", "12 ft", "4 m 20", "4,2,1", "1e3", "5000", "NaN"]) assert.equal(parseDistance(bad), null, bad);
});

test("lengths are shown with two decimals under ten metres and one above", () => {
  assert.equal(lenText(4.2), "4.20 m");
  assert.equal(lenText(12.44), "12.4 m");
  assert.equal(lenText(9.999), "10.00 m");
});
