import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  attributionLine,
  autoImport,
  gltfZipToGlb,
  importModel,
  isUid,
  licenseSlug,
  readZip,
  searchModels,
  shapeSearch,
  stripGlb,
  tokenBucket,
  validateGlb,
  type AutoMeta,
  type AutoOk,
  type Failure,
} from "./modelLibrary.ts";

// ---------- helpers ----------

const uid = (n: number) => n.toString(16).padStart(32, "0");
const pad4 = (n: number) => (n + 3) & ~3;

const TRIANGLE = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);

/** A tiny GLB: one triangle, one material. `over` patches the JSON. */
function glb(over: Record<string, unknown> = {}, bin: Uint8Array | null = TRIANGLE, rawJson?: string): Uint8Array {
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "tri", camera: 0, extras: { secret: 1 }, extensions: { KHR_lights_punctual: { light: 0 } } }],
    cameras: [{ type: "perspective", perspective: { yfov: 1, znear: 0.1 } }],
    animations: [{ channels: [], samplers: [] }],
    meshes: [{ name: "tri", primitives: [{ attributes: { POSITION: 0 }, material: 0 }], extras: { a: 1 } }],
    materials: [{ name: "paint", extras: { b: 2 } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }],
    extensions: { KHR_lights_punctual: { lights: [{ type: "point" }] } },
    extensionsUsed: ["KHR_lights_punctual"],
    ...over,
  };
  const j = new TextEncoder().encode(rawJson ?? JSON.stringify(json));
  const jl = pad4(j.length);
  const bl = bin ? pad4(bin.length) : 0;
  const total = 12 + 8 + jl + (bin ? 8 + bl : 0);
  const out = new Uint8Array(total).fill(0x20);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, jl, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(j, 20);
  if (bin) {
    out.fill(0, 20 + jl);
    v.setUint32(20 + jl, bl, true);
    v.setUint32(24 + jl, 0x004e4942, true);
    out.set(bin, 28 + jl);
  }
  return out;
}

const parts = (g: Uint8Array) => {
  const v = new DataView(g.buffer, g.byteOffset, g.byteLength);
  const jl = v.getUint32(12, true);
  return { json: JSON.parse(new TextDecoder().decode(g.subarray(20, 20 + jl))), jl, length: g.length, declared: v.getUint32(8, true) };
};

