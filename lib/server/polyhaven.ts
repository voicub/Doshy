// The Doshy server's polite client for Poly Haven (docs/polyhaven.md): the listing (kept in memory for 6 hours), thumbnails and the asset files (kept on disk, bounded),
// each fetched at most once per many uses. Nothing about the user, the plan or the home is ever sent: only an asset id in a fixed URL template, with a User-Agent
// that names this app as Poly Haven's terms ask. Every host is checked against a fixed list, redirects are refused, every body has a size cap and a timeout.
// A factory with injected `fetch` and folder, so the node tests run it without a network. Node's type stripping loads this file: .ts imports.
import { errorMessage } from "../guards.ts";
import { gltfZipToGlb, validateGlb } from "../modelLibrary.ts";
import { apiAssetsUrl, apiFilesUrl, isAssetId, isFileUrl, isRadiance, parseAssets, PH_HOSTS, PH_LIMITS, pickHdri, pickMaterial, pickModel, thumbUrl, type HdriRes, type PhFile, type PhItem, type PhType } from "../polyhaven.ts";
import { packMaterial, readMaterial, type MaterialMaps } from "../polyhavenMaterial.ts";
import { sniffImage } from "../siteTiles.ts";
import { boundedCache } from "./boundedDiskCache.ts";
import { readCapped } from "./readCapped.ts";
import { ttlCache } from "./ttlCache.ts";

/** Poly Haven wants a User-Agent unique to the app, so they can see which app a request comes from. */
export const USER_AGENT = "Doshy/1.0 (+https://github.com/voicub/Doshy; Poly Haven browser)";
export const LIST_TTL_MS = 6 * 60 * 60 * 1000;
export const CACHE_CAP_BYTES = 500 * 1024 * 1024;
const JSON_TIMEOUT_MS = 20_000;
const FILE_TIMEOUT_MS = 60_000;
const MAX_LIST_BYTES = 8 * 1024 * 1024;
const MAX_FILES_JSON_BYTES = 512 * 1024;
const PARALLEL = 4;

/** A failure with the HTTP status and the plain sentence to show. Nothing from upstream (text, URLs, headers) is ever put in the message. */
export class PhError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const OFFLINE = new PhError(503, "Poly Haven cannot be reached right now. Assets you already downloaded still work; try again later.");

export type DownloadKind = "hdri" | "material" | "model";
export type Download = { bytes: Uint8Array; mime: string };

export type PolyHaven = {
  list(type: PhType): Promise<PhItem[]>;
  /** The listing entry of one asset, or undefined when Poly Haven has no such id. */
  item(type: PhType, id: string): Promise<PhItem | undefined>;
  thumb(id: string, size: 128 | 256, v?: string): Promise<Uint8Array>;
  download(kind: DownloadKind, id: string, res: HdriRes): Promise<Download>;
};

/** `allow` is asked before every request that would leave the machine (a rate limit for the whole server); false answers 429 without calling Poly Haven. `cdn` says it is a preview picture: a grid of 48 asks for 48 at once, which the API's limit must not count. */
type Deps = { fetch?: typeof fetch; dir: string; log?: (m: string) => void; now?: () => number; allow?: (cdn: boolean) => boolean };

const HOSTS: readonly string[] = Object.values(PH_HOSTS);

