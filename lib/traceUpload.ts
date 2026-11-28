// Choosing the picture for the trace image: what is accepted, how big it gets, what it is called when stored. Pure: the browser does the decoding and the upload.

/** The longest side of the stored picture, in pixels (a bigger photo is scaled down; the server limit is 25 MB, a line drawing at this size is well under 1). */
export const MAX_SIDE = 2048;
/** A source file bigger than this is refused up front, before the browser tries to decode it. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
/** The stored picture is made smaller (shorter side) until it is under this, far below the server's 25 MB. */
export const MAX_STORED_BYTES = 8 * 1024 * 1024;

export const PDF_MESSAGE = "PDF files cannot be opened here. Export the page as a PNG or JPG (any PDF viewer can do it) and choose that picture.";
export const TOO_BIG_MESSAGE = "That file is too big (over 40 MB). Choose a smaller picture, or export the plan again at a lower resolution.";
export const NOT_A_PICTURE_MESSAGE = "That does not look like a picture. Choose a PNG, JPG, WebP, GIF or SVG file.";

const PICTURE_EXT = /\.(png|jpe?g|webp|gif|svg|avif|bmp|heic|heif)$/i;

export type FileCheck = { ok: true; vector: boolean } | { ok: false; message: string };

/** Whether a chosen file can be tried, and if not, what to tell the person. `vector`: an SVG, which is drawn at the full size rather than only ever made smaller. */
export function checkFile(f: { name: string; type: string; size: number }): FileCheck {
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return { ok: false, message: PDF_MESSAGE };
  if (f.size > MAX_SOURCE_BYTES) return { ok: false, message: TOO_BIG_MESSAGE };
  if (!f.type.startsWith("image/") && !PICTURE_EXT.test(f.name)) return { ok: false, message: NOT_A_PICTURE_MESSAGE };
  return { ok: true, vector: f.type === "image/svg+xml" || /\.svg$/i.test(f.name) };
}

/** The size to draw a w x h picture at so its longest side is `max`. A raster picture is only made smaller; a vector one (`grow`) is drawn at `max`. At least 1 px each way. */
export function fitSize(w: number, h: number, max: number, grow = false): { w: number; h: number } {
  const k = Math.max(w, h) > max || grow ? max / Math.max(w, h) : 1;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** The resource id of a stored picture: "trace-" and the first 24 hex digits of the SHA-256 of its bytes, so the same picture is stored once. Matches the server's id rule. */
export const traceIdOf = (sha256Hex: string): string => `trace-${sha256Hex.slice(0, 24)}`;
