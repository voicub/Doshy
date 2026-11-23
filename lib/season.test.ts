import test from "node:test";
import assert from "node:assert/strict";
import { easterDate, fireworksOn, holidayOn, mixHex, orthodoxEaster, seasonBlend, seasonGroundColor, seasonOf, seasonPalette, westernEaster } from "./season.ts";

const BUC = 44.43;
const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

test("meteorological seasons, flipped in the southern hemisphere", () => {
  assert.equal(seasonOf(at(2026, 3, 1), BUC), "spring");
  assert.equal(seasonOf(at(2026, 5, 31), BUC), "spring");
  assert.equal(seasonOf(at(2026, 6, 1), BUC), "summer");
  assert.equal(seasonOf(at(2026, 11, 20), BUC), "autumn");
  assert.equal(seasonOf(at(2026, 12, 1), BUC), "winter");
  assert.equal(seasonOf(at(2026, 2, 28), BUC), "winter");
  assert.equal(seasonOf(at(2026, 12, 1), -33.9), "summer");
  assert.equal(seasonOf(at(2026, 7, 1), -33.9), "winter");
});

test("the palette cross-fades over the last ten days of a season and restarts at the boundary", () => {
  const early = seasonBlend(at(2026, 11, 15), BUC);
  assert.deepEqual([early.season, early.next, early.mix], ["autumn", "winter", 0]);
  const late = seasonBlend(at(2026, 11, 28), BUC);
  assert.ok(late.mix > 0.4 && late.mix < 1, `mix ${late.mix}`);
  assert.ok(seasonBlend(at(2026, 11, 30, 23, 59), BUC).mix > 0.99);
  const winter = seasonBlend(at(2026, 12, 1, 0, 0), BUC);
  assert.deepEqual([winter.season, winter.next, winter.mix], ["winter", "spring", 0]);
  const feb = seasonBlend(at(2027, 2, 27), BUC); // boundary lies in the next year's March
  assert.deepEqual([feb.season, feb.next], ["winter", "spring"]);
  assert.ok(feb.mix > 0.5);
  assert.ok(seasonBlend(at(2026, 8, 28), BUC).mix > seasonBlend(at(2026, 8, 24), BUC).mix); // monotonic
});

test("Orthodox and Western Easter dates", () => {
  const orthodox: [number, number[]][] = [[2022, [2022, 4, 24]], [2023, [2023, 4, 16]], [2024, [2024, 5, 5]], [2025, [2025, 4, 20]], [2026, [2026, 4, 12]], [2027, [2027, 5, 2]]];
  for (const [y, want] of orthodox) assert.deepEqual(ymd(orthodoxEaster(y)), want, `orthodox ${y}`);
  const western: [number, number[]][] = [[2022, [2022, 4, 17]], [2023, [2023, 4, 9]], [2024, [2024, 3, 31]], [2025, [2025, 4, 20]], [2026, [2026, 4, 5]], [2027, [2027, 3, 28]]];
  for (const [y, want] of western) assert.deepEqual(ymd(westernEaster(y)), want, `western ${y}`);
  assert.deepEqual(ymd(easterDate(2026)), [2026, 4, 12]); // orthodox by default
  assert.deepEqual(ymd(easterDate(2026, "western")), [2026, 4, 5]);
});

test("Easter runs from the Saturday before Palm Sunday to Easter Monday, by rite", () => {
  assert.equal(holidayOn(at(2026, 4, 3), "orthodox"), null); // Friday before the Saturday
  assert.equal(holidayOn(at(2026, 4, 4, 12), "orthodox")?.id, "EASTER"); // Saturday before Palm Sunday
  assert.equal(holidayOn(at(2026, 4, 11, 12), "orthodox")?.id, "EASTER");
  assert.equal(holidayOn(at(2026, 4, 13, 12), "orthodox")?.id, "EASTER"); // Easter Monday
  assert.equal(holidayOn(at(2026, 4, 14, 12), "orthodox"), null);
  assert.equal(holidayOn(at(2026, 4, 5, 12), "western")?.strength, 1); // Western Easter Sunday
  assert.equal(holidayOn(at(2026, 4, 5, 12), "orthodox")?.id, "EASTER"); // still inside the orthodox lead-up window
  assert.equal(holidayOn(at(2026, 4, 20, 12), "western"), null);
});

test("fixed holidays and their windows", () => {
  assert.equal(holidayOn(at(2026, 11, 20)), null);
  assert.equal(holidayOn(at(2026, 12, 1, 12))?.id, "NATIONAL_DAY");
  assert.equal(holidayOn(at(2026, 12, 10))?.id, "CHRISTMAS");
  assert.equal(holidayOn(at(2026, 10, 28))?.id, "HALLOWEEN");
  assert.equal(holidayOn(at(2026, 2, 14))?.id, "VALENTINE");
  assert.equal(holidayOn(at(2026, 3, 5))?.id, "MARTISOR");
  assert.equal(holidayOn(at(2026, 2, 17)), null);
  assert.equal(holidayOn(at(2026, 3, 12)), null);
});

test("Christmas is strongest Dec 20-27, weaker before and after, and fades in at Dec 6", () => {
  const s = (m: number, d: number, h = 12) => holidayOn(at(2026, m, d, h))?.strength ?? 0;
  assert.equal(s(12, 24), 1);
  assert.ok(s(12, 12) > 0.55 && s(12, 12) < 0.7);
  assert.ok(s(12, 19) > s(12, 15) && s(12, 19) < 1);
  assert.ok(s(12, 6, 3) < s(12, 6, 12) && s(12, 6, 3) > 0);
  assert.equal(holidayOn(at(2026, 12, 5, 23)), null);
  assert.equal(holidayOn(at(2027, 1, 5))?.id, "CHRISTMAS"); // spills into the new year
  assert.equal(holidayOn(at(2027, 1, 7)), null);
});

test("the new year wins over Christmas on Dec 31 and fireworks only run around midnight", () => {
  assert.equal(holidayOn(at(2026, 12, 31))?.id, "NEW_YEAR");
  assert.equal(holidayOn(at(2027, 1, 2, 10))?.id, "NEW_YEAR");
  assert.equal(holidayOn(at(2027, 1, 4))?.id, "CHRISTMAS");
  assert.equal(fireworksOn(at(2026, 12, 31, 23, 59)) > 0.99, true);
  assert.equal(fireworksOn(at(2027, 1, 1, 0, 10)) > 0.99, true);
  assert.equal(fireworksOn(at(2026, 12, 31, 23, 30)), 0);
  assert.equal(fireworksOn(at(2027, 1, 1, 0, 25)), 0);
  assert.equal(fireworksOn(at(2026, 7, 1, 0, 0)), 0);
});

test("palettes cross-fade between neighbouring seasons", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(seasonGroundColor("autumn", 0), seasonPalette("autumn", 0).ground);
  assert.equal(seasonGroundColor("autumn", 1), seasonPalette("winter", 0).ground);
  assert.equal(seasonPalette("winter", 0).snow, 1);
  assert.equal(seasonPalette("summer", 0).leafy, 1);
  const mid = seasonPalette("autumn", 0.5);
  assert.ok(mid.snow === 0.5 && mid.leafy < 0.75 && mid.leafy > 0);
});
