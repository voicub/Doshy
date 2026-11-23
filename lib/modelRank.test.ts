import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { autoCandidates, type SearchHit } from "./modelLibrary.ts";
import { bestFirst, MIN_HEAVY, MIN_SCORE, pickAuto, queriesFor, rankCandidates, type Ranked, type Target } from "./modelRank.ts";

// ---------- fixtures: real Sketchfab search results recorded for five catalogue cars ----------

type Page = { results: { faceCount: number }[] };
const recorded: Record<string, Page> = JSON.parse(readFileSync(new URL("./fixtures/modelSearch.json", import.meta.url), "utf8"));
const byQuery: Record<string, Page> = {};
for (const [key, page] of Object.entries(recorded)) {
  const [, q, license, nocat] = key.split("|");
  byQuery[`${q}|${license}|${nocat ?? "cat"}`] = page; // keys ending in |nocat were recorded without the cars-vehicles filter
}
const calls: string[] = [];
const fixtureFetch = (async (input: unknown) => {
  const u = new URL(String(input));
  const q = u.searchParams.get("q")!;
  calls.push(q);
  const page = byQuery[`${q}|${u.searchParams.get("license")}|${u.searchParams.has("categories") ? "cat" : "nocat"}`] ?? { results: [] };
  const max = Number(u.searchParams.get("max_face_count"));
  return new Response(JSON.stringify({ ...page, results: page.results.filter((r) => r.faceCount <= max) }));
}) as typeof fetch;
const deps = { fetch: fixtureFetch, token: undefined };

const ASX = { id: "car_mitsubishi_asx_2016", label: "Mitsubishi ASX 2016", brand: "Mitsubishi", bodyStyle: "crossover" };
const CARS_UNDER_TEST: [Target, RegExp, RegExp][] = [
  [ASX, /mitsubishi/i, /asx|outlander/i],
  [{ id: "car_volkswagen_golf", label: "Volkswagen Golf", brand: "Volkswagen", bodyStyle: "hatchback" }, /volkswagen|vw/i, /golf/i],
  [{ id: "car_dacia_duster", label: "Dacia Duster", brand: "Dacia", bodyStyle: "suv" }, /dacia/i, /duster/i],
  [{ id: "car_toyota_hilux", label: "Toyota Hilux", brand: "Toyota", bodyStyle: "pickup" }, /toyota/i, /hilux/i],
  [{ id: "car_tesla_model_3", label: "Tesla Model 3", brand: "Tesla", bodyStyle: "sedan" }, /tesla/i, /model 3/i],
];
const UNWANTED = /\b(concept|wreck|crash|damaged|interior|cockpit|rim|tire|toy|lego|minecraft|voxel|decal|sticker|livery|kit|pack|collection|bundle|scene|diorama|garage|police|taxi|rally|race|tuned|drift|wheels?|logo)\b/i;

for (const [target, brand, model] of CARS_UNDER_TEST) {
  test(`recorded search results: ${target.label}`, async () => {
    const list = await autoCandidates(target.id, deps, { heavy: true });
    assert.ok(Array.isArray(list), "no failure expected");
    assert.ok(list.length >= 2);
    assert.match(list[0].hit.name, brand);
    assert.match(list[0].hit.name, model);
    for (const r of list) {
      assert.ok(["cc0", "by", "by-sa"].includes(r.hit.license.slug));
      assert.doesNotMatch(r.hit.name, UNWANTED);
    }
    assert.deepEqual(list.map((r) => r.score), list.map((r) => r.score).sort((a, b) => b - a), "sorted best first");
  });
}

test("recorded Tesla Model 3 results never include other Tesla models", async () => {
  const list = await autoCandidates("car_tesla_model_3", deps, { heavy: true });
  assert.ok(Array.isArray(list));
  for (const r of list) assert.match(`${r.hit.name} ${r.hit.tags.join(" ")}`, /(^|[^0-9])3($|[^0-9])/, r.hit.name);
  assert.ok(!list.some((r) => /model x|model s|wall art/i.test(r.hit.name)));
});

