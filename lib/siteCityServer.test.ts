import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { gunzipSync } from "node:zlib";
import { cityModel, type SpawnFn, type SpawnOptions } from "./siteCityServer.ts";
import { SiteError } from "./siteServer.ts";
import type { CityQuery, RunResult } from "./siteCity.ts";

const KEY = "sekret123KEY";
const OBJ = "# exported with vectiler\n\no b1\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
const STDOUT = `Using API key ${KEY}\nURL request: https://tile.nextzen.org/t.json?api_key=${KEY}\nSaved obj file: out.obj\nTriangles: 1\n`;

let root: string;
let tmpRoot: string;
let n = 0;
before(async () => {
  root = await mkdtemp(join(tmpdir(), "city-test-"));
  tmpRoot = join(root, "tmp");
  await mkdir(tmpRoot);
});
after(() => rm(root, { recursive: true, force: true }));

// Every test gets its own cache folder and its own tiles, so no state leaks between them.
const query = (over: Partial<CityQuery> = {}): CityQuery => ({ lat: 10 + n++ * 0.5, lon: 20, tiles: 3, terrain: false, roads: true, fresh: false, ...over });
const folder = () => join(root, `cache-${n++}`);
const env = { NEXTZEN_API_KEY: KEY, PATH: "/usr/bin", HA_TOKEN: "ha-secret" };
const leftovers = () => readdir(tmpRoot);

type Call = { file: string; args: string[]; opts: SpawnOptions };
const CLEAN: RunResult = { code: 0, signal: null, timedOut: false, stdout: STDOUT };
function fakeSpawn(write: (cwd: string) => Promise<void> = (cwd) => writeFile(join(cwd, "out.obj"), OBJ), result: RunResult = CLEAN) {
  const calls: Call[] = [];
  const spawn: SpawnFn = async (file, args, opts) => {
    calls.push({ file, args, opts });
    await write(opts.cwd);
    return result;
  };
  return { spawn, calls };
}
const base = (dir: string, over: object = {}) => ({ dir, env, tmpRoot, allow: () => true, ...over });

test("a miss runs Vectiler, caches the gzip and answers it with the meta", async () => {
  const dir = folder();
  const { spawn, calls } = fakeSpawn();

  const r = await cityModel(query(), { ...base(dir), spawn });

  assert.equal(gunzipSync(r.gz).toString(), OBJ);
  assert.equal(calls.length, 1);
  assert.deepEqual([r.meta.z, r.meta.nx, r.meta.ny, r.meta.roads], [16, 3, 3, true]);
  const files = await readdir(dir);
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith(".obj.gz"));
  assert.equal(gunzipSync(await readFile(join(dir, files[0]))).toString(), OBJ);
});

test("the second call is served from the cache without spawning or needing the key", async () => {
  const dir = folder();
  const q = query();
  const first = fakeSpawn();
  await cityModel(q, { ...base(dir), spawn: first.spawn });
  const second = fakeSpawn();

  const r = await cityModel(q, { ...base(dir, { env: { PATH: "/usr/bin" } }), spawn: second.spawn });

  assert.equal(second.calls.length, 0);
  assert.equal(gunzipSync(r.gz).toString(), OBJ);
});

test("homes in the same tiles share one cached file", async () => {
  const dir = folder();
  const q = query({ lat: 45.75, lon: 4.85 });
  const { spawn, calls } = fakeSpawn();
  await cityModel(q, { ...base(dir), spawn });

  await cityModel({ ...q, lat: 45.7501, lon: 4.8501 }, { ...base(dir), spawn });

  assert.equal(calls.length, 1);
});

test("an expired file is rebuilt", async () => {
  const dir = folder();
  const q = query();
  const { spawn, calls } = fakeSpawn();
  await cityModel(q, { ...base(dir), spawn });
  const [file] = await readdir(dir);
  const old = new Date(Date.now() - 31 * 24 * 3600_000);
  await utimes(join(dir, file), old, old);

  await cityModel(q, { ...base(dir), spawn });

  assert.equal(calls.length, 2);
});

test("a cached file that is not gzip is rebuilt", async () => {
  const dir = folder();
  const q = query();
  const { spawn, calls } = fakeSpawn();
  await cityModel(q, { ...base(dir), spawn });
  const [file] = await readdir(dir);
  await writeFile(join(dir, file), "garbage");

  const r = await cityModel(q, { ...base(dir), spawn });

  assert.equal(calls.length, 2);
  assert.equal(gunzipSync(r.gz).toString(), OBJ);
});

