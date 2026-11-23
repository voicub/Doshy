import assert from "node:assert/strict";
import { test } from "node:test";
import { groupCategories, searchKinds, sizeClass, type Searchable } from "./catalogSearch.ts";

const cat: Record<string, Searchable> = {
  sofa_3: { label: "Three-seat sofa", brand: "IKEA", cat: "Living" },
  armchair: { label: "Armchair", brand: "JYSK", cat: "Living" },
  tv_55: { label: "Television 55 in", brand: "Generic", cat: "Living" },
  fridge_a: { label: "Refrigerator", brand: "Generic", cat: "Appliances" },
  car_suv: { label: "Family car", brand: "Generic", cat: "Garage & EV", tags: "suv crossover ev" },
  lamp_f: { label: "Floor lamp", brand: "IKEA", cat: "Lighting & devices" },
  ac: { label: "Air conditioner", brand: "Generic", cat: "Climate" },
  back: { label: "Backrest", brand: "Generic", cat: "Decor" },
};
const kinds = Object.keys(cat);

test("plain words find the catalog's words", () => {
  assert.deepEqual(searchKinds(cat, kinds, "couch"), ["sofa_3"]);
  assert.deepEqual(searchKinds(cat, kinds, "telly"), ["tv_55"]);
  assert.deepEqual(searchKinds(cat, kinds, "fridge"), ["fridge_a"]);
  assert.deepEqual(searchKinds(cat, kinds, "sofas"), ["sofa_3"]);
});

test("a typed start of a word is enough, and every word must hit", () => {
  assert.deepEqual(searchKinds(cat, kinds, "cou"), ["sofa_3"]);
  assert.deepEqual(searchKinds(cat, kinds, "ikea lamp"), ["lamp_f"]);
  assert.deepEqual(searchKinds(cat, kinds, "ikea fridge"), []);
});

test("tags are searched and short synonyms only match whole word starts", () => {
  assert.deepEqual(searchKinds(cat, kinds, "crossover"), ["car_suv"]);
  assert.ok(!searchKinds(cat, kinds, "ac").includes("back"));
  assert.deepEqual(searchKinds(cat, kinds, "aircon"), ["ac"]);
});

test("an empty search is everything, in order; kinds without a match are left out", () => {
  assert.deepEqual(searchKinds(cat, kinds, "  "), kinds);
  const r = searchKinds({ a: { label: "Sofa bed", brand: "Generic", cat: "Bedroom" }, b: { label: "Seat", brand: "Generic", cat: "Living" } }, ["b", "a"], "sofa");
  assert.deepEqual(r, ["a"]);
});

test("size classes and category groups", () => {
  assert.equal(sizeClass({ w: 0.4, d: 0.4 }), "small");
  assert.equal(sizeClass({ w: 1.2, d: 0.6 }), "medium");
  assert.equal(sizeClass({ w: 2.2, d: 0.9 }), "large");
  const g = groupCategories(["Living", "Outdoor", "Brand new"]);
  assert.deepEqual(g.map((x) => x.id), ["rooms", "out", "more"]);
  assert.deepEqual(g[2].cats, ["Brand new"]);
});

test("a piece that was edited (new def object under the same kind) is searched by its new words", () => {
  const catalog: Record<string, Searchable> = { mine: { label: "Sofa", brand: "Mine", cat: "Living" } };
  assert.deepEqual(searchKinds(catalog, ["mine"], "sofa"), ["mine"]);
  catalog.mine = { label: "Lamp", brand: "Mine", cat: "Living" };
  assert.deepEqual(searchKinds(catalog, ["mine"], "sofa"), []);
  assert.deepEqual(searchKinds(catalog, ["mine"], "lamp"), ["mine"]);
});