/** Minimal zip writer (crc is not checked by the reader). */
function zip(entries: { name: string; data: Uint8Array; stored?: boolean }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const name = new TextEncoder();
  for (const e of entries) {
    const body = e.stored ? e.data : deflateRawSync(e.data);
    const n = name.encode(e.name);
    const lh = new Uint8Array(30 + n.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, e.stored ? 0 : 8, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, n.length, true);
    lh.set(n, 30);
    const ch = new Uint8Array(46 + n.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, e.stored ? 0 : 8, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    ch.set(n, 46);
    central.push(ch);
    chunks.push(lh, body);
    offset += lh.length + body.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, eocd];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
const gltfDoc = (over: Record<string, unknown> = {}) => ({
  asset: { version: "2.0" },
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  textures: [{ source: 0 }],
  images: [{ uri: "textures/a.png" }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
  bufferViews: [{ buffer: 0, byteLength: 36 }],
  buffers: [{ uri: "scene.bin", byteLength: 36 }],
  ...over,
});
const gltfZip = (doc = gltfDoc(), extra: { name: string; data: Uint8Array; stored?: boolean }[] = []) =>
  zip([{ name: "scene.gltf", data: enc(doc) }, { name: "scene.bin", data: TRIANGLE, stored: true }, { name: "textures/a.png", data: PNG }, ...extra]);

type Hit = Record<string, unknown>;
const LABEL = { by: "CC Attribution", "by-sa": "CC Attribution-ShareAlike", cc0: "CC0 Public Domain" };
const hit = (n: number, label: string, over: Hit = {}): Hit => ({
  uid: uid(n),
  name: `Car ${n}`,
  viewerUrl: `https://sketchfab.com/3d-models/car-${uid(n)}`,
  faceCount: 1000 * n,
  likeCount: n,
  viewCount: 100 + n,
  publishedAt: "2020-05-17T10:00:00.000000Z",
  tags: [{ slug: "SUV" }, { slug: "asx" }],
  isDownloadable: true,
  isAgeRestricted: false,
  license: { label },
  user: { username: "jane", displayName: "Jane Doe", profileUrl: "https://sketchfab.com/jane" },
  thumbnails: { images: [{ width: 64, url: "https://img/64" }, { width: 256, url: "https://img/256" }, { width: 720, url: "https://img/720" }] },
  archives: { glb: { size: 5_000_000, textureCount: 3, textureMaxResolution: 2048 } },
  ...over,
});

type Call = { url: URL; init: RequestInit | undefined };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bytes = (u8: Uint8Array, headers?: Record<string, string>) => new Response(new Blob([u8 as Uint8Array<ArrayBuffer>]), { headers });

/** Fake fetch: handler gets the URL and returns a Response (or throws). */
function fake(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { f, calls };
}
const authOf = (c: Call) => (c.init?.headers as Record<string, string> | undefined)?.Authorization;
const failOf = (r: unknown): Failure => {
  assert.ok(r && typeof r === "object" && "error" in r, "expected a failure");
  return r as Failure;
};

// ---------- basics ----------

test("uid validation", () => {
  assert.ok(isUid(uid(1)));
  for (const bad of ["", "abc", uid(10).toUpperCase(), uid(1) + "0", "../" + uid(1).slice(3), 5, null]) assert.equal(isUid(bad), false);
});

test("licence mapping: only cc0, by and by-sa pass", () => {
  assert.equal(licenseSlug("cc0"), "cc0");
  assert.equal(licenseSlug("by"), "by");
  assert.equal(licenseSlug("by-sa"), "by-sa");
  assert.equal(licenseSlug("CC Attribution"), "by");
  assert.equal(licenseSlug("CC Attribution-ShareAlike"), "by-sa");
  assert.equal(licenseSlug("CC0 Public Domain"), "cc0");
  for (const no of ["by-nd", "by-nc", "by-nc-sa", "by-nc-nd", "free-st", "st", "ed", "CC Attribution-NoDerivs", "CC Attribution-NonCommercial", "CC Attribution-NonCommercial-ShareAlike", "CC Attribution-NonCommercial-NoDerivs", "Free Standard", "Standard", "Editorial", "", "mystery", undefined, 3]) {
    assert.equal(licenseSlug(no), null, String(no));
  }
});

test("attribution lines name author, licence, source and Sketchfab", () => {
  const base = { name: "Mitsubishi ASX", author: "Jane Doe", authorUrl: "https://sketchfab.com/jane", sourceUrl: `https://sketchfab.com/3d-models/x-${uid(1)}` };
  assert.equal(
    attributionLine({ ...base, license: "by" }),
    `"Mitsubishi ASX" by Jane Doe (https://sketchfab.com/jane) is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/x-${uid(1)}. Provided by Sketchfab.`,
  );
  assert.match(attributionLine({ ...base, license: "by-sa" }), /licensed under CC BY-SA 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/\)/);
  assert.match(attributionLine({ ...base, license: "cc0" }), /is dedicated to the public domain \(CC0 1\.0\)\. Source: .* Provided by Sketchfab\.$/);
});

test("token bucket refills with the injected clock", () => {
  let t = 0;
  const take = tokenBucket(2, () => t);
  assert.deepEqual([take(), take(), take()], [true, true, false]);
  t += 30_000;
  assert.deepEqual([take(), take()], [true, false]);
  t += 600_000;
  assert.deepEqual([take(), take(), take()], [true, true, false]);
});

// ---------- search ----------

test("shapeSearch drops everything that is not clearly allowed and picks a thumbnail", () => {
  const { hits, next } = shapeSearch({
    cursors: { next: "n1" },
    results: [
      hit(1, LABEL.by),
      hit(2, "CC Attribution-NonCommercial"),
      hit(3, "CC Attribution-NoDerivs"),
      hit(4, "Standard"),
      hit(5, "Free Standard"),
      hit(6, LABEL.by, { isAgeRestricted: true }),
      hit(7, LABEL.by, { isDownloadable: false }),
      hit(8, LABEL.by, { archives: { glb: { size: 70_000_000 }, gltf: { size: 80_000_000 } } }),
      hit(9, LABEL.by, { archives: { glb: { size: 70_000_000 }, gltf: { size: 9_000_000 } } }),
      hit(10, LABEL.by, { archives: {} }),
      hit(11, LABEL.by, { uid: "not-a-uid" }),
      hit(12, LABEL["by-sa"]),
      hit(13, LABEL.by, { thumbnails: { images: [{ width: 64, url: "https://img/64" }, { width: 128, url: "http://img/128" }] } }),
    ],
  }, "by");
  assert.deepEqual(hits.map((h) => h.uid), [uid(1), uid(9), uid(10), uid(13)]);
  assert.equal(next, "n1");
  assert.equal(hits[0].thumb, "https://img/256");
  assert.equal(hits[0].glbBytes, 5_000_000);
  assert.equal(hits[0].license.slug, "by");
  assert.equal(hits[0].author, "Jane Doe");
  assert.deepEqual([hits[0].tags, hits[0].likes, hits[0].views, hits[0].published], [["suv", "asx"], 1, 101, "2020-05-17"]);
  assert.equal(hits[2].glbBytes, null);
  assert.deepEqual([hits[0].textures, hits[0].textureMax, hits[2].textures, hits[2].textureMax], [3, 2048, null, null]);
  assert.equal(hits[3].thumb, "https://img/64", "http thumbnails are ignored, largest https wins");
  assert.equal(shapeSearch(null).hits.length, 0);
});

test("search merges the three licence queries, interleaved by rank then likes", async () => {
  const lists: Record<string, Hit[]> = {
    by: [hit(1, LABEL.by, { likeCount: 10 }), hit(2, LABEL.by, { likeCount: 3 })],
    "by-sa": [hit(3, LABEL["by-sa"], { likeCount: 20 })],
    cc0: [hit(4, LABEL.cc0, { likeCount: 5 }), hit(5, LABEL.cc0, { likeCount: 9 })],
  };
  const { f, calls } = fake((u) => json({ cursors: { next: null }, results: lists[u.searchParams.get("license")!] }));
  const page = await searchModels({ q: "  asx\n" }, { fetch: f, token: undefined });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.url.searchParams.get("license")).sort(), ["by", "by-sa", "cc0"]);
  for (const c of calls) {
    const p = c.url.searchParams;
    assert.equal(c.url.origin + c.url.pathname, "https://api.sketchfab.com/v3/search");
    assert.deepEqual([p.get("q"), p.get("categories"), p.get("count"), p.get("max_face_count"), p.get("downloadable"), p.get("type")], ["asx", "cars-vehicles", "24", "200000", "true", "models"]);
  }
  assert.ok(!("error" in page));
  assert.deepEqual(page.hits.map((h) => h.uid), [uid(3), uid(1), uid(4), uid(5), uid(2)]);
  assert.equal(page.next, null);
  assert.equal(page.canDownload, false);
  assert.equal(page.hits[0].likes, 20, "likes are kept for ranking");
});