test("fresh skips the cache", async () => {
  const dir = folder();
  const q = query();
  const { spawn, calls } = fakeSpawn();
  await cityModel(q, { ...base(dir), spawn });

  await cityModel({ ...q, fresh: true }, { ...base(dir), spawn });

  assert.equal(calls.length, 2);
});

test("two concurrent calls for the same tiles share one run", async () => {
  const dir = folder();
  const q = query();
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const { spawn, calls } = fakeSpawn(async (cwd) => {
    started.resolve();
    await release.promise;
    await writeFile(join(cwd, "out.obj"), OBJ);
  });
  const both = Promise.all([cityModel(q, { ...base(dir), spawn }), cityModel(q, { ...base(dir), spawn })]);
  await started.promise;
  release.resolve();
  const [a, b] = await both;

  assert.equal(calls.length, 1);
  assert.equal(a, b);
});

test("runs for different tiles go one at a time", async () => {
  let active = 0;
  let peak = 0;
  const { spawn } = fakeSpawn(async (cwd) => {
    peak = Math.max(peak, ++active);
    await writeFile(join(cwd, "out.obj"), OBJ); // real I/O yields, so an unlocked second run would overlap here
    active--;
  });
  const dir = folder();

  await Promise.all([cityModel(query({ lat: 11 }), { ...base(dir), spawn }), cityModel(query({ lat: 31 }), { ...base(dir), spawn }), cityModel(query({ lat: 51 }), { ...base(dir), spawn })]);

  assert.equal(peak, 1);
});

test("the child gets no argument shell can read, a clean environment and its own folder", async () => {
  const { spawn, calls } = fakeSpawn();

  await cityModel(query(), { ...base(folder()), spawn });

  const [{ opts, args }] = calls;
  assert.deepEqual(Object.keys(opts.env).sort(), ["HOME", "PATH"]);
  assert.equal(opts.env.HOME, opts.cwd);
  assert.ok(opts.cwd.startsWith(tmpRoot));
  assert.equal(args[args.indexOf("--apikey") + 1], KEY);
  assert.ok(!JSON.stringify(opts.env).includes("ha-secret"));
});

test("VECTILER_PATH picks the program, else vectiler on the PATH", async () => {
  const a = fakeSpawn();
  const b = fakeSpawn();

  await cityModel(query(), { ...base(folder(), { env: { ...env, VECTILER_PATH: "/opt/v/vectiler" } }), spawn: a.spawn });
  await cityModel(query(), { ...base(folder()), spawn: b.spawn });

  assert.equal(a.calls[0].file, "/opt/v/vectiler");
  assert.equal(b.calls[0].file, "vectiler");
});

test("a missing or malformed key stops before anything runs", async () => {
  for (const key of [undefined, "  ", "--evil", "a b"]) {
    const { spawn, calls } = fakeSpawn();

    await assert.rejects(cityModel(query(), { ...base(folder(), { env: { PATH: "/usr/bin", NEXTZEN_API_KEY: key } }), spawn }), (e) => e instanceof SiteError && e.status === 503 && /NEXTZEN_API_KEY/.test(e.message));

    assert.equal(calls.length, 0);
  }
});

test("a program that does not exist is a plain not-installed sentence", async () => {
  const spawn: SpawnFn = async () => {
    throw Object.assign(new Error(`spawn vectiler ENOENT --apikey ${KEY}`), { code: "ENOENT" });
  };

  await assert.rejects(cityModel(query(), { ...base(folder()), spawn }), (e) => e instanceof SiteError && e.status === 503 && /not installed/.test(e.message) && !e.message.includes(KEY));
  assert.deepEqual(await leftovers(), []);
});

test("a timed out run is a 504 and leaves nothing behind or cached", async () => {
  const dir = folder();
  const { spawn } = fakeSpawn(undefined, { code: null, signal: "SIGKILL", timedOut: true, stdout: STDOUT });

  await assert.rejects(cityModel(query(), { ...base(dir), spawn }), (e) => e instanceof SiteError && e.status === 504);

  assert.deepEqual(await leftovers(), []);
  assert.deepEqual(await readdir(dir).catch(() => []), []);
});