test("recorded Mitsubishi ASX results: the hand-picked ASX MK1 wins, the mislabelled Mondeo never shows", async () => {
  const list = await autoCandidates(ASX.id, deps, { heavy: true });
  assert.ok(Array.isArray(list));
  assert.ok(!list.some((r) => /lancer|wrc/i.test(r.hit.name)), "other Mitsubishi cars are not matches");
  assert.ok(!list.some((r) => r.hit.uid === "79304f5b3fd342ad812cd584695ebbad"), "a Ford Mondeo titled ASX is unusable");
  assert.equal(list[0].hit.uid, "b654aeee32064a3ca3b4693fa65bb09a");
  assert.ok(list[0].reasons.includes("hand-picked"));
  assert.equal(pickAuto(list)?.pick.hit.uid, "b654aeee32064a3ca3b4693fa65bb09a");
  // the light search cannot see the big model: it offers the Outlander Sport, which is why autoImport also looks at big models for a curated car
  const light = await autoCandidates(ASX.id, deps, { heavy: false });
  assert.ok(Array.isArray(light) && !light.some((r) => r.heavy));
  assert.equal(pickAuto(light)?.pick.hit.uid, "adced06d7c614f04a62779e2b0cf549b");
});

test("autoCandidates queries the three licences per name, stops early with enough matches, honours skip", async () => {
  calls.length = 0;
  await autoCandidates("car_volkswagen_golf", deps);
  assert.deepEqual(calls, Array(6).fill("Volkswagen Golf"), "one name: three licences with the car category, three without");
  calls.length = 0;
  await autoCandidates(ASX.id, deps);
  assert.deepEqual([...new Set(calls)], ["Mitsubishi ASX 2016", "Mitsubishi ASX", "Mitsubishi Outlander Sport", "Mitsubishi RVR"]);

  const many = (async (input: unknown) => {
    const u = new URL(String(input));
    calls.push(u.searchParams.get("q")!);
    const slug = u.searchParams.get("license")!;
    const results = Array.from({ length: 4 }, (_, i) => ({ uid: `${slug === "by" ? 1 : slug === "cc0" ? 2 : 3}${i}`.padStart(32, "0"), name: `Mitsubishi ASX ${i}`, faceCount: 20000, likeCount: i, license: { label: slug === "by" ? "CC Attribution" : slug === "cc0" ? "CC0 Public Domain" : "CC Attribution-ShareAlike" } }));
    return new Response(JSON.stringify({ results }));
  }) as typeof fetch;
  calls.length = 0;
  const list = await autoCandidates(ASX.id, { fetch: many, token: undefined });
  assert.ok(Array.isArray(list));
  assert.equal(list.length, 12);
  assert.equal(calls.length, 9, "two names (plus the plain name without the category filter) are enough when 6 good matches turn up");
  const skipped = await autoCandidates(ASX.id, { fetch: many, token: undefined }, { skip: [list[0].hit.uid, list[1].hit.uid] });
  assert.ok(Array.isArray(skipped));
  assert.equal(skipped.length, 10);
  assert.ok(!skipped.some((r) => r.hit.uid === list[0].hit.uid));
});

test("autoCandidates reports failures and unknown cars", async () => {
  const down = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  const r = await autoCandidates(ASX.id, { fetch: down, token: undefined });
  assert.ok(!Array.isArray(r));
  assert.equal(r.error.code, "upstream");
  const unknown = await autoCandidates("car_nope", deps);
  assert.ok(!Array.isArray(unknown) && unknown.error.code === "bad_request");
});

// ---------- synthetic hits ----------

