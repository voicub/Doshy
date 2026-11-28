// Pure: file names and the caption of a picture. The node test runner loads this file directly.

const MAX_SLUG = 40;

/** A plan's name as a file-name part: lower-case letters and digits joined by single dashes, accents dropped, no path characters, at most 40 characters; "plan" when nothing is left. */
export function slug(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  return s || "plan";
}

const two = (n: number): string => String(n).padStart(2, "0");
/** The date in the device's own time zone, `2026-11-26` (the caller passes the date: nothing here reads the clock). */
const dayOf = (d: Date): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** `doshy-<plan>-<date>-<detail>.<ext>`: detail is the pixel size of a picture (`2880x1800`) or the length of a video (`10s`). */
export function fileName(plan: string, date: Date, detail: string, ext: string): string {
  return `doshy-${slug(plan)}-${dayOf(date)}-${slug(detail)}.${ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"}`;
}

/** What the caption says when the owner has not typed anything. */
export const defaultCaption = (plan: string): string => `Doshy: ${plan.trim() || "my home"}`;

export type CaptionBox = {
  /** Font size in pixels of the picture. */
  font: number;
  /** The tinted plate behind the text. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the text starts (left edge) and its baseline. */
  textX: number;
  textY: number;
};

const FONT_SHARE = 0.022; // of the shorter side: small, a signature and not a headline
const MIN_FONT = 11;
const MAX_FONT = 96;
const MARGIN_EM = 1; // gap to the picture's edge, in font sizes
const PAD_EM = 0.55; // plate padding
const MIN_SHRINK_FONT = 6;

/**
 * Where to draw a caption in the lower left corner of a `width` x `height` picture. `measure(font)` is the text's width in pixels at that font size (a 2D canvas measures it).
 * The type scales with the picture (the same look at 1x and 4x) and shrinks until a long caption fits inside the margins; the plate always lies inside the picture.
 */
export function captionLayout(width: number, height: number, measure: (fontPx: number) => number): CaptionBox {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  let font = Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(Math.min(w, h) * FONT_SHARE)));
  const room = (f: number) => w - 2 * f * MARGIN_EM - 2 * f * PAD_EM;
  const text = measure(font);
  if (text > room(font)) font = Math.max(MIN_SHRINK_FONT, Math.floor((font * Math.max(room(font), 1)) / text));
  const margin = font * MARGIN_EM;
  const pad = font * PAD_EM;
  const textW = Math.min(measure(font), Math.max(1, w - 2 * margin - 2 * pad));
  const plateW = textW + 2 * pad;
  const plateH = font + 2 * pad;
  const x = Math.max(0, Math.min(margin, w - plateW));
  const y = Math.max(0, h - margin - plateH);
  return { font, x, y, w: plateW, h: plateH, textX: x + pad, textY: y + pad + font * 0.82 };
}
