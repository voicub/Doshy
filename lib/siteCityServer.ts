// Server side of GET /api/site/city: runs Vectiler (a native CLI, Nextzen vector tiles in, OBJ out) safely and caches the gzipped OBJ on disk.
// Node only (fs, child_process), but free of Next.js so the node test runner can load it: imports carry a .ts extension or are type-only.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { errorMessage } from "./guards.ts";
import { CITY_FAILURES, childEnv, cityKey, cityMeta, cityTileRange, explainRun, redact, vectilerArgs, type CityFailure, type CityQuery, type RunResult } from "./siteCity.ts";
import type { CityMeta } from "./siteCityTypes.ts";
import { SiteError } from "./siteServer.ts";
import { evictionPlan, windowLimiter, CACHE_CAP_BYTES, type CacheFile } from "./siteTiles.ts";
import { ttlCache } from "./server/ttlCache.ts";

const gzipAsync = promisify(gzip);

export const CITY_TTL_MS = 30 * 24 * 3600_000;
const RUN_TIMEOUT_MS = 120_000;
const MAX_STDIO_BYTES = 1024 * 1024;
const MAX_OBJ_BYTES = 80 * 1024 * 1024;
const CACHE_SUFFIX = ".obj.gz";
/** A well-formed API key: it becomes a command-line argument, so it may not start with a dash or hold anything but word characters. */
const API_KEY = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/;

/** At most this many Vectiler runs that reach Nextzen per minute, for the whole server. Cached answers are free. */
const upstreamLimit = windowLimiter(6, 60_000);

export type CityModel = { gz: Uint8Array; meta: CityMeta };
export type SpawnOptions = { cwd: string; env: Record<string, string>; timeoutMs: number };
/** Runs `file` (no shell) and resolves with how it ended; rejects with an error whose `code` is "ENOENT" when the program does not exist. */
export type SpawnFn = (file: string, args: string[], opts: SpawnOptions) => Promise<RunResult>;

export type CityOptions = {
  spawn?: SpawnFn;
  /** Folder of the cached files; default `<HOUSEY_SITE_CACHE or data/site-cache>/city`. */
  dir?: string;
  now?: number;
  timeoutMs?: number;
  env?: Readonly<Record<string, string | undefined>>;
  /** Where the temporary working folder is made; default the OS temp folder. */
  tmpRoot?: string;
  /** Asked once per run that would reach Nextzen. */
  allow?: (now: number) => boolean;
  capBytes?: number;
};

const cacheDir = () => resolve(process.env.HOUSEY_SITE_CACHE || join("data", "site-cache"), "city");

/** Real spawn. The child's output is capped and discarded beyond that; the original error (whose message holds the command line, so the key) is never passed on. */
const execSpawn: SpawnFn = (file, args, opts) => {
  const { promise, resolve, reject } = Promise.withResolvers<RunResult>();
  // The cast is only for Next's ProcessEnv typing, which insists on a NODE_ENV key; the child is a native tool that never reads it.
  const env = opts.env as NodeJS.ProcessEnv;
  execFile(file, args, { cwd: opts.cwd, env, timeout: opts.timeoutMs, killSignal: "SIGKILL", maxBuffer: MAX_STDIO_BYTES, encoding: "utf8" }, (err, stdout) => {
    if (!err) return resolve({ code: 0, signal: null, timedOut: false, stdout });
    if (err.code === "ENOENT") return reject(Object.assign(new Error("not installed"), { code: "ENOENT" }));
    const overflow = err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
    resolve({ code: typeof err.code === "number" ? err.code : null, signal: err.signal ?? null, timedOut: err.killed === true && !overflow, stdout: typeof stdout === "string" ? stdout : "" });
  });
  return promise;
};

const fail = (f: CityFailure) => new SiteError(f.status, f.message);

// ---- cache --------------------------------------------------------------------------------------------------------------------------

/** The cached gzip bytes, or undefined when there is none, it expired, or the file is not gzip. */
async function readCache(file: string, now: number): Promise<Uint8Array | undefined> {
  try {
    const s = await stat(file);
    if (now - s.mtimeMs >= CITY_TTL_MS) return undefined;
    const bytes = await readFile(file);
    return bytes[0] === 0x1f && bytes[1] === 0x8b ? bytes : undefined;
  } catch {
    return undefined;
  }
}