let n = 0;
const hit = (name: string, o: Partial<SearchHit> = {}): SearchHit => ({
  uid: (++n).toString(16).padStart(32, "0"),
  name,
  author: "A",
  authorUrl: "",
  license: { slug: "by", label: "CC BY 4.0" },
  faces: 20000,
  glbBytes: 1e6,
  thumb: "",
  url: "",
  tags: [],
  likes: 0,
  views: 0,
  published: "",
  textures: null,
  textureMax: null,
  ...o,
});
const names = (t: Target, hits: SearchHit[]) => rankCandidates(t, hits).map((r) => r.hit.name);
const one = (t: Target, h: SearchHit) => rankCandidates(t, [h])[0];
const HILUX = { id: "car_toyota_hilux", label: "Toyota Hilux", brand: "Toyota", bodyStyle: "pickup" };
const TESLA = { id: "car_tesla_model_3", label: "Tesla Model 3", brand: "Tesla", bodyStyle: "sedan" };
const OCTAVIA = { id: "car_skoda_octavia_2019", label: "Skoda Octavia 2019", brand: "Skoda", bodyStyle: "estate" };

test("queriesFor: full name, plain name, regional names, no duplicates", () => {
  assert.deepEqual(queriesFor(ASX), ["Mitsubishi ASX 2016", "Mitsubishi ASX", "Mitsubishi Outlander Sport", "Mitsubishi RVR"]);
  assert.deepEqual(queriesFor(HILUX), ["Toyota Hilux"]);
  assert.deepEqual(queriesFor({ label: "Opel Corsa", brand: "Opel" }), ["Opel Corsa", "Vauxhall Corsa"]);
  assert.deepEqual(queriesFor({ label: "Peugeot 2008", brand: "Peugeot" }), ["Peugeot 2008"], "a model number that looks like a year stays");
});

test("rejects what is not a plain car of the right model", () => {
  for (const bad of ["Mitsubishi ASX concept", "Toyota Hilux police", "Toyota Hilux wheels", "Toyota Hilux lego", "Toyota Hilux Rally", "Toyota Hilux body kit", "Toyota Hilux widebody", "Toyota Hilux tuned drift", "Toyota Hilux diorama", "Toyota Hilux interior"]) {
    assert.deepEqual(names(HILUX, [hit(bad)]), [], bad);
  }
  const rally = { id: "x", label: "Skoda Fabia Rally", brand: "Skoda", bodyStyle: "hatchback" };
  assert.equal(names(rally, [hit("Skoda Fabia Rally")]).length, 1, "kept when the catalogue name itself says so");
  assert.deepEqual(names(HILUX, [hit("Toyota Land Cruiser")]), [], "wrong model");
  assert.deepEqual(names(HILUX, [hit("Ford Hilux")]), [], "wrong brand");
  assert.deepEqual(names(HILUX, [hit("Hilux")]), [], "brand missing everywhere");
  assert.deepEqual(names(HILUX, [hit("Pickup truck", { tags: ["ford", "ranger"] })]), []);
  assert.equal(names(HILUX, [hit("Hilux", { tags: ["toyota"] })]).length, 1, "brand found in the tags is enough");
});

test("single digits and letters in a model name must match (Model 3 is not Model S)", () => {
  assert.deepEqual(names(TESLA, [hit("Tesla Model S"), hit("Tesla Model X Plaid"), hit("Tesla Model 3 Performance")]), ["Tesla Model 3 Performance"]);
  assert.deepEqual(names({ id: "x", label: "Mazda 3", brand: "Mazda", bodyStyle: "hatchback" }, [hit("Mazda 6"), hit("Mazda 3 2019")]), ["Mazda 3 2019"]);
  assert.equal(names({ id: "x", label: "Peugeot 2008", brand: "Peugeot", bodyStyle: "suv" }, [hit("Peugeot 2008 GT"), hit("Peugeot 3008")]).length, 1);
});

test("the title counts more than the tags; regional names count less than the real name", () => {
  const title = one(HILUX, hit("Toyota Hilux"));
  const tagged = one(HILUX, hit("Pickup", { tags: ["toyota", "hilux"] }));
  assert.ok(title.score > tagged.score + 15);
  const real = one(ASX, hit("Mitsubishi ASX"));
  const alias = one(ASX, hit("Mitsubishi RVR"));
  const other = one(ASX, hit("Mitsubishi Outlander Sport"));
  assert.ok(real.score > alias.score && alias.score === other.score);
  assert.match(alias.reasons.join(), /alias/);
  assert.equal(names({ id: "x", label: "Opel Corsa", brand: "Opel", bodyStyle: "hatchback" }, [hit("Vauxhall Corsa")]).length, 1);
  assert.equal(names({ id: "x", label: "Volkswagen Golf", brand: "Volkswagen", bodyStyle: "hatchback" }, [hit("VW Golf 7")]).length, 1, "VW is Volkswagen");
});