test("heavy raises the face limit and the cursor round trips", async () => {
  const { f, calls } = fake((u) => {
    const s = u.searchParams.get("license")!;
    return json({ cursors: { next: s === "by-sa" ? null : `next-${s}` }, results: [] });
  });
  const first = await searchModels({ q: "golf", heavy: true }, { fetch: f, token: "t" });
  assert.ok(!("error" in first));
  assert.equal(calls[0].url.searchParams.get("max_face_count"), "1000000");
  assert.equal(first.canDownload, true);
  assert.deepEqual(JSON.parse(Buffer.from(first.next!, "base64url").toString()), { by: "next-by", cc0: "next-cc0" });

  calls.length = 0;
  const second = await searchModels({ q: "golf", cursor: first.next! }, { fetch: f, token: "t" });
  assert.ok(!("error" in second));
  assert.deepEqual(calls.map((c) => [c.url.searchParams.get("license"), c.url.searchParams.get("cursor")]).sort(), [["by", "next-by"], ["cc0", "next-cc0"]]);

  const done = fake(() => json({ cursors: { next: null }, results: [] }));
  const last = await searchModels({ q: "golf", cursor: first.next! }, { fetch: done.f, token: undefined });
  assert.ok(!("error" in last));
  assert.equal(last.next, null);
});

test("search rejects short queries and garbage cursors without calling upstream", async () => {
  const { f, calls } = fake(() => json({}));
  assert.equal(failOf(await searchModels({ q: "a" }, { fetch: f, token: undefined })).error.code, "bad_request");
  assert.equal(failOf(await searchModels({ q: "\u0000 \u0001" }, { fetch: f, token: undefined })).status, 400);
  assert.equal(failOf(await searchModels({ q: "golf", cursor: "%%%" }, { fetch: f, token: undefined })).error.code, "bad_request");
  assert.equal(calls.length, 0);
});

test("one failing licence query does not kill the others; all failing gives friendly errors", async () => {
  const some = fake((u) => (u.searchParams.get("license") === "by" ? json({ detail: "boom" }, 500) : json({ results: [hit(7, LABEL.cc0)] })));
  const page = await searchModels({ q: "mini" }, { fetch: some.f, token: undefined });
  assert.ok(!("error" in page));
  assert.deepEqual(page.hits.map((h) => h.uid), [uid(7)]);

  const throwing = fake(() => {
    throw new TypeError("fetch failed: secret-host");
  });
  const off = failOf(await searchModels({ q: "mini" }, { fetch: throwing.f, token: "sekret" }));
  assert.equal(off.error.code, "offline");
  assert.equal(off.status, 502);
  assert.doesNotMatch(JSON.stringify(off), /secret/);

  const err = failOf(await searchModels({ q: "mini" }, { fetch: fake(() => json({ detail: "x" }, 500)).f, token: undefined }));
  assert.equal(err.error.code, "upstream");
  const busy = failOf(await searchModels({ q: "mini" }, { fetch: fake(() => json({}, 429)).f, token: undefined }));
  assert.equal(busy.error.code, "rate_limited");
  assert.equal(busy.status, 429);
});

test("the category filter is on by default and only dropped on request", async () => {
  const { f, calls } = fake(() => json({ results: [] }));
  await searchModels({ q: "asx" }, { fetch: f, token: undefined });
  assert.ok(calls.every((c) => c.url.searchParams.get("categories") === "cars-vehicles"));
  calls.length = 0;
  await searchModels({ q: "asx", anyCategory: true }, { fetch: f, token: undefined });
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => !c.url.searchParams.has("categories") && c.url.searchParams.get("license")));
});

test("token header is sent only when set and never echoed", async () => {
  const body = { results: [hit(1, LABEL.by)] };
  const withToken = fake(() => json(body));
  const page = await searchModels({ q: "audi" }, { fetch: withToken.f, token: "tok-123" });
  assert.ok(withToken.calls.every((c) => authOf(c) === "Token tok-123"));
  assert.doesNotMatch(JSON.stringify(page), /tok-123/);
  const without = fake(() => json(body));
  await searchModels({ q: "audi" }, { fetch: without.f, token: undefined });
  assert.ok(without.calls.every((c) => authOf(c) === undefined));
  await searchModels({ q: "audi" }, { fetch: without.f, token: "" });
  assert.ok(without.calls.every((c) => authOf(c) === undefined));
});

