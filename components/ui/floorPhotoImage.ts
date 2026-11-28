import { ApiError, NetError, putResource } from "@/lib/dbApi";
import { MAX_FLOOR_PHOTO_BYTES, floorPhotoIdOf, type FloorPhoto } from "@/lib/floorPhoto";
import type { Built, Pixels } from "@/lib/floorPhotoPixels";
import { MAX_SOURCE_BYTES, NOT_A_PICTURE_MESSAGE, PDF_MESSAGE, TOO_BIG_MESSAGE, fitSize } from "@/lib/traceUpload";
import { hashOf } from "../plan/traceImage";

// The browser's half of "use a photo of my floor": opening the chosen picture and storing the finished texture. The maths between the two is lib/floorPhotoPixels.ts.

/** The longest side the chosen photo is worked at: a close-up of a floor crops to 1024 px from a 2048 px picture, and a 12 MP phone photo never sits in memory whole. */
const WORK_SIDE = 2048;
const WEBP_QUALITY = 0.92;

/** The stored texture's address (the route answers with the stored type and an ETag). */
export const floorPhotoUrl = (resourceId: string) => `/api/db/resources/${encodeURIComponent(resourceId)}`;

export type Picture = { canvas: HTMLCanvasElement; w: number; h: number; free: () => void };

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = url;
  });

type Decoded = { source: CanvasImageSource; w: number; h: number; free: () => void };

/** The file as something a canvas can draw: an ImageBitmap (turned upright by its EXIF orientation), else an <img> for the formats only the page can draw. */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
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
    return { source: img, w: img.naturalWidth, h: img.naturalHeight, free: () => { img.src = ""; URL.revokeObjectURL(url); } };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Opens a chosen photo, scaled to at most 2048 px on its long side. Throws an Error whose message is plain words for the person. */
export async function openPicture(file: File): Promise<Picture> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) throw new Error(PDF_MESSAGE);
  if (file.size > MAX_SOURCE_BYTES) throw new Error(TOO_BIG_MESSAGE);
  if (file.type && !file.type.startsWith("image/")) throw new Error(NOT_A_PICTURE_MESSAGE);
  let d: Decoded;
  try {
    d = await decode(file);
  } catch {
    throw new Error("This picture could not be opened. Try a JPG or PNG.");
  }
  try {
    const { w, h } = fitSize(d.w, d.h, WORK_SIDE);
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [w, h];
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("This picture could not be prepared. Try a smaller one.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(d.source, 0, 0, w, h);
    return { canvas, w, h, free: () => { [canvas.width, canvas.height] = [0, 0]; } };
  } finally {
    d.free();
  }
}

/** All the picture's pixels (for the crop). */
export function pixelsOf(p: Picture): Pixels {
  const ctx = p.canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This picture could not be read.");
  const { data, width, height } = ctx.getImageData(0, 0, p.w, p.h);
  return { data, w: width, h: height };
}

/** Pixels drawn onto a new canvas (the preview and the stored file are made from it). The caller empties it when done. */
export function canvasOf(p: Pixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [p.w, p.h];
  canvas.getContext("2d")?.putImageData(new ImageData(p.data, p.w, p.h), 0, 0);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export type Kept = { ok: true; photo: FloorPhoto } | { ok: false; message: string };

/**
 * Stores a finished texture on the server as a content-addressed resource (the same texture is stored once; a plan copy or file import finds it again) and returns the
 * floor photo that points at it. WebP where the browser can encode it, else PNG (the browser says which by the blob's type). The plan is not touched here.
 */
export async function keepTexture(built: Built, scaleM: number): Promise<Kept> {
  const canvas = canvasOf(built.pixels);
  try {
    const blob = await toBlob(canvas, "image/webp", WEBP_QUALITY);
    if (!blob || (blob.type !== "image/webp" && blob.type !== "image/png")) return { ok: false, message: "The floor picture could not be prepared. Try a different photo." };
    if (blob.size > MAX_FLOOR_PHOTO_BYTES) return { ok: false, message: "The floor picture is too big to keep. Try a smaller patch." };
    const resourceId = floorPhotoIdOf(await hashOf(await blob.arrayBuffer()));
    await putResource({ id: resourceId, kind: "floor-photo", mime: blob.type, name: "Floor photo", meta: { use: "floor-photo", size: built.pixels.w } }, blob);
    return { ok: true, photo: { resourceId, scaleM, rotation: 0, avg: built.avg } };
  } catch (e) {
    if (e instanceof NetError) return { ok: false, message: "The server cannot be reached, so the photo was not saved. Your plan is unchanged." };
    if (e instanceof ApiError) return { ok: false, message: `The server did not accept the photo: ${e.message} Your plan is unchanged.` };
    return { ok: false, message: "The photo could not be saved. Your plan is unchanged." };
  } finally {
    [canvas.width, canvas.height] = [0, 0];
  }
}
