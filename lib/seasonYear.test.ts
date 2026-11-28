import test from "node:test";
import assert from "node:assert/strict";
import { canopyFullness, dateOfDay, dayOfYear, forcedYear, gardenWords, leafPileAt, lyingSnow, ringBlend, yearAt, yearLook, yearPalette, yearPhase } from "./seasonYear.ts";
import { seasonPalette } from "./season.ts";
import { foliageLookAt } from "./vegetation.ts";
import { computeSky } from "./sky.ts";
import type { HAState } from "./ha.ts";

const BUC = 44.43;
const SYD = -33.9;
const at = (m: number, d: number, y = 2026) => new Date(y, m - 1, d, 12);
const day = (m: number, d: number) => dayOfYear(at(m, d));
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test("the year phase follows the date, and the southern hemisphere is half a year away", () => {
  assert.equal(day(1, 1), 0);
  assert.equal(day(12, 31), 364);
  assert.ok(yearPhase(at(1, 1), BUC) < 0.01);
  assert.ok(Math.abs(yearPhase(at(7, 1), BUC) - yearPhase(at(1, 1), SYD)) < 0.01, "1 July north is 1 January south");
  // a Sydney Christmas is a Bucharest midsummer: full canopy, no snow
  const xmasSouth = yearAt(at(12, 25), SYD);
  assert.ok(xmasSouth.leafy > 0.99 && xmasSouth.snow === 0);
  assert.ok(yearAt(at(12, 25), BUC).leafy === 0);
  // every phase of a leap year stays inside 0..1
  for (let d = 0; d < 366; d++) {
    const p = yearPhase(new Date(2028, 0, 1 + d, 9), d % 2 ? SYD : BUC);
    assert.ok(p >= 0 && p < 1, `${d}: ${p}`);
  }
});

test("the canopy is bare in winter, opens in spring, is full in summer, thins in autumn and is bare again", () => {
  assert.ok(canopyFullness(day(2, 1)) < 0.01);
  const april = canopyFullness(day(4, 30));
  assert.ok(april > 0.1 && april < 0.9, `end of April ${april}`);
  assert.ok(canopyFullness(day(7, 15)) > 0.99);
  const october = canopyFullness(day(10, 25));
  assert.ok(october > 0.1 && october < 0.9, `late October ${october}`);
  assert.ok(canopyFullness(day(12, 15)) < 0.01);
  for (let d = day(3, 20); d < day(6, 1); d++) assert.ok(canopyFullness(d + 1) >= canopyFullness(d), "fills monotonically in spring");
  for (let d = day(10, 1); d < day(11, 30); d++) assert.ok(canopyFullness(d + 1) <= canopyFullness(d), "thins monotonically in autumn");
});

test("leaves are green in summer, orange in late October and brown by December", () => {
  const leafOf = (m: number, d: number) => rgb(foliageLookAt(yearAt(at(m, d), BUC, 10), 1).leaf[0]);
  const [sr, sg, sb] = leafOf(7, 15);
  assert.ok(sg > sr && sg > sb, `summer green ${[sr, sg, sb]}`);
  const [or, og, ob] = leafOf(10, 30);
  assert.ok(or > og && og > ob, `autumn orange ${[or, og, ob]}`);
  const [dr, dg, db] = leafOf(12, 10);
  assert.ok(dr < or && dr - db < or - ob, `December is duller and browner ${[dr, dg, db]}`);
  assert.ok(leafOf(9, 1)[1] > leafOf(9, 1)[0], "still green on 1 September");
});

test("blossom is a few weeks in spring and nothing else", () => {
  assert.ok(yearAt(at(4, 25), BUC).blossom > 0.9);
  for (const [m, d] of [[1, 15], [3, 1], [6, 15], [7, 15], [10, 15]]) assert.equal(yearAt(at(m, d), BUC).blossom, 0, `${m}/${d}`);
});

test("fallen leaves pile up from mid October, last through the winter, and are gone by spring", () => {
  assert.equal(leafPileAt(day(10, 1)), 0);
  assert.ok(leafPileAt(day(11, 25)) > 0.95);
  assert.ok(leafPileAt(day(1, 20)) > 0.95);
  assert.equal(leafPileAt(day(5, 15)), 0);
  assert.ok(Math.abs(leafPileAt(364) - leafPileAt(0)) < 0.01, "no jump at New Year");
  const nov = yearAt(at(11, 20), BUC, 8);
  assert.ok(nov.falling > 0.3, "leaves in the air in November");
});

test("snow lies in cold weather in the cold season, not on a mild winter day or in summer", () => {
  assert.equal(lyingSnow(day(1, 15), BUC, -5), 1);
  assert.equal(lyingSnow(day(1, 15), BUC, 8), 0);
  assert.equal(lyingSnow(day(7, 15), BUC, -5), 0);
  const between = lyingSnow(day(1, 15), BUC, 1);
  assert.ok(between > 0.2 && between < 0.8, `${between}`);
  // no temperature known: the calendar's winter, thinning toward the tropics
  assert.equal(lyingSnow(day(1, 15), BUC), 1);
  assert.equal(lyingSnow(day(7, 15), BUC), 0);
  assert.equal(lyingSnow(day(1, 15), 10), 0);
  // the hemisphere decides which July is cold
  assert.equal(yearAt(at(7, 15), SYD, -3).snow, 1);
  assert.equal(yearAt(at(7, 15), BUC, -3).snow, 0);
});