// ---------- zip ----------

test("readZip reads stored and deflated entries", () => {
  const files = readZip(zip([{ name: "a.txt", data: new TextEncoder().encode("hello hello hello") }, { name: "dir/b.bin", data: PNG, stored: true }, { name: "empty", data: new Uint8Array(0) }]));
  assert.equal(new TextDecoder().decode(files.get("a.txt")), "hello hello hello");
  assert.deepEqual([...files.get("dir/b.bin")!], [...PNG]);
  assert.equal(files.get("empty")!.length, 0);
});

test("readZip refuses garbage, zip bombs, too many entries and lying sizes", () => {
  assert.throws(() => readZip(new Uint8Array(100)), { code: "invalid_model" });
  const bomb = zip([{ name: "big", data: new Uint8Array(100_000) }]);
  assert.ok(bomb.length < 1000);
  assert.throws(() => readZip(bomb, { maxTotal: 1000, maxEntries: 10 }), { code: "too_big" });
  assert.throws(() => readZip(zip([{ name: "a", data: PNG }, { name: "b", data: PNG }]), { maxTotal: 1e6, maxEntries: 1 }), { code: "too_big" });
  // declared size smaller than the real data: must not inflate past the declaration
  const lie = zip([{ name: "big", data: new Uint8Array(5000) }]);
  const v = new DataView(lie.buffer);
  const cd = v.getUint32(lie.length - 6, true);
  v.setUint32(cd + 24, 10, true);
  assert.throws(() => readZip(lie), { code: "invalid_model" });
});

test("gltfZipToGlb packs buffers and pictures into one valid GLB", () => {
  const out = gltfZipToGlb(readZip(gltfZip()));
  const { json: j, length, declared } = parts(out);
  assert.equal(length, declared);
  const { bin } = validateGlb(out);
  assert.equal(j.buffers.length, 1);
  assert.equal(j.buffers[0].uri, undefined);
  assert.equal(j.images[0].uri, undefined);
  assert.equal(j.images[0].mimeType, "image/png");
  const view = j.bufferViews[j.images[0].bufferView];
  assert.equal(view.byteOffset % 4, 0);
  assert.deepEqual([...bin!.subarray(view.byteOffset, view.byteOffset + view.byteLength)], [...PNG]);
  assert.deepEqual([...bin!.subarray(0, 36)], [...TRIANGLE]);
});

test("gltfZipToGlb decodes data: uris and finds scene.gltf in a sub folder", () => {
  const b64 = Buffer.from(TRIANGLE).toString("base64");
  const doc = gltfDoc({ buffers: [{ uri: `data:application/octet-stream;base64,${b64}`, byteLength: 36 }], images: [] , textures: [] });
  const files = readZip(zip([{ name: "model/scene.gltf", data: enc(doc) }]));
  assert.ok(validateGlb(gltfZipToGlb(files)).json.meshes.length > 0);
});

test("gltfZipToGlb refuses uris that leave the zip", () => {
  for (const uri of ["../scene.bin", "http://evil.example/a.bin", "https://evil.example/a.bin", "/etc/passwd", "file:///etc/passwd", "textures/../../x.bin", "missing.bin"]) {
    const doc = gltfDoc({ buffers: [{ uri, byteLength: 36 }] });
    assert.throws(() => gltfZipToGlb(readZip(gltfZip(doc))), { code: "invalid_model" }, uri);
  }
  assert.throws(() => gltfZipToGlb(readZip(gltfZip(gltfDoc({ images: [{ uri: "https://evil.example/a.png" }] })))), { code: "invalid_model" });
  assert.throws(() => gltfZipToGlb(new Map()), { code: "invalid_model" });
});

// ---------- glb ----------

test("validateGlb accepts a good model", () => {
  const { json: j, bin } = validateGlb(glb());
  assert.equal(j.meshes.length, 1);
  assert.equal(bin!.length, 36);
});

test("validateGlb rejects broken, external-uri and compressed files", () => {
  const good = glb();
  const badMagic = good.slice();
  badMagic[0] = 0x58;
  const badLength = good.slice(0, good.length - 4);
  const badVersion = good.slice();
  new DataView(badVersion.buffer).setUint32(4, 1, true);
  const cases: [string, Uint8Array][] = [
    ["magic", badMagic],
    ["length", badLength],
    ["version", badVersion],
    ["tiny", new Uint8Array(5)],
    ["json", glb({}, TRIANGLE, "{not json")],
    ["buffer uri", glb({ buffers: [{ byteLength: 36, uri: "scene.bin" }] })],
    ["image uri", glb({ images: [{ uri: "a.png" }] })],
    ["no meshes", glb({ meshes: [] })],
    ["missing bin", glb({}, null)],
    ["odd extension", glb({ extensionsRequired: ["KHR_something_new"] })],
  ];
  for (const [label, buf] of cases) assert.throws(() => validateGlb(buf), { code: "invalid_model" }, label);
  for (const ext of ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu", "KHR_texture_ktx2"]) {
    assert.throws(() => validateGlb(glb({ extensionsRequired: [ext] })), { code: "invalid_model" }, ext);
  }
  assert.ok(validateGlb(glb({ extensionsRequired: ["KHR_materials_clearcoat", "KHR_texture_transform", "KHR_materials_emissive_strength", "KHR_mesh_quantization"] })).json.meshes.length > 0);
});