test("years: generation range for the 2016 ASX, label year plus or minus three otherwise", () => {
  const score = (t: Target, name: string, extra: Partial<SearchHit> = {}) => one(t, hit(name, extra)).score;
  assert.ok(one(ASX, hit("Mitsubishi ASX 2010")).reasons.includes("year fits"), "first generation body");
  assert.ok(one(ASX, hit("Mitsubishi ASX 2016")).reasons.includes("year fits"));
  assert.ok(one(ASX, hit("Mitsubishi ASX 2023")).reasons.includes("year far off"));
  assert.ok(score(ASX, "Mitsubishi ASX 2012") > score(ASX, "Mitsubishi ASX 2023"));
  const nearby = one(ASX, hit("Mitsubishi ASX 2018")); // 2 years past the range: neither good nor bad
  assert.ok(!nearby.reasons.includes("year fits") && !nearby.reasons.includes("year far off"));
  assert.ok(one(ASX, hit("Mitsubishi ASX", { tags: ["2012"] })).reasons.includes("year fits"), "years in tags count");
  assert.ok(one(ASX, hit("Mitsubishi ASX 2005 to 2012")).reasons.includes("year fits"), "the year closest to the target is used");
  assert.ok(!one(ASX, hit("Mitsubishi ASX")).reasons.some((r) => r.startsWith("year")), "no year, no opinion");
  assert.ok(one(OCTAVIA, hit("Skoda Octavia 2018")).reasons.includes("year fits"));
  assert.ok(one(OCTAVIA, hit("Skoda Octavia 2008")).reasons.includes("year far off"));
  assert.ok(!one(HILUX, hit("Toyota Hilux 2015")).reasons.some((r) => r.startsWith("year")), "a label without a year does not judge years");
  assert.ok(one(HILUX, hit("Toyota Hilux 1983")).reasons.includes("old model"));
});

test("size: good range preferred, heavy marked and penalised, tiny penalised", () => {
  const f = (faces: number) => one(HILUX, hit("Toyota Hilux", { faces }));
  assert.ok(f(50000).score > f(180000).score && f(180000).score > f(400000).score);
  assert.equal(f(150000).heavy, false);
  assert.equal(f(200000).heavy, true);
  assert.equal(f(199999).heavy, false);
  assert.ok(f(800).score < f(5000).score);
  assert.ok(f(800).reasons.includes("very simple"));
  assert.ok(f(300000).reasons.includes("heavy"));
});

test("likes break ties (capped) and a matching body type helps", () => {
  const likes = (l: number) => one(HILUX, hit("Toyota Hilux", { likes: l })).score;
  assert.ok(likes(100) > likes(1));
  assert.equal(likes(10 ** 6), likes(10 ** 9), "capped at +5");
  const body = one(HILUX, hit("Toyota Hilux", { tags: ["pickup"] })).score - one(HILUX, hit("Toyota Hilux")).score;
  assert.ok(body > 0);
  assert.equal(one(TESLA, hit("Tesla Model 3 saloon")).reasons.includes("body type"), true, "synonyms count: saloon is a sedan");
});

test("rankCandidates sorts best first; bestFirst skips tried models", () => {
  const list = rankCandidates(HILUX, [hit("Toyota Hilux", { faces: 400000 }), hit("Toyota Hilux Low Poly"), hit("Toyota Hilux", { likes: 500 })]);
  assert.deepEqual(list.map((r) => r.score), list.map((r) => r.score).sort((a, b) => b - a));
  assert.equal(list[0].hit.likes, 500);
  assert.equal(bestFirst(list, { skip: [list[0].hit.uid] }).length, 2);
  assert.equal(bestFirst(list).length, 3);
});