test("a crash, a network failure and a rejected key never leak the child's text or the key", async () => {
  const cases: { result: RunResult; status: number }[] = [
    { result: { code: 3, signal: null, timedOut: false, stdout: STDOUT }, status: 502 },
    { result: { code: 0, signal: null, timedOut: false, stdout: `${STDOUT}URL request: https://t?api_key=${KEY} -- Failure: Couldn't resolve host name\n` }, status: 502 },
    { result: { code: 0, signal: null, timedOut: false, stdout: `${STDOUT}ERROR: GeoJSON missing 'features' member\n` }, status: 502 },
  ];
  for (const c of cases) {
    const { spawn } = fakeSpawn(undefined, c.result);

    await assert.rejects(cityModel(query(), { ...base(folder()), spawn }), (e) => e instanceof SiteError && e.status === c.status && !e.message.includes(KEY) && !/api_key|Using API key/.test(e.message));
  }
  assert.deepEqual(await leftovers(), []);
});

test("an unexpected spawn error becomes a generic 500 and the logged text has no key", async () => {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  const spawn: SpawnFn = async () => {
    throw new Error(`Command failed: vectiler --apikey ${KEY}`);
  };

  try {
    await assert.rejects(cityModel(query(), { ...base(folder()), spawn }), (e) => e instanceof SiteError && e.status === 500 && !e.message.includes(KEY));
  } finally {
    console.error = original;
  }

  assert.ok(logged.length > 0);
  assert.ok(!logged.join("\n").includes(KEY));
});

test("an OBJ over the size cap is refused before it is read", async () => {
  const dir = folder();
  const { spawn } = fakeSpawn(async (cwd) => {
    const f = join(cwd, "out.obj");
    await writeFile(f, "x");
    await truncate(f, 80 * 1024 * 1024 + 1); // sparse: no real 80 MB is written
  });

  await assert.rejects(cityModel(query(), { ...base(dir), spawn }), (e) => e instanceof SiteError && e.status === 502 && /too detailed/.test(e.message));

  assert.deepEqual(await leftovers(), []);
  assert.deepEqual(await readdir(dir).catch(() => []), []);
});

test("an OBJ without a face, or no OBJ at all, is a no-data 404", async () => {
  for (const write of [(cwd: string) => writeFile(join(cwd, "out.obj"), "# header\nv 0 0 0\n"), async () => {}]) {
    const { spawn } = fakeSpawn(write);

    await assert.rejects(cityModel(query(), { ...base(folder()), spawn }), (e) => e instanceof SiteError && e.status === 404);
  }
  assert.deepEqual(await leftovers(), []);
});

test("the temporary folder is removed after a success", async () => {
  const { spawn } = fakeSpawn();

  await cityModel(query(), { ...base(folder()), spawn });

  assert.deepEqual(await leftovers(), []);
});

test("too many runs a minute are refused with a 429 sentence", async () => {
  const { spawn, calls } = fakeSpawn();

  await assert.rejects(cityModel(query(), { ...base(folder(), { allow: () => false }), spawn }), (e) => e instanceof SiteError && e.status === 429);

  assert.equal(calls.length, 0);
});

test("a failed run is not cached and the next call tries again", async () => {
  const dir = folder();
  const q = query();
  await assert.rejects(cityModel(q, { ...base(dir), spawn: fakeSpawn(undefined, { code: 1, signal: null, timedOut: false, stdout: "" }).spawn }));
  const ok = fakeSpawn();

  await cityModel(q, { ...base(dir), spawn: ok.spawn });

  assert.equal(ok.calls.length, 1);
});

test("writing a new file evicts the oldest ones over the cap", async () => {
  const dir = folder();
  const { spawn } = fakeSpawn();
  const first = query({ lat: 12 });
  await cityModel(first, { ...base(dir), spawn });
  const [oldFile] = await readdir(dir);
  const old = new Date(Date.now() - 3600_000);
  await utimes(join(dir, oldFile), old, old);
  const size = (await stat(join(dir, oldFile))).size;

  await cityModel(query({ lat: 33 }), { ...base(dir, { capBytes: size + size / 2 }), spawn });

  const left = await readdir(dir);
  assert.equal(left.length, 1);
  assert.notEqual(left[0], oldFile);
});