test("stripGlb removes cameras, lights, animations and extras and still validates", () => {
  const out = stripGlb(glb());
  const { json: j, length, declared, jl } = parts(out);
  assert.equal(length, declared);
  assert.equal(jl % 4, 0);
  assert.equal(j.cameras, undefined);
  assert.equal(j.animations, undefined);
  assert.equal(j.nodes[0].camera, undefined);
  assert.equal(j.nodes[0].extras, undefined);
  assert.equal(j.nodes[0].extensions, undefined);
  assert.equal(j.extensions, undefined);
  assert.equal(j.extensionsUsed, undefined);
  assert.equal(j.meshes[0].extras, undefined);
  assert.equal(j.materials[0].extras, undefined);
  assert.equal(j.nodes[0].name, "tri");
  assert.equal(j.materials[0].name, "paint");
  assert.deepEqual([...validateGlb(out).bin!.subarray(0, 36)], [...TRIANGLE]);
});

// ---------- import ----------

const SIGNED = "https://sketchfab-prod-media.s3.amazonaws.com/archives/model.glb?sig=abc";
const SIGNED_ZIP = "https://sketchfab-prod-media.s3.amazonaws.com/archives/model.zip?sig=abc";
const metaFor = (over: Hit = {}) => ({
  uid: uid(9),
  name: "Mitsubishi <b>ASX</b>\n",
  viewerUrl: `https://sketchfab.com/3d-models/asx-${uid(9)}`,
  isDownloadable: true,
  isAgeRestricted: false,
  license: { slug: "by", label: "CC Attribution" },
  user: { username: "jane", displayName: "Jane Doe", profileUrl: "https://sketchfab.com/jane" },
  ...over,
});

type Routes = { meta?: unknown; metaStatus?: number; download?: unknown; downloadStatus?: number; files?: Record<string, () => Response> };
function importFake(r: Routes) {
  return fake((u) => {
    if (u.hostname === "api.sketchfab.com") {
      if (u.pathname === `/v3/models/${uid(9)}`) return json(r.meta ?? metaFor(), r.metaStatus ?? 200);
      if (u.pathname === `/v3/models/${uid(9)}/download`) return json(r.download ?? { glb: { url: SIGNED, size: 100 } }, r.downloadStatus ?? 200);
    }
    const file = r.files?.[u.origin + u.pathname];
    if (file) return file();
    return new Response("nope", { status: 404 });
  });
}
const glbFile = () => bytes(glb(), { "content-length": String(glb().length) });
const FILES = { [SIGNED.split("?")[0]]: glbFile };

test("import: bad uid and missing token", async () => {
  const { f, calls } = importFake({});
  assert.equal(failOf(await importModel("nope", { fetch: f, token: "t" })).error.code, "bad_request");
  const r = failOf(await importModel(uid(9), { fetch: f, token: undefined }));
  assert.equal(r.status, 401);
  assert.equal(r.error.code, "needs_token");
  assert.equal(calls.length, 0);
});

