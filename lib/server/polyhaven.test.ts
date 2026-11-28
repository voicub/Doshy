import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { readMaterial } from "../polyhavenMaterial.ts";
import { createPolyHaven, PhError } from "./polyhaven.ts";

// No network: a fake fetch answers the recorded JSON (lib/polyhaven.fixture.json) and small synthetic files.
const fixture = JSON.parse(readFileSync(new URL("../polyhaven.fixture.json", import.meta.url), "utf8"));
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "doshy-ph-"));
  dirs.push(d);
  return d;
};
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const bytes = (...parts: (string | number[])[]) => Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...new TextEncoder().encode(p)] : p)));
const HDR = bytes("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4 +X 8\n", new Array(100).fill(7));
const JPG = bytes([0xff, 0xd8, 0xff, 0xe0], new Array(200).fill(9));
const WEBP = bytes("RIFF\0\0\0\0WEBPVP8 ", new Array(40).fill(1));
const BIN = new Uint8Array(36);
const GLTF = bytes(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "ArmChair_01.bin", byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], images: [{ uri: "textures/Armchair_01_diff_1k.jpg" }] }));

const FILES: Record<string, unknown> = { sunset_jhbcentral: fixture.files.hdri, rock_boulder_dry: fixture.files.texture, ArmChair_01: fixture.files.model };

type Calls = { urls: string[] };
function fake(overrides: Record<string, () => Response> = {}): { fetch: typeof fetch; calls: Calls } {
  const calls: Calls = { urls: [] };
  const answer = (url: string): Response => {
    const u = new URL(url);
    if (u.hostname === "api.polyhaven.com" && u.pathname === "/assets") return Response.json(fixture.listing[u.searchParams.get("t") ?? ""]);
    if (u.hostname === "api.polyhaven.com" && u.pathname.startsWith("/files/")) return Response.json(FILES[u.pathname.slice(7)] ?? {}, { status: FILES[u.pathname.slice(7)] ? 200 : 404 });
    if (u.hostname === "cdn.polyhaven.com") return new Response(WEBP);
    if (u.pathname.endsWith(".hdr")) return new Response(HDR);
    if (u.pathname.endsWith(".bin")) return new Response(BIN);
    if (u.pathname.endsWith(".gltf")) return new Response(GLTF);
    if (u.pathname.endsWith(".jpg")) return new Response(JPG);
    return new Response("no", { status: 404 });
  };
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    calls.urls.push(url);
    const hit = Object.entries(overrides).find(([k]) => url.includes(k));
    return hit ? hit[1]() : answer(url);
  };
  return { fetch: impl as typeof fetch, calls };
}

test("the listing is fetched once per 6 hours and shrunk to compact items", async () => {
  let t = 0;
  const f = fake();
  const ph = createPolyHaven({ fetch: f.fetch, dir: tmp(), now: () => t });
  const first = await ph.list("hdris");
  assert.deepEqual(first.map((i) => i.id).sort(), ["blocky_photo_studio", "sunset_jhbcentral"]);
  await ph.list("hdris");
  assert.equal(f.calls.urls.length, 1);
  t += 6 * 60 * 60 * 1000 + 1;
  await ph.list("hdris");
  assert.equal(f.calls.urls.length, 2);
  assert.equal((await ph.item("hdris", "sunset_jhbcentral"))?.name, "Joburg Central Sunset");
});

test("an HDRI is downloaded once, then served from the disk copy even when Poly Haven is unreachable", async () => {
  const dir = tmp();
  const f = fake();
  const ph = createPolyHaven({ fetch: f.fetch, dir });
  const a = await ph.download("hdri", "sunset_jhbcentral", "1k");
  assert.deepEqual([...a.bytes], [...HDR]);
  assert.ok(f.calls.urls.some((u) => u.endsWith("_1k.hdr")));
  const seen = f.calls.urls.length;
  const again = await ph.download("hdri", "sunset_jhbcentral", "1k");
  assert.deepEqual([...again.bytes], [...HDR]);
  assert.equal(f.calls.urls.length, seen);
  const offline = createPolyHaven({ fetch: () => Promise.reject(new Error("ENOTFOUND")), dir });
  assert.deepEqual([...(await offline.download("hdri", "sunset_jhbcentral", "1k")).bytes], [...HDR]);
  assert.ok(readdirSync(join(dir, "files")).some((n) => n.startsWith("hdri-sunset_jhbcentral-1k")));
});