async function listCache(dir: string): Promise<CacheFile[]> {
  const out: CacheFile[] = [];
  for (const name of await readdir(dir).catch(() => [])) {
    if (!name.endsWith(CACHE_SUFFIX)) continue;
    const path = join(dir, name);
    const s = await stat(path).catch(() => null);
    if (s) out.push({ path, size: s.size, mtimeMs: s.mtimeMs });
  }
  return out;
}

/** Writes atomically, after deleting the oldest files that would push the folder over the cap. */
async function writeCache(dir: string, file: string, bytes: Uint8Array, cap: number): Promise<void> {
  await mkdir(dir, { recursive: true });
  await Promise.all(evictionPlan(await listCache(dir), bytes.length, cap).map((p) => unlink(p).catch(() => {})));
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}

// ---- running Vectiler ---------------------------------------------------------------------------------------------------------------

// ponytail: one run at a time for the whole server (Vectiler is CPU and memory heavy, Nextzen is rate limited); a pool if one run ever stops being enough.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job);
  chain = run.catch(() => {});
  return run;
}

/** One run in its own temporary folder (always removed): the gzipped OBJ. Throws a `SiteError` with a sentence fit to show. */
async function runVectiler(q: CityQuery, apiKey: string, opts: CityOptions): Promise<Uint8Array> {
  const env = opts.env ?? process.env;
  const range = cityTileRange(q.lat, q.lon, q.tiles);
  const dir = await mkdtemp(join(opts.tmpRoot ?? tmpdir(), "vectiler-"));
  try {
    const spawn = opts.spawn ?? execSpawn;
    const program = env.VECTILER_PATH?.trim() || "vectiler";
    let run: RunResult;
    try {
      run = await spawn(program, vectilerArgs(range, q, apiKey), { cwd: dir, env: childEnv(env, dir), timeoutMs: opts.timeoutMs ?? RUN_TIMEOUT_MS });
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") throw fail(CITY_FAILURES.notInstalled);
      throw new Error(redact(errorMessage(e), apiKey));
    }
    const failure = explainRun(run);
    if (failure) {
      console.error(`site city: ${failure.message} (exit ${run.code ?? run.signal ?? "none"})`);
      throw fail(failure);
    }
    const out = join(dir, "out.obj");
    const size = (await stat(out).catch(() => null))?.size;
    if (size === undefined || size === 0) throw fail(CITY_FAILURES.noData);
    if (size > MAX_OBJ_BYTES) throw fail(CITY_FAILURES.tooBig);
    const obj = await readFile(out);
    // A face line starts a line; the first line is Vectiler's comment, so a leading "f " cannot be missed.
    if (!obj.includes("\nf ")) throw fail(CITY_FAILURES.noData);
    return await gzipAsync(obj, { level: 6 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const inFlight = ttlCache<CityModel>(0, 64);

/**
 * The city model for the query: from the cache when fresh enough, else built by Vectiler (several callers asking for the same tiles share one run, runs go
 * one at a time, at most `allow` per minute). `fresh` skips the cache. Throws a `SiteError` with a sentence fit to show, never the child's own text or the key.
 */
export async function cityModel(q: CityQuery, opts: CityOptions = {}): Promise<CityModel> {
  const range = cityTileRange(q.lat, q.lon, q.tiles);
  const meta = cityMeta(range, q);
  const key = cityKey(range, q);
  const dir = opts.dir ?? cacheDir();
  const file = join(dir, `${key}${CACHE_SUFFIX}`);
  const now = opts.now ?? Date.now();
  const env = opts.env ?? process.env;
  const load = async (): Promise<CityModel> => {
    if (!q.fresh) {
      const hit = await readCache(file, now);
      if (hit) return { gz: hit, meta };
    }
    const apiKey = env.NEXTZEN_API_KEY?.trim() ?? "";
    if (!API_KEY.test(apiKey)) throw fail(CITY_FAILURES.keyMissing);
    if (!(opts.allow ?? upstreamLimit)(now)) throw fail(CITY_FAILURES.busy);
    try {
      const gz = await exclusive(() => runVectiler(q, apiKey, opts));
      await writeCache(dir, file, gz, opts.capBytes ?? CACHE_CAP_BYTES).catch((e: unknown) => console.error("site city: cache write:", errorMessage(e)));
      return { gz, meta };
    } catch (e) {
      if (e instanceof SiteError) throw e;
      console.error("site city:", redact(errorMessage(e), apiKey));
      throw new SiteError(500, "Something went wrong while building the city model.");
    }
  };
  return inFlight.get(key, load, { fresh: q.fresh });
}