test("import: full flow, glb preferred over gltf, header decodes", async () => {
  const { f, calls } = importFake({ download: { gltf: { url: SIGNED_ZIP, size: 10 }, glb: { url: SIGNED, size: 100 } }, files: { ...FILES, [SIGNED_ZIP.split("?")[0]]: () => bytes(gltfZip()) } });
  const r = await importModel(uid(9), { fetch: f, token: "tok-xyz" });
  assert.ok(!("error" in r));
  assert.ok(!calls.some((c) => c.url.pathname.endsWith("model.zip")));
  const meta = calls.filter((c) => c.url.hostname === "api.sketchfab.com");
  assert.ok(meta.every((c) => authOf(c) === "Token tok-xyz"));
  const signed = calls.find((c) => c.url.hostname.endsWith("amazonaws.com"))!;
  assert.equal(authOf(signed), undefined, "the token is never sent to the signed url");
  assert.equal(signed.init?.redirect, "error");
  const decoded = JSON.parse(Buffer.from(r.header, "base64").toString("utf8"));
  assert.deepEqual(decoded, { attribution: r.attribution, report: r.report });
  assert.equal(r.attribution.license, "by");
  assert.equal(r.attribution.name, "Mitsubishi b ASX /b");
  assert.equal(r.attribution.author, "Jane Doe");
  assert.equal(r.attribution.sourceUrl, `https://sketchfab.com/3d-models/asx-${uid(9)}`);
  assert.equal(r.attribution.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
  assert.match(r.attribution.line, /Provided by Sketchfab\.$/);
  assert.deepEqual(r.report, { triangles: 1, materials: 1, textures: 0, bytes: r.glb.length });
  assert.equal(parts(r.glb).json.cameras, undefined);
  assert.ok(validateGlb(r.glb).json.meshes.length > 0);
  assert.doesNotMatch(r.header + JSON.stringify(r.attribution), /tok-xyz/);
});

test("import: gltf zip is converted when no glb is offered", async () => {
  const { f } = importFake({ download: { gltf: { url: SIGNED_ZIP, size: 10 } }, files: { [SIGNED_ZIP.split("?")[0]]: () => bytes(gltfZip()) } });
  const r = await importModel(uid(9), { fetch: f, token: "t" });
  assert.ok(!("error" in r));
  assert.deepEqual([r.report.triangles, r.report.materials, r.report.textures], [1, 1, 1]);
});

test("import: licence and download restrictions", async () => {
  const nc = failOf(await importModel(uid(9), { fetch: importFake({ meta: metaFor({ license: { slug: "by-nc", label: "CC Attribution-NonCommercial" } }) }).f, token: "t" }));
  assert.equal(nc.error.code, "not_allowed");
  assert.equal(nc.status, 403);
  const label = failOf(await importModel(uid(9), { fetch: importFake({ meta: metaFor({ license: { label: "Standard" } }) }).f, token: "t" }));
  assert.equal(label.error.code, "not_allowed");
  const byLabel = await importModel(uid(9), { fetch: importFake({ meta: metaFor({ license: { label: "CC Attribution-ShareAlike" } }), files: FILES }).f, token: "t" });
  assert.ok(!("error" in byLabel));
  assert.equal(byLabel.attribution.license, "by-sa");
  assert.equal(failOf(await importModel(uid(9), { fetch: importFake({ meta: metaFor({ isAgeRestricted: true }) }).f, token: "t" })).error.code, "not_allowed");
  assert.equal(failOf(await importModel(uid(9), { fetch: importFake({ meta: metaFor({ isDownloadable: false }) }).f, token: "t" })).error.code, "not_allowed");
  assert.equal(failOf(await importModel(uid(9), { fetch: importFake({ downloadStatus: 403, download: {} }).f, token: "t" })).error.code, "not_allowed");
  assert.equal(failOf(await importModel(uid(9), { fetch: importFake({ downloadStatus: 404, download: {} }).f, token: "t" })).error.code, "not_allowed");
  assert.equal(failOf(await importModel(uid(9), { fetch: importFake({ download: {} }).f, token: "t" })).error.code, "not_allowed");
});

test("import: upstream status mapping", async () => {
  assert.equal(failOf(await importModel(uid(9), { fetch: importFake({ downloadStatus: 401, download: {} }).f, token: "bad" })).error.code, "needs_token");
  assert.equal(failOf(await importModel(uid(9), { fetch: importFake({ downloadStatus: 429, download: {} }).f, token: "t" })).status, 429);
  assert.equal(failOf(await importModel(uid(9), { fetch: importFake({ metaStatus: 500, meta: {} }).f, token: "t" })).error.code, "upstream");
  const down = failOf(await importModel(uid(9), { fetch: (async () => { throw new TypeError("getaddrinfo ENOTFOUND tok-secret"); }) as typeof fetch, token: "tok-secret" }));
  assert.equal(down.error.code, "offline");
  assert.doesNotMatch(JSON.stringify(down), /tok-secret|ENOTFOUND/);
});

test("import: signed url host and scheme are checked (SSRF)", async () => {
  for (const url of ["https://evil.example.com/a.glb", "http://sketchfab-prod-media.s3.amazonaws.com/a.glb", "https://169.254.169.254/latest", "https://amazonaws.com.evil.com/a.glb", "https://localhost/a.glb", "https://user:pw@x.s3.amazonaws.com/a.glb", "https://x.s3.amazonaws.com:8443/a.glb", "not a url"]) {
    const { f, calls } = importFake({ download: { glb: { url, size: 10 } } });
    const r = failOf(await importModel(uid(9), { fetch: f, token: "t" }));
    assert.equal(r.error.code, "upstream", url);
    assert.equal(calls.length, 2, `${url} must not be fetched`);
  }
  for (const host of ["https://x.s3.amazonaws.com/a.glb", "https://media.sketchfab.com/a.glb", "https://x.skfb.ms/a.glb", "https://d1.cloudfront.net/a.glb"]) {
    const { f } = importFake({ download: { glb: { url: host, size: 10 } }, files: { [host]: glbFile } });
    assert.ok(!("error" in (await importModel(uid(9), { fetch: f, token: "t" }))), host);
  }
});

test("import: size caps by content-length, declared size and streamed bytes", async () => {
  const huge = () => bytes(glb(), { "content-length": String(70 * 1024 * 1024) });
  const a = failOf(await importModel(uid(9), { fetch: importFake({ files: { [SIGNED.split("?")[0]]: huge } }).f, token: "t" }));
  assert.deepEqual([a.error.code, a.status], ["too_big", 413]);
  const b = failOf(await importModel(uid(9), { fetch: importFake({ download: { glb: { url: SIGNED, size: 70 * 1024 * 1024 } } }).f, token: "t" }));
  assert.equal(b.error.code, "too_big");
  let pulled = 0;
  const streamed = () => {
    const mb = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulled >= 200) return c.close();
        pulled++;
        c.enqueue(mb);
      },
    });
    return new Response(body);
  };
  const c = failOf(await importModel(uid(9), { fetch: importFake({ files: { [SIGNED.split("?")[0]]: streamed } }).f, token: "t" }));
  assert.equal(c.error.code, "too_big");
  assert.ok(pulled < 100, "the stream is cancelled soon after the cap");
});