test("a texture becomes one material file with colour, roughness and normal map and its real size", async () => {
  const ph = createPolyHaven({ fetch: fake().fetch, dir: tmp() });
  const { bytes: file } = await ph.download("material", "rock_boulder_dry", "1k");
  const m = readMaterial(file);
  assert.ok(m?.maps.rough && m.maps.nor);
  assert.equal(m.info.asset, "rock_boulder_dry");
  assert.ok(m.info.scaleM && m.info.scaleM > 0.1);
  assert.deepEqual(m.info.authors.length > 0, true);
});

test("a model's glTF, binary and pictures are packed into one GLB", async () => {
  const ph = createPolyHaven({ fetch: fake().fetch, dir: tmp() });
  const out = await ph.download("model", "ArmChair_01", "1k");
  assert.equal(out.mime, "model/gltf-binary");
  assert.equal(new TextDecoder().decode(out.bytes.subarray(0, 4)), "glTF");
});

test("refusals are plain and never follow what the network says", async () => {
  // a /files answer that points at another host is refused before any download
  const evil = structuredClone(fixture.files.hdri);
  evil.hdri["1k"].hdr.url = "https://evil.test/file/ph-assets/x.hdr";
  const f = fake({ "/files/evil_one": () => Response.json(evil) });
  const ph = createPolyHaven({ fetch: f.fetch, dir: tmp() });
  await assert.rejects(ph.download("hdri", "evil_one", "1k"), (e: unknown) => e instanceof PhError && e.status === 404);
  assert.equal(f.calls.urls.some((u) => u.includes("evil.test")), false);
  await assert.rejects(ph.download("hdri", "../../etc", "1k"), (e: unknown) => e instanceof PhError && e.status === 400);

  // too big (announced) and not a Radiance file
  const big = createPolyHaven({ fetch: fake({ ".hdr": () => new Response(HDR, { headers: { "content-length": String(200 * 1024 * 1024) } }) }).fetch, dir: tmp() });
  await assert.rejects(big.download("hdri", "sunset_jhbcentral", "1k"), (e: unknown) => e instanceof PhError && e.status === 413);
  const lie = createPolyHaven({ fetch: fake({ ".hdr": () => new Response(bytes("<html>", new Array(200).fill(1))) }).fetch, dir: tmp() });
  await assert.rejects(lie.download("hdri", "sunset_jhbcentral", "1k"), (e: unknown) => e instanceof PhError && e.status === 502);

  // unreachable, throttled by them, throttled by us (nothing is sent)
  const down = createPolyHaven({ fetch: () => Promise.reject(new Error("ECONNREFUSED")), dir: tmp() });
  await assert.rejects(down.list("models"), (e: unknown) => e instanceof PhError && e.status === 503 && !/ECONNREFUSED/.test(e.message));
  const slow = createPolyHaven({ fetch: fake({ "/assets": () => new Response("", { status: 429 }) }).fetch, dir: tmp() });
  await assert.rejects(slow.list("models"), (e: unknown) => e instanceof PhError && e.status === 429);
  const f2 = fake();
  const limited = createPolyHaven({ fetch: f2.fetch, dir: tmp(), allow: () => false });
  await assert.rejects(limited.list("models"), (e: unknown) => e instanceof PhError && e.status === 429);
  assert.equal(f2.calls.urls.length, 0);
});

test("redirects are not followed and every request names this app", async () => {
  const seen: RequestInit[] = [];
  const ph = createPolyHaven({ fetch: ((_u: string, init?: RequestInit) => (seen.push(init ?? {}), Promise.resolve(Response.json(fixture.listing.hdris)))) as unknown as typeof fetch, dir: tmp() });
  await ph.list("hdris");
  assert.equal(seen[0].redirect, "error");
  assert.match(String((seen[0].headers as Record<string, string>)["user-agent"]), /^Doshy\/.+github\.com\/voicub\/Doshy/);
});

test("thumbnails are kept on disk and a bad picture is refused", async () => {
  const f = fake();
  const dir = tmp();
  const ph = createPolyHaven({ fetch: f.fetch, dir });
  assert.deepEqual([...(await ph.thumb("ArmChair_01", 256, "abbc4732"))], [...WEBP]);
  await ph.thumb("ArmChair_01", 256, "abbc4732");
  assert.equal(f.calls.urls.length, 1);
  assert.match(f.calls.urls[0], /^https:\/\/cdn\.polyhaven\.com\/asset_img\/thumbs\/ArmChair_01\.png\?width=256&height=256&format=webp&v=abbc4732$/);
  const junk = createPolyHaven({ fetch: fake({ "cdn.polyhaven.com": () => new Response("<html>nope</html>") }).fetch, dir: tmp() });
  await assert.rejects(junk.thumb("ArmChair_01", 256), (e: unknown) => e instanceof PhError && e.status === 502);
  await assert.rejects(ph.thumb("a/b", 256), (e: unknown) => e instanceof PhError && e.status === 400);
});
