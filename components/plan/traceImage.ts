import { NetError, ApiError, fetchResourceFile, putResource } from "@/lib/dbApi";
import { sha256Hex } from "@/lib/sha256";
import type { Trace } from "@/lib/designTypes";
import { MAX_SIDE, MAX_STORED_BYTES, checkFile, fitSize, traceIdOf } from "@/lib/traceUpload";
import { fitToView, type Rect } from "@/lib/traceGeom";

/** The stored picture's address. The route answers with the stored type and an ETag, so the browser re-checks cheaply instead of downloading again. */
export const traceUrl = (resourceId: string) => `/api/db/resources/${encodeURIComponent(resourceId)}`;

const JPEG_QUALITY = 0.85;
const SHRINKS = [1, 0.75, 0.5]; // tried in turn when the stored picture is still over the size cap (a huge photo that does not compress)
const FALLBACK_VIEW: Rect = { x: -5, y: -4, w: 10, h: 8 };

type Decoded = { source: CanvasImageSource; w: number; h: number; free: () => void };

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = url;
  });

/** The file as something a canvas can draw. An SVG goes through an <img> (scripts in it do not run there); the rest through createImageBitmap, falling back to <img>. */
async function decode(file: File, vector: boolean): Promise<Decoded> {
  if (!vector && typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, w: bmp.width, h: bmp.height, free: () => bmp.close() };
    } catch {
      /* some formats the browser draws in an <img> but cannot make a bitmap of: try that */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // an SVG with no size of its own reports 0: any size will do, it is drawn at the full 2048 anyway
    return { source: img, w: img.naturalWidth || 1024, h: img.naturalHeight || 1024, free: () => { img.src = ""; URL.revokeObjectURL(url); } };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** The picture drawn at most `side` px on its longest side on white (a see-through PNG would turn black as a JPEG), then stored both ways, keeping the smaller. */
async function encode(d: Decoded, vector: boolean, side: number): Promise<{ blob: Blob; w: number; h: number } | null> {
  const { w, h } = fitSize(d.w, d.h, side, vector);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [w, h];
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(d.source, 0, 0, w, h);
    const [png, jpeg] = [await toBlob(canvas, "image/png"), await toBlob(canvas, "image/jpeg", JPEG_QUALITY)]; // line drawings are usually smaller as PNG, photos as JPEG
    const best = [png, jpeg].filter((b): b is Blob => !!b).sort((a, b) => a.size - b.size)[0];
    return best ? { blob: best, w, h } : null;
  } finally {
    [canvas.width, canvas.height] = [0, 0]; // frees the pixels now, not whenever the garbage collector gets to it
  }
}

/** SHA-256 in hex: the browser's when it has one (https, localhost), else the plain-code one (a wall display opened over plain http). */
export async function hashOf(bytes: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
  return sha256Hex(new Uint8Array(bytes));
}

export type Imported = { ok: true; trace: Trace } | { ok: false; message: string };

const fail = (message: string): Imported => ({ ok: false, message });

/**
 * Turns a chosen file into the plan's floor plan image: decodes it, scales it to at most 2048 px, stores it on the server as a content-addressed
 * resource (the same picture is stored once), and returns the `Trace` that places it to fit `view`. The plan is not touched here: on any failure
 * `ok` is false and `message` says why in plain words.
 */
export async function importTraceFile(file: File, view: Rect | null): Promise<Imported> {
  const checked = checkFile(file);
  if (!checked.ok) return fail(checked.message);
  let decoded: Decoded;
  try {
    decoded = await decode(file, checked.vector);
  } catch {
    return fail("This picture could not be opened. Try saving it as a PNG or JPG and choosing that.");
  }
  try {
    let stored: { blob: Blob; w: number; h: number } | null = null;
    for (const shrink of SHRINKS) {
      stored = await encode(decoded, checked.vector, Math.round(MAX_SIDE * shrink));
      if (!stored || stored.blob.size <= MAX_STORED_BYTES) break;
    }
    if (!stored) return fail("This picture could not be prepared. Try a smaller one.");
    if (stored.blob.size > MAX_STORED_BYTES) return fail("This picture is too big to keep even after making it smaller. Try another one.");
    const id = traceIdOf(await hashOf(await stored.blob.arrayBuffer()));
    const name = file.name.replace(/[\r\n]/g, " ").slice(0, 120) || "Floor plan image";
    await putResource({ id, kind: "image", mime: stored.blob.type, name, meta: { use: "trace", w: stored.w, h: stored.h } }, stored.blob);
    const placed: Trace = { resourceId: id, w: stored.w, h: stored.h, x: 0, y: 0, scale: 0.01, rotation: 0, opacity: 0.5, locked: false };
    return { ok: true, trace: fitToView(placed, view ?? FALLBACK_VIEW) };
  } catch (e) {
    if (e instanceof NetError) return fail("The server cannot be reached, so the picture was not saved. Your plan is unchanged.");
    if (e instanceof ApiError) return fail(`The server did not accept the picture: ${e.message} Your plan is unchanged.`);
    return fail("The picture could not be saved. Your plan is unchanged.");
  } finally {
    decoded.free();
  }
}

export type TracePixels = { data: Uint8ClampedArray; w: number; h: number };

/** The stored picture's pixels, for "look for walls". Null when the server no longer has it. The bitmap and canvas are released before returning. */
export async function readTracePixels(resourceId: string): Promise<TracePixels | null> {
  const file = await fetchResourceFile(resourceId);
  if (!file) return null;
  const bmp = await createImageBitmap(new Blob([file.buf], { type: file.mime }));
  try {
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [bmp.width, bmp.height];
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    [canvas.width, canvas.height] = [0, 0];
    return { data, w: width, h: height };
  } finally {
    bmp.close();
  }
}