test("the lawn palette moves through the year and a mild winter is not white", () => {
  const spring = yearPalette(yearAt(at(4, 20), BUC, 12));
  const summer = yearPalette(yearAt(at(7, 1), BUC, 25));
  const late = yearPalette(yearAt(at(8, 28), BUC, 25));
  assert.notEqual(spring.ground, summer.ground);
  const [lr, lg] = rgb(late.ground), [sr, sg] = rgb(summer.ground);
  assert.ok(lr / lg > sr / sg, "late summer turns golden: more red against green than at midsummer");
  const snowy = seasonPalette("winter", 0, 1), mild = seasonPalette("winter", 0, 0);
  assert.deepEqual(snowy, seasonPalette("winter", 0), "snow is on by default");
  assert.ok(rgb(snowy.ground).every((c) => c > 220), "snow is white");
  assert.ok(rgb(mild.ground).every((c) => c < 170), "a mild winter lawn is not");
  assert.equal(mild.snow, 0);
  assert.deepEqual(seasonPalette("autumn", 0, 0), seasonPalette("autumn", 0, 1), "snow is not asked of an autumn day");
});

test("the ring position is a season and the way to the next", () => {
  assert.deepEqual(ringBlend(0), { season: "spring", next: "summer", mix: 0 });
  assert.deepEqual(ringBlend(3.5), { season: "winter", next: "spring", mix: 0.5 });
  assert.deepEqual(ringBlend(7), { season: "winter", next: "spring", mix: 0 });
});

test("a season chosen by hand shows that season as before", () => {
  assert.deepEqual(forcedYear("autumn").palette, { season: "autumn", next: "winter", mix: 0 });
  assert.equal(forcedYear("winter").snow, 1);
  assert.equal(forcedYear("winter").leafy, 0);
  assert.equal(forcedYear("autumn").falling, 1);
  assert.equal(forcedYear("spring").blossom, 1);
  assert.equal(forcedYear("summer").leafy, 1);
});

test("foliage by tier: the lowest changes tints only, Balanced thins the canopy, Detailed adds blossom and the leaf litter", () => {
  const apr = yearAt(at(4, 15), BUC, 10);
  assert.ok([0, 1].includes(foliageLookAt(apr, 0).leafy), "Eco and Light: in leaf or bare");
  const balanced = foliageLookAt(apr, 1).leafy;
  assert.ok(balanced > 0 && balanced < 1 && balanced === apr.leafy);
  const late = yearAt(at(4, 25), BUC, 10);
  assert.equal(foliageLookAt(late, 2).blossom, late.blossom);
  assert.equal(foliageLookAt(late, 1).blossom, foliageLookAt(late, 0).blossom, "the lighter tiers keep the four-step blossom");
  const nov = yearAt(at(11, 20), BUC, 8);
  assert.ok(foliageLookAt(nov, 2).litterShare > foliageLookAt(nov, 1).litterShare, "leaf litter piles up on the Detailed tiers");
  assert.ok(foliageLookAt(yearAt(at(1, 15), BUC, -5), 2).litterShare < foliageLookAt(yearAt(at(1, 15), BUC, 5), 2).litterShare, "snow buries leaves");
  assert.ok(foliageLookAt(yearAt(at(3, 1), BUC, 5), 1).growth < 0.7 && foliageLookAt(yearAt(at(6, 1), BUC, 20), 1).growth > 0.95, "thin lawn in March, thick in June");
  assert.equal(foliageLookAt(yearAt(at(3, 1), BUC, 5), 0).growth, 1);
});

test("the garden says what it is doing", () => {
  const words = (m: number, d: number, t: number) => gardenWords(yearAt(at(m, d), BUC, t));
  assert.equal(words(1, 15, -5), "Under snow");
  assert.equal(words(2, 10, 4), "Bare branches, leaves on the ground");
  assert.equal(words(4, 25, 12), "Blossom out");
  assert.equal(words(5, 12, 15), "Buds opening");
  assert.equal(words(7, 15, 25), "Green and full");
  assert.equal(words(10, 28, 10), "Leaves falling");
});

test("the sun and the garden follow a previewed date, and the preview ignores Home Assistant's sun for today", () => {
  const states = {
    "sun.sun": { entity_id: "sun.sun", state: "above_horizon", attributes: { elevation: 12, azimuth: 250 } } satisfies HAState,
    "zone.home": { entity_id: "zone.home", state: "zoning", attributes: { latitude: BUC, longitude: 26.1 } } satisfies HAState,
  };
  const choices = { timeMode: "auto", weatherMode: "auto" } as const;
  const today = computeSky(states, new Date(2026, 6, 1, 12), choices, "day");
  assert.equal(today.source, "sun.sun");
  const july = computeSky(states, dateOfDay(2026, day(7, 1), new Date(2026, 0, 1, 12)), { ...choices, preview: true }, "day");
  const december = computeSky(states, dateOfDay(2026, day(12, 21), new Date(2026, 0, 1, 12)), { ...choices, preview: true }, "day");
  assert.equal(july.source, "computed");
  assert.ok(july.elevation > december.elevation + 30, `noon sun ${july.elevation} vs ${december.elevation}`);
  assert.ok(july.year.leafy > 0.99 && december.year.leafy === 0);
});

test("a look is the same whatever the time of day", () => {
  assert.deepEqual(yearAt(new Date(2026, 4, 5, 0, 5), BUC, 12), yearAt(new Date(2026, 4, 5, 23, 55), BUC, 12));
  assert.deepEqual(yearLook(0.3, 0.52).snow, 0.5);
});