test("import: broken or compressed models are invalid_model", async () => {
  const junk = failOf(await importModel(uid(9), { fetch: importFake({ files: { [SIGNED.split("?")[0]]: () => bytes(new Uint8Array(64)) } }).f, token: "t" }));
  assert.deepEqual([junk.error.code, junk.status], ["invalid_model", 422]);
  const draco = failOf(await importModel(uid(9), { fetch: importFake({ files: { [SIGNED.split("?")[0]]: () => bytes(glb({ extensionsRequired: ["KHR_draco_mesh_compression"] })) } }).f, token: "t" }));
  assert.equal(draco.error.code, "invalid_model");
  const evilZip = failOf(await importModel(uid(9), { fetch: importFake({ download: { gltf: { url: SIGNED_ZIP, size: 1 } }, files: { [SIGNED_ZIP.split("?")[0]]: () => bytes(gltfZip(gltfDoc({ buffers: [{ uri: "http://evil.example/a.bin", byteLength: 36 }] }))) } }).f, token: "t" }));
  assert.equal(evilZip.error.code, "invalid_model");
});

// ---------- automatic pick ----------

const ASX_ID = "car_mitsubishi_asx_2016";
const asxHits = (count: number, over: Hit = {}) => Array.from({ length: count }, (_, i) => hit(100 + i, LABEL.by, { name: `Mitsubishi ASX ${i}`, likeCount: 50 - i * 5, faceCount: 30000, ...over }));

/** Fake Sketchfab: search returns `hits` under the "by" licence; per-uid `status` makes the model's metadata call fail. */
function autoFake(o: { hits?: Hit[]; status?: Record<string, number> } = {}) {
  const hits = o.hits ?? asxHits(8);
  return fake((u) => {
    if (u.pathname === "/v3/search") {
      const max = Number(u.searchParams.get("max_face_count"));
      return json({ cursors: { next: null }, results: u.searchParams.get("license") === "by" ? hits.filter((h) => (h.faceCount as number) <= max) : [] });
    }
    const m = /^\/v3\/models\/([a-f0-9]{32})(\/download)?$/.exec(u.pathname);
    if (m) {
      const st = o.status?.[m[1]];
      if (st) return json({ detail: "x" }, st);
      return json(m[2] ? { glb: { url: `https://x.s3.amazonaws.com/${m[1]}.glb`, size: 100 } } : metaFor({ uid: m[1] }));
    }
    if (u.hostname.endsWith("amazonaws.com")) return bytes(glb());
    return new Response("nope", { status: 404 });
  });
}
const importsOf = (calls: Call[]) => calls.filter((c) => /^\/v3\/models\/[a-f0-9]{32}$/.test(c.url.pathname)).map((c) => c.url.pathname.slice(11));
const metaOf = (header: string): AutoMeta => JSON.parse(Buffer.from(header, "base64").toString("utf8"));
const okAuto = (r: unknown) => {
  assert.ok(r && typeof r === "object" && !("error" in r), JSON.stringify(r));
  return r as AutoOk;
};

test("auto: needs a token before anything else, rejects unknown cars", async () => {
  const { f, calls } = autoFake();
  const r = failOf(await autoImport(ASX_ID, { fetch: f, token: undefined }));
  assert.deepEqual([r.error.code, r.status], ["needs_token", 401]);
  assert.equal(failOf(await autoImport("car_nope", { fetch: f, token: "t" })).error.code, "bad_request");
  assert.equal(calls.length, 0);
});

test("auto: downloads the best match and lists alternatives in the header", async () => {
  const { f, calls } = autoFake();
  const out = okAuto(await autoImport(ASX_ID, { fetch: f, token: "tok-auto" }));
  const meta = metaOf(out.header);
  assert.deepEqual(meta, out.meta);
  assert.equal(meta.pick.uid, uid(100), "the most liked of equal matches");
  assert.equal(meta.attribution.uid, uid(100));
  assert.equal(meta.pick.heavy, false);
  assert.deepEqual(meta.alternatives.map((a) => a.uid), [101, 102, 103, 104, 105].map(uid));
  assert.equal(meta.alternatives[0].license.slug, "by");
  assert.ok(meta.report.triangles === 1 && out.glb.length === meta.report.bytes);
  assert.ok(out.header.length < 6000);
  assert.doesNotMatch(out.header, /tok-auto/);
  const searches = calls.filter((c) => c.url.pathname === "/v3/search").map((c) => c.url.searchParams.get("max_face_count"));
  assert.equal(searches[0], "200000", "light search first");
  assert.ok(searches.includes("1000000"), "a hand-picked car is a big model: big models are searched too");
  assert.ok(validateGlb(out.glb).json.meshes.length > 0);
});

