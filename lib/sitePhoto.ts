// The satellite photo of the site, in the browser: fetch the covering tiles from our own tile route (app/api/site/tile), stitch them onto one canvas,
// find the trees in it, and hand the scene a texture. The pure parts (which tiles, sizes) are in sitePhotoMath.ts and the tree finding in canopy.ts.
import type { LatLon } from "./geo.ts";
import { detectTrees } from "./canopy.ts";
import { TILE_PX, mapLimit, planTiles, pow2Size } from "./sitePhotoMath.ts";
import { REQUEST_TIMEOUT_MS, within } from "./requestTimeout.ts";
import { SITE_TILE_MAX_ZOOM, SITE_TILE_ROUTE } from "./siteTypes.ts";
import type { SiteTree } from "./siteTypes.ts";

export type SitePhoto = {
  /** The stitched picture: row 0 is the north edge, column 0 the west edge. */
  canvas: HTMLCanvasElement;
  /** Site metres (x east, y south, so y0 is the north edge) the canvas covers: a little more than the radius square on every side. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  zoom: number;
  metresPerPixel: number;
  /** Tiles that could not be loaded: painted plain grass, so the picture has no black holes. */
  failed: number;
  /** The provider's credit line, to show while the photo is on screen. */
  credit: string;
};

const CONCURRENCY = 6;
const NEUTRAL_GRASS = "#5f7a45";

type TileResult = { bitmap: ImageBitmap | null; credit: string | null; /** the server's deepest zoom, when it said this one is too deep */ tooDeep: number | null };

async function fetchTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<TileResult> {
  const none: TileResult = { bitmap: null, credit: null, tooDeep: null };
  let res: Response;
  try {
    res = await fetch(`${SITE_TILE_ROUTE}/${z}/${x}/${y}`, { signal: within(REQUEST_TIMEOUT_MS, signal) });
  } catch (e) {
    if (signal?.aborted) throw e;
    return none;
  }
  if (!res.ok) {
    const deepest = Number(res.headers.get("x-tile-max-zoom"));
    return res.status === 404 && Number.isInteger(deepest) && deepest < z ? { ...none, tooDeep: deepest } : none;
  }
  try {
    return { bitmap: await createImageBitmap(await res.blob()), credit: res.headers.get("x-tile-credit"), tooDeep: null };
  } catch (e) {
    if (signal?.aborted) throw e;
    return none;
  }
}

/** The photo covering `radius` metres around `center`. Uses the deepest zoom the provider has that keeps it to 6 x 6 tiles. Rejects with a plain sentence when no tile at all could be loaded. */
export async function loadSitePhoto(center: LatLon, radius: number, signal?: AbortSignal): Promise<SitePhoto> {
  let maxZoom = SITE_TILE_MAX_ZOOM;
  for (let attempt = 0; ; attempt++) {
    const plan = planTiles(center, radius, maxZoom);
    const wanted = Array.from({ length: plan.cols * plan.rows }, (_, i) => ({ col: i % plan.cols, row: Math.floor(i / plan.cols) }));
    const tiles = await mapLimit(wanted, CONCURRENCY, (t) => fetchTile(plan.z, plan.x0 + t.col, plan.y0 + t.row, signal), signal);
    // the provider (set by the server's environment) may be shallower than we assumed: ask again one level up, once
    const shallower = tiles.find((t) => t.tooDeep !== null && t.tooDeep < plan.z);
    if (shallower?.tooDeep != null && attempt === 0) {
      maxZoom = shallower.tooDeep;
      continue;
    }
    const failed = tiles.filter((t) => !t.bitmap).length;
    if (failed === tiles.length) throw new Error("The satellite pictures could not be loaded. Check the connection and try again.");
    const canvas = document.createElement("canvas");
    canvas.width = plan.cols * TILE_PX;
    canvas.height = plan.rows * TILE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw the satellite picture.");
    ctx.fillStyle = NEUTRAL_GRASS;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tiles.forEach((t, i) => {
      if (!t.bitmap) return;
      ctx.drawImage(t.bitmap, wanted[i].col * TILE_PX, wanted[i].row * TILE_PX, TILE_PX, TILE_PX);
      t.bitmap.close();
    });
    return { canvas, bounds: plan.bounds, zoom: plan.z, metresPerPixel: plan.metresPerPixel, failed, credit: tiles.find((t) => t.credit)?.credit ?? "" };
  }
}

/** One turn of the event loop (input and painting can run). A message, not a timer: timers are throttled to once a second in a background tab. */
const yieldToPage = () =>
  new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => resolve();
    port2.postMessage(0);
  });

/** Trees found in the photo (source "photo"), strongest first, at most 2500. A heuristic on colour and texture: see canopy.ts. Lets the page paint between steps; about half a second for the largest photo. */
export async function detectPhotoTrees(photo: SitePhoto, signal?: AbortSignal): Promise<SiteTree[]> {
  const { canvas, bounds } = photo;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const sx = (bounds.x1 - bounds.x0) / canvas.width;
  const sy = (bounds.y1 - bounds.y0) / canvas.height;
  return detectTrees(
    img,
    { metresPerPixel: photo.metresPerPixel, toSite: (px, py) => [bounds.x0 + px * sx, bounds.y0 + py * sy] },
    async () => {
      signal?.throwIfAborted();
      await yieldToPage();
    },
  );
}

/** A copy of the photo for use as a texture: width and height rounded up to a power of two, at most 2048 px. The same area as `photo.bounds` (stretched a little when rounding). */
export function groundTexture(photo: SitePhoto): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = pow2Size(photo.canvas.width);
  out.height = pow2Size(photo.canvas.height);
  const ctx = out.getContext("2d");
  if (!ctx) return photo.canvas;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(photo.canvas, 0, 0, out.width, out.height);
  return out;
}
