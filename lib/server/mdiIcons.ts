// The Doshy server's polite client for the Iconify API, which serves Material Design Icons (docs/mdi-icons.md): the drawing of a few icons per request and the icon search.
// Only an icon name or a search word in a fixed URL template leaves the machine (never anything about the home), with a User-Agent that names this app. The host is fixed,
// redirects are refused, every answer has a byte cap and a timeout and is re-checked (lib/mdi.ts) before it is kept or returned. Found icons are kept in memory and on disk
// (bounded), so each is fetched once; an icon Iconify does not have is remembered for a while so a wrong name cannot make a request every time.
// A factory with injected `fetch` and folder, so the node tests run it without a network. Node's type stripping loads this file: .ts imports.
import { errorMessage } from "../guards.ts";
import { cleanMdiIcon, isMdiName, mdiFromData, mdiSearchNames, searchTerm, type MdiIcon } from "../mdi.ts";
import { boundedCache } from "./boundedDiskCache.ts";
import { readCapped } from "./readCapped.ts";
import { ttlCache } from "./ttlCache.ts";

export const USER_AGENT = "Doshy/1.0 (+https://github.com/voicub/Doshy; Material Design Icons)";
export const ICONIFY_HOST = "api.iconify.design";
/** The most icons one request may ask for (the picker's grid is 24; a plan rarely names more than a dozen kinds). */
export const MAX_NAMES = 40;
export const MAX_SEARCH = 96;
const CACHE_CAP_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_ANSWER_BYTES = 512 * 1024;
const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 60 * 60 * 1000;
const SEARCH_TTL_MS = 60 * 60 * 1000;
const MEMORY_ENTRIES = 600;
/** Iconify's search never returns fewer than this many (a smaller `limit` is raised to it), so the request asks for the most we show and the answer is cut after. */
const SEARCH_LIMIT = 96;

/** A failure with the HTTP status and the plain sentence to show. Nothing from upstream (text, URLs, headers) is ever put in the message. */
export class MdiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const OFFLINE = new MdiError(503, "The icon service cannot be reached right now. Icons you already used still work; try again later.");

export type MdiIcons = {
  /** The drawings of these icons (valid names); a name Iconify does not have is simply absent from the answer. */
  get(names: readonly string[]): Promise<Record<string, MdiIcon>>;
  /** Names matching a search word, best first, at most `max`. */
  search(term: string, max: number): Promise<string[]>;
};

/** `allow` is asked before every request that would leave the machine (a rate limit for the whole server); false answers 429 without calling Iconify. */
type Deps = { fetch?: typeof fetch; dir: string; log?: (m: string) => void; now?: () => number; allow?: () => boolean };

type Remembered = { icon: MdiIcon | null; at: number };

export function createMdiIcons(deps: Deps): MdiIcons {
  const doFetch = deps.fetch ?? fetch;
  const log = deps.log ?? (() => {});
  const now = deps.now ?? Date.now;
  const disk = boundedCache(deps.dir, CACHE_CAP_BYTES, ["mdi"], log);
  const searches = ttlCache<string[]>(SEARCH_TTL_MS, 100, deps.now);
  const memory = new Map<string, Remembered>(); // null icon = Iconify has no such icon
  const decoder = new TextDecoder();

  function recall(name: string): Remembered | undefined {
    const hit = memory.get(name);
    if (hit && now() - hit.at > (hit.icon ? FOUND_TTL_MS : MISSING_TTL_MS)) memory.delete(name);
    return memory.get(name);
  }
  function remember(name: string, icon: MdiIcon | null) {
    if (!memory.has(name) && memory.size >= MEMORY_ENTRIES) memory.delete(memory.keys().next().value as string); // oldest first
    memory.set(name, { icon, at: now() });
  }

  /** One GET to Iconify's fixed host: no redirects, a timeout, a byte cap; the JSON of the answer. Failures become `MdiError`s with plain sentences. */
  async function getJson(path: string): Promise<unknown> {
    if (deps.allow && !deps.allow()) throw new MdiError(429, "Too many icon requests at once. Try again in a minute.");
    let res: Response;
    try {
      res = await doFetch(`https://${ICONIFY_HOST}${path}`, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    } catch (e) {
      log(`mdi icons: ${errorMessage(e)}`);
      throw OFFLINE;
    }
    if (res.status === 429) throw new MdiError(429, "The icon service asked us to slow down. Try again in a few minutes.");
    if (!res.ok || !res.body) throw OFFLINE;
    const announced = Number(res.headers.get("content-length"));
    const tooBig = new MdiError(502, "The icon service sent more than this app accepts.");
    if (announced > MAX_ANSWER_BYTES) throw tooBig;
    const bytes = await readCapped(res.body, MAX_ANSWER_BYTES, announced).catch(() => null);
    if (!bytes) throw tooBig;
    try {
      return JSON.parse(decoder.decode(bytes));
    } catch {
      throw new MdiError(502, "The icon service sent something this app cannot read.");
    }
  }

  async function fromDisk(name: string): Promise<MdiIcon | null> {
    const bytes = await disk.get("mdi", `${name}.json`);
    if (!bytes) return null;
    try {
      return cleanMdiIcon(JSON.parse(decoder.decode(bytes)));
    } catch {
      return null; // a damaged file is fetched again
    }
  }

  return {
    async get(names) {
      const out: Record<string, MdiIcon> = {};
      const need: string[] = [];
      for (const name of new Set(names.filter(isMdiName))) {
        const known = recall(name);
        const icon = known ? known.icon : await fromDisk(name);
        if (icon) {
          out[name] = icon;
          if (!known) remember(name, icon);
        } else if (!known) need.push(name);
      }
      if (!need.length) return out;
      const data = await getJson(`/mdi.json?icons=${need.join(",")}`);
      for (const name of need) {
        const icon = mdiFromData(data, name);
        remember(name, icon);
        if (!icon) continue;
        out[name] = icon;
        await disk.put("mdi", `${name}.json`, new TextEncoder().encode(JSON.stringify(icon))); // never throws; a missing copy only costs one more fetch next time
      }
      return out;
    },
    async search(term, max) {
      const word = searchTerm(term);
      if (!word) return [];
      const names = await searches.get(word, async () => mdiSearchNames(await getJson(`/search?query=${encodeURIComponent(word)}&prefix=mdi&limit=${SEARCH_LIMIT}`), MAX_SEARCH));
      return names.slice(0, max);
    },
  };
}