test("auto: skip list is honoured and heavy searches big models directly", async () => {
  const { f, calls } = autoFake();
  const out = okAuto(await autoImport(ASX_ID, { fetch: f, token: "t" }, { skip: [uid(100), uid(101)] }));
  assert.equal(out.meta.pick.uid, uid(102));
  assert.ok(!out.meta.alternatives.some((a) => a.uid === uid(100) || a.uid === uid(101)));
  calls.length = 0;
  okAuto(await autoImport(ASX_ID, { fetch: f, token: "t" }, { heavy: true }));
  assert.ok(calls.filter((c) => c.url.pathname === "/v3/search").every((c) => c.url.searchParams.get("max_face_count") === "1000000"));
});

test("auto: a model that cannot be used is replaced by the next best, at most three tries", async () => {
  const one = autoFake({ status: { [uid(100)]: 403 } });
  const out = okAuto(await autoImport(ASX_ID, { fetch: one.f, token: "t" }));
  assert.equal(out.meta.pick.uid, uid(101));
  assert.deepEqual(importsOf(one.calls), [uid(100), uid(101)]);
  assert.ok(!out.meta.alternatives.some((a) => a.uid === uid(100)), "the one that failed is not offered again");

  const all = autoFake({ status: { [uid(100)]: 500, [uid(101)]: 403, [uid(102)]: 403, [uid(103)]: 403 } });
  const r = failOf(await autoImport(ASX_ID, { fetch: all.f, token: "t" }));
  assert.equal(r.error.code, "not_allowed");
  assert.deepEqual(importsOf(all.calls), [uid(100), uid(101), uid(102)]);
});

test("auto: rate limits, a bad token and a dead network are returned, never retried", async () => {
  for (const [status, code] of [[429, "rate_limited"], [401, "needs_token"]] as const) {
    const { f, calls } = autoFake({ status: { [uid(100)]: status } });
    assert.equal(failOf(await autoImport(ASX_ID, { fetch: f, token: "t" })).error.code, code);
    assert.deepEqual(importsOf(calls), [uid(100)]);
  }
  const down = failOf(await autoImport(ASX_ID, { fetch: (async () => { throw new TypeError("down"); }) as typeof fetch, token: "t" }));
  assert.equal(down.error.code, "offline");
});

test("auto: nothing believable gives no_match after trying big models too", async () => {
  const { f, calls } = autoFake({ hits: [hit(200, LABEL.by, { name: "Mitsubishi Lancer", tags: [], faceCount: 30000 }), hit(201, LABEL.by, { name: "Totally different car", tags: [] })] });
  const r = failOf(await autoImport(ASX_ID, { fetch: f, token: "t" }));
  assert.deepEqual([r.error.code, r.status], ["no_match", 404]);
  assert.ok(calls.some((c) => c.url.searchParams.get("max_face_count") === "1000000"));
  assert.equal(importsOf(calls).length, 0);
});

test("auto: a big model is chosen only when no light one is good enough", async () => {
  const { f } = autoFake({ hits: asxHits(2, { faceCount: 500000 }) });
  const out = okAuto(await autoImport(ASX_ID, { fetch: f, token: "t" }));
  assert.equal(out.meta.pick.heavy, true);
});

test("auto: the header stays small (names cut, thumbnails dropped when needed)", async () => {
  const long = "https://img.example/" + "x".repeat(1500);
  const { f } = autoFake({ hits: asxHits(8, { name: "Mitsubishi ASX " + "very long name ".repeat(10), thumbnails: { images: [{ width: 256, url: long }] } }) });
  const out = okAuto(await autoImport(ASX_ID, { fetch: f, token: "t" }));
  assert.equal(out.meta.alternatives.length, 5);
  assert.ok(out.meta.alternatives.every((a) => a.name.length <= 60 && a.thumb === undefined));
  assert.ok(out.header.length < 6200, String(out.header.length));
});

test("auto: a scan is skipped for a clean big model of the same name", async () => {
  const scan = hit(300, LABEL.by, { name: "Mitsubishi ASX", likeCount: 10, faceCount: 20000, archives: { glb: { size: 5_000_000, textureCount: 1, textureMaxResolution: 8192 } } });
  const clean = hit(301, LABEL.by, { name: "Mitsubishi ASX", likeCount: 10, faceCount: 500000 });
  const { f, calls } = autoFake({ hits: [scan, clean] });
  const out = okAuto(await autoImport(ASX_ID, { fetch: f, token: "t" }));
  assert.equal(out.meta.pick.uid, uid(301));
  assert.equal(out.meta.pick.heavy, true);
  assert.deepEqual(out.meta.alternatives.map((a) => a.uid), [uid(300)]);
  assert.ok(calls.some((c) => c.url.pathname === "/v3/search" && c.url.searchParams.get("max_face_count") === "200000"), "light search first");
  assert.ok(calls.some((c) => c.url.pathname === "/v3/search" && c.url.searchParams.get("max_face_count") === "1000000"), "then big models");
  assert.ok(calls.some((c) => c.url.pathname === "/v3/search" && !c.url.searchParams.has("categories")), "and models without a category");
  // when the scan is all there is, it is still used
  const only = okAuto(await autoImport(ASX_ID, { fetch: autoFake({ hits: [scan] }).f, token: "t" }));
  assert.equal(only.meta.pick.uid, uid(300));
});