export function createPolyHaven(deps: Deps): PolyHaven {
  const doFetch = deps.fetch ?? fetch;
  const log = deps.log ?? (() => {});
  const disk = boundedCache(deps.dir, CACHE_CAP_BYTES, ["files", "thumbs"], log);
  const lists = ttlCache<PhItem[]>(LIST_TTL_MS, 3, deps.now);
  const filesInfo = ttlCache<unknown>(LIST_TTL_MS, 128, deps.now);
  const inFlight = new Map<string, Promise<Download>>();

  /** One GET: fixed hosts only, no redirects, a timeout and a byte cap. Failures become `PhError`s with plain sentences. */
  async function get(url: string, cap: number, timeoutMs: number, accept: string): Promise<Uint8Array> {
    let host = "";
    try {
      const u = new URL(url);
      host = u.hostname;
      if (u.protocol !== "https:" || u.port || u.username || !HOSTS.includes(host)) throw new Error("host");
    } catch {
      throw new PhError(502, "Poly Haven sent a link this app will not follow.");
    }
    if (deps.allow && !deps.allow(host === PH_HOSTS.cdn)) throw new PhError(429, "Too many downloads at once. Try again in a minute.");
    let res: Response;
    try {
      res = await doFetch(url, { headers: { "user-agent": USER_AGENT, accept }, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    } catch (e) {
      log(`poly haven ${host}: ${errorMessage(e)}`);
      throw OFFLINE;
    }
    if (res.status === 404) throw new PhError(404, "Poly Haven does not have that asset.");
    if (res.status === 429) throw new PhError(429, "Poly Haven asked us to slow down. Try again in a few minutes.");
    if (!res.ok || !res.body) throw OFFLINE;
    const announced = Number(res.headers.get("content-length"));
    if (announced > cap) throw new PhError(413, "That download is bigger than this app accepts.");
    const bytes = await readCapped(res.body, cap, announced).catch(() => null);
    if (!bytes) throw new PhError(413, "That download is bigger than this app accepts.");
    return bytes;
  }

  async function json(url: string, cap: number): Promise<unknown> {
    const bytes = await get(url, cap, JSON_TIMEOUT_MS, "application/json");
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new PhError(502, "Poly Haven answered with something this app could not read.");
    }
  }

  const list = (type: PhType) => lists.get(type, async () => parseAssets(type, await json(apiAssetsUrl(type), MAX_LIST_BYTES)));
  const filesOf = (id: string) => filesInfo.get(id, () => json(apiFilesUrl(id), MAX_FILES_JSON_BYTES));
  const bytesOf = (f: PhFile, cap: number) => (isFileUrl(f.url) ? get(f.url, Math.min(cap, Math.ceil(f.size * 1.02) + 1024), FILE_TIMEOUT_MS, "*/*") : Promise.reject(new PhError(502, "Poly Haven sent a link this app will not follow.")));

  /** `fn` over `items`, `PARALLEL` at a time: a model has a handful of pictures, and the service is not to be hammered. */
  async function pooled<T, R>(items: readonly T[], fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }));
    return out;
  }

  const missing = (what: string) => new PhError(404, `Poly Haven has no ${what} for that asset.`);

  async function build(kind: DownloadKind, id: string, res: HdriRes): Promise<Download> {
    if (kind === "hdri") {
      const pick = pickHdri(await filesOf(id), res);
      if (!pick) throw missing("lighting picture");
      const bytes = await bytesOf(pick, PH_LIMITS.hdriBytes);
      if (!isRadiance(bytes)) throw new PhError(502, "Poly Haven sent a picture this app cannot read.");
      return { bytes, mime: "application/octet-stream" };
    }
    if (kind === "material") {
      const pick = pickMaterial(await filesOf(id));
      if (!pick) throw missing("texture pictures");
      const [diff, rough, nor] = await Promise.all([bytesOf(pick.diff, PH_LIMITS.textureFileBytes), pick.rough && bytesOf(pick.rough, PH_LIMITS.textureFileBytes), pick.nor && bytesOf(pick.nor, PH_LIMITS.textureFileBytes)]);
      const maps: MaterialMaps = { diff, ...(rough ? { rough } : {}), ...(nor ? { nor } : {}) };
      const meta = (await list("textures")).find((i) => i.id === id);
      const scale = meta?.dims ? Math.min(...meta.dims) : undefined;
      try {
        return { bytes: packMaterial({ asset: id, name: meta?.name ?? id, authors: meta?.authors ?? [], ...(scale ? { scaleM: scale } : {}) }, maps, PH_LIMITS.materialBytes), mime: "application/octet-stream" };
      } catch (e) {
        throw new PhError(502, errorMessage(e));
      }
    }
    const pick = pickModel(await filesOf(id));
    if (!pick) throw missing("model files");
    const entries = Object.entries(pick.include);
    const parts = await pooled([...entries.map(([, f]) => f), pick.gltf], (f) => bytesOf(f, PH_LIMITS.modelSourceBytes));
    const files = new Map<string, Uint8Array>(entries.map(([name], i) => [name, parts[i]]));
    files.set("model.gltf", parts[entries.length]);
    try {
      const glb = gltfZipToGlb(files);
      if (glb.length > PH_LIMITS.glbBytes) throw new PhError(413, `This model is too big to import (${Math.round(PH_LIMITS.glbBytes / 1024 / 1024)} MB at most once its pictures are packed in).`);
      validateGlb(glb);
      return { bytes: glb, mime: "model/gltf-binary" };
    } catch (e) {
      throw e instanceof PhError ? e : new PhError(502, errorMessage(e));
    }
  }

  /** A kept copy is trusted only after the same check a fresh download gets (a damaged file is fetched again). */
  const valid = (kind: DownloadKind, b: Uint8Array) => (kind === "hdri" ? isRadiance(b) : kind === "material" ? readMaterial(b) !== null : b.length > 20 && new TextDecoder("latin1").decode(b.subarray(0, 4)) === "glTF");

  return {
    list,
    async item(type, id) {
      return (await list(type)).find((i) => i.id === id);
    },
    async thumb(id, size, v) {
      const url = thumbUrl(id, size, v);
      if (!url) throw new PhError(400, "That is not a Poly Haven picture.");
      const name = `${id}_${size}_${v ?? "x"}.webp`;
      const kept = await disk.get("thumbs", name);
      if (kept && sniffImage(kept)) return kept;
      const bytes = await get(url, 512 * 1024, JSON_TIMEOUT_MS, "image/webp,image/*");
      if (!sniffImage(bytes)) throw new PhError(502, "Poly Haven sent a picture this app cannot read.");
      await disk.put("thumbs", name, bytes);
      return bytes;
    },
    async download(kind, id, res) {
      if (!isAssetId(id)) throw new PhError(400, "That is not a Poly Haven asset.");
      const ext = kind === "model" ? "glb" : "bin";
      const name = `${kind}-${id}-${kind === "hdri" ? res : "1k"}.${ext}`;
      const mime = kind === "model" ? "model/gltf-binary" : "application/octet-stream";
      const kept = await disk.get("files", name);
      if (kept && valid(kind, kept)) return { bytes: kept, mime };
      let job = inFlight.get(name);
      if (!job) {
        job = build(kind, id, res)
          .then(async (d) => {
            await disk.put("files", name, d.bytes);
            return d;
          })
          .finally(() => inFlight.delete(name));
        inFlight.set(name, job);
      }
      return job;
    },
  };
}
