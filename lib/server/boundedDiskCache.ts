// A folder of downloaded files kept under a byte cap, least recently used first out. Writes are atomic (temp file, then rename) so a reader never sees half a
// file, and every read of a file touches its modification time, which is what "recently used" means here. The folder only ever holds things that can be
// fetched again, so deleting any of it is always safe. Node's type stripping loads this file in tests: .ts imports.
import { mkdir, readdir, readFile, rename, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { evictionPlan, type CacheFile } from "../siteTiles.ts";

/** File names that are safe to join onto the folder: no separators, no dot-only names. */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;

export type BoundedCache = {
  /** The file's bytes (and it counts as used), or null when it is not there. */
  get(sub: string, name: string): Promise<Uint8Array | null>;
  /** Keeps the bytes under `<dir>/<sub>/<name>`, making room first. Never throws: serving a download does not need its copy kept. */
  put(sub: string, name: string, bytes: Uint8Array): Promise<void>;
};

export function boundedCache(dir: string, capBytes: number, subs: readonly string[], log: (m: string) => void = () => {}): BoundedCache {
  const ok = (sub: string, name: string) => subs.includes(sub) && NAME_RE.test(name);
  let total: number | undefined; // counted once from the disk, then kept by hand: listing the folder on every write would be slow on a Pi

  async function list(): Promise<CacheFile[]> {
    const out: CacheFile[] = [];
    for (const sub of subs) {
      for (const name of await readdir(join(dir, sub)).catch(() => [])) {
        const path = join(dir, sub, name);
        const s = await stat(path).catch(() => null);
        if (s?.isFile()) out.push({ path, size: s.size, mtimeMs: s.mtimeMs });
      }
    }
    return out;
  }

  async function makeRoom(incoming: number): Promise<void> {
    if (total !== undefined && total + incoming <= capBytes) return;
    const files = await list();
    const doomed = new Set(evictionPlan(files, incoming, capBytes));
    await Promise.all([...doomed].map((p) => unlink(p).catch(() => {})));
    total = files.reduce((n, f) => (doomed.has(f.path) ? n : n + f.size), 0);
  }

  return {
    async get(sub, name) {
      if (!ok(sub, name)) return null;
      const path = join(dir, sub, name);
      try {
        const bytes = await readFile(path);
        const now = new Date();
        await utimes(path, now, now).catch(() => {});
        return bytes;
      } catch {
        return null;
      }
    },
    async put(sub, name, bytes) {
      if (!ok(sub, name) || bytes.length > capBytes) return;
      try {
        await makeRoom(bytes.length);
        await mkdir(join(dir, sub), { recursive: true });
        const path = join(dir, sub, name);
        const tmp = `${path}.${process.pid}.tmp`;
        await writeFile(tmp, bytes);
        await rename(tmp, path);
        total = (total ?? 0) + bytes.length;
      } catch (e) {
        log(`poly haven cache: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}
