import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apiFilesUrl, creditLine, dimsOf, hdriResFor, isAssetId, isFileUrl, isPhItem, isRadiance, parseAssets, pickHdri, pickMaterial, pickModel, queryItems, thumbUrl, type PhItem } from "./polyhaven.ts";

// recorded from api.polyhaven.com (trimmed): listing records and /files answers
const fixture = JSON.parse(readFileSync(new URL("./polyhaven.fixture.json", import.meta.url), "utf8"));

test("asset ids are file-name safe and nothing else gets into a URL", () => {
  for (const ok of ["ArmChair_01", "horn-koppe_snow", "brick_wall_001"]) assert.ok(isAssetId(ok), ok);
  for (const bad of ["", "a/b", "..", "a b", "a?b=1", "x".repeat(81), "é", 7, null]) assert.equal(isAssetId(bad), false, String(bad));
  assert.throws(() => apiFilesUrl("../etc/passwd"));
  assert.equal(thumbUrl("a/b", 256), null);
  assert.equal(thumbUrl("ArmChair_01", 256, "zz&x=1"), null);
  assert.equal(thumbUrl("ArmChair_01", 128, "abbc4732"), "https://cdn.polyhaven.com/asset_img/thumbs/ArmChair_01.png?width=128&height=128&format=webp&v=abbc4732");
});

test("only https links on Poly Haven's file host under the asset store are followed", () => {
  assert.ok(isFileUrl("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/x_1k.hdr"));
  for (const bad of ["http://dl.polyhaven.org/file/ph-assets/x", "https://dl.polyhaven.org.evil.test/file/ph-assets/x", "https://dl.polyhaven.org:8443/file/ph-assets/x", "https://user@dl.polyhaven.org/file/ph-assets/x", "https://dl.polyhaven.org/other/x", "https://api.polyhaven.com/file/ph-assets/x", "//dl.polyhaven.org/file/ph-assets/x", 5]) {
    assert.equal(isFileUrl(bad), false, String(bad));
  }
});

test("each tier gets the HDRI size it can afford, and Eco and Light none", () => {
  assert.deepEqual(["eco", "low", "medium", "high", "ultra"].map((t) => hdriResFor(t as never)), [null, null, "1k", "1k", "2k"]);
});

test("the listing is shrunk to what the dialogs need, in metres, and bad records are dropped", () => {
  const items = parseAssets("models", fixture.listing.models);
  const chair = items.find((i) => i.id === "ArmChair_01");
  assert.ok(chair && isPhItem(chair));
  assert.deepEqual(chair.dims, [0.848, 0.766, 1.065]); // millimetres in, metres out
  assert.equal(chair.polycount, 5626);
  assert.deepEqual(chair.authors, ["Kirill Sannikov"]);
  assert.equal(creditLine(chair), "Arm Chair 01 by Kirill Sannikov (Poly Haven, CC0)");

  const hostile = parseAssets("textures", { "../x": { name: "no" }, ok_one: { name: "<b>Bold</b>\n name", dimensions: [-1, 5], download_count: "many", categories: "nope" }, ok_two: 5 });
  assert.deepEqual(hostile.map((i) => i.id), ["ok_one"]);
  assert.equal(hostile[0].name, "b Bold /b name");
  assert.equal(hostile[0].dims, undefined);
  assert.equal(hostile[0].downloads, 0);
  assert.deepEqual(parseAssets("hdris", "not an object"), []);
  assert.deepEqual(dimsOf([30000, 30000]), [30, 30]);
  assert.equal(dimsOf([1e9, 5]), undefined);
});

test("search words must all match, a chip narrows, the most downloaded comes first, pages are clamped", () => {
  const all: PhItem[] = parseAssets("textures", fixture.listing.textures);
  const brick = queryItems(all, "textures", { q: "brick" });
  assert.ok(brick.items.length >= 1 && brick.items.every((i) => /brick/.test(`${i.name} ${i.tags} ${i.cats}`.toLowerCase())));
  assert.equal(queryItems(all, "textures", { q: "brick zzzz" }).total, 0);
  const chairs = queryItems(parseAssets("models", fixture.listing.models), "models", { q: "armchair" });
  assert.ok(chairs.items.some((i) => i.id === "ArmChair_01"), "a name with a space is found without it"); // "Arm Chair 01"
  const walls = queryItems(all, "textures", { filter: "wall" });
  assert.ok(walls.items.every((i) => i.use === "wall" || i.use === "ceiling"));
  const sorted = queryItems(all, "textures", {}).items.map((i) => i.downloads);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a));
  const late = queryItems(all, "textures", { page: 999, limit: 2 });
  assert.equal(late.page, Math.ceil(all.length / 2) - 1);
  assert.ok(late.items.length >= 1);
  assert.equal(queryItems(all, "textures", { limit: 1e9 }).limit, 96);
});

test("the right files are picked from a /files answer, and anything off-host or oversized is refused", () => {
  const hdri = pickHdri(fixture.files.hdri, "2k");
  assert.equal(hdri?.res, "2k");
  assert.match(hdri?.url ?? "", /_2k\.hdr$/);
  assert.equal(pickHdri({ hdri: { "1k": fixture.files.hdri.hdri["1k"] } }, "2k")?.res, "1k"); // nearest smaller one
  assert.equal(pickHdri({ hdri: {} }, "1k"), undefined);

  const mat = pickMaterial(fixture.files.texture);
  assert.ok(mat?.diff && mat.rough && mat.nor);
  assert.match(mat.nor.url, /nor_gl_1k\.jpg$/);
  assert.equal(pickMaterial({ Rough: fixture.files.texture.Rough }), undefined); // colour is required
  const evil = JSON.parse(JSON.stringify(fixture.files.texture));
  evil.Diffuse["1k"].jpg.url = "https://evil.test/x.jpg";
  assert.equal(pickMaterial(evil), undefined);

  const model = pickModel(fixture.files.model);
  assert.ok(model);
  assert.equal(Object.keys(model.include).length, 4);
  const sneaky = JSON.parse(JSON.stringify(fixture.files.model));
  sneaky.gltf["1k"].gltf.include["../../etc/passwd"] = sneaky.gltf["1k"].gltf.include["ArmChair_01.bin"];
  assert.equal(pickModel(sneaky), undefined);
  const big = JSON.parse(JSON.stringify(fixture.files.model));
  big.gltf["1k"].gltf.include["ArmChair_01.bin"].size = 70 * 1024 * 1024;
  assert.equal(pickModel(big), undefined);
});

test("a Radiance picture is recognised by its signature", () => {
  const head = (s: string) => Uint8Array.from([...new TextEncoder().encode(s), ...new Uint8Array(80)]);
  assert.ok(isRadiance(head("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n")));
  assert.ok(isRadiance(head("#?RGBE\n")));
  assert.equal(isRadiance(head("<html>")), false);
  assert.equal(isRadiance(new Uint8Array(10)), false);
});