// ---------- pickAuto ----------

let k = 0;
const r = (score: number, heavy = false, extra: Partial<Ranked> = {}): Ranked => ({ hit: hit(`m${++k}`), score, heavy, reasons: [], scan: false, exact: true, ...extra });

test("pickAuto prefers a light model unless a heavy one is clearly better", () => {
  const light = r(55);
  const heavy = r(65, true);
  assert.equal(pickAuto([heavy, light])?.pick, light, "heavy is only 10 better");
  const heavier = r(71, true);
  assert.equal(pickAuto([heavier, light])?.pick, heavier, "16 better wins");
  assert.equal(pickAuto([r(50, true), r(MIN_SCORE)])?.pick.score, MIN_SCORE);
});

test("pickAuto falls back to heavy or weak matches, and gives up below the minimum", () => {
  const h = r(MIN_HEAVY + 1, true);
  assert.equal(pickAuto([r(MIN_SCORE - 1), h])?.pick, h, "light below the minimum loses to an acceptable heavy one");
  const weak = r(MIN_HEAVY + 2);
  assert.equal(pickAuto([weak])?.pick, weak);
  assert.equal(pickAuto([r(MIN_HEAVY - 1), r(10, true)]), null);
  assert.equal(pickAuto([]), null);
});

test("pickAuto lists at most five alternatives in rank order without the pick", () => {
  const list = Array.from({ length: 9 }, (_, i) => r(80 - i));
  const out = pickAuto([...list].reverse())!;
  assert.equal(out.pick, list[0]);
  assert.deepEqual(out.alternatives, list.slice(1, 6));
});

// ---------- scans ----------

test("scans are recognised by words or by one huge baked texture and ranked lower", () => {
  const clean = one(HILUX, hit("Toyota Hilux")).score;
  for (const h of [hit("Toyota Hilux photogrammetry"), hit("Toyota Hilux Photoscanned"), hit("Toyota Hilux", { tags: ["scan"] }), hit("Toyota Hilux 3D scan"), hit("Toyota Hilux", { tags: ["polycam"] }), hit("Toyota Hilux", { textures: 1, textureMax: 8192 })]) {
    const s = one(HILUX, h);
    assert.equal(s.scan, true, h.name + h.tags);
    assert.ok(s.score < clean, "a scan ranks below the clean model");
  }
  for (const h of [hit("Toyota Hilux", { textures: 1, textureMax: 2048 }), hit("Toyota Hilux", { textures: 9, textureMax: 4096 }), hit("Toyota Hilux", { textures: 0, textureMax: null }), hit("Toyota Hilux Scanner"), hit("Toyota Hilux"), hit("Toyota Hilux", { textures: null })]) {
    assert.equal(one(HILUX, h).scan, false, h.name);
  }
});

test("pickAuto swaps a scan for a clean model of the exact name that is within 20 points", () => {
  const scan = r(60, false, { scan: true });
  const clean = r(45, true);
  assert.equal(pickAuto([scan, clean])?.pick, clean, "15 behind: quality over weight");
  assert.equal(pickAuto([scan, r(39, true)])?.pick, scan, "21 behind: keep the scan");
  assert.equal(pickAuto([scan, r(50, true, { exact: false })])?.pick, scan, "regional-name matches do not replace a scan");
  assert.equal(pickAuto([scan, r(50, true, { scan: true })])?.pick, scan);
  assert.equal(pickAuto([scan, r(50, true, { reasons: ["year far off"] })])?.pick, scan, "wrong generation");
  assert.equal(pickAuto([scan, r(MIN_HEAVY - 1, true)])?.pick, scan, "too weak to trust");
  const plain = r(60);
  assert.equal(pickAuto([plain, r(70, true)])?.pick, plain, "no scan: the usual rule");
  assert.deepEqual(pickAuto([scan, clean])!.alternatives, [scan]);
});
