// Colour maths for the HUD themes: WCAG contrast, blending, HSL, and a colour-vision-deficiency simulation. Pure (no DOM), so lib/themeContrast.test.ts can check every theme's token pairs in plain node.

export type Rgb = readonly [number, number, number];

const clampByte = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

/** "#rgb" / "#rrggbb" -> [r, g, b], or null when it is neither. */
export function parseHex(s: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** "90 215 255" (the space-separated channel tokens in app/theme-tokens.css) -> [90, 215, 255], or null. */
export function parseChannels(s: string): Rgb | null {
  const m = /^\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*$/.exec(s);
  if (!m) return null;
  const c = [Number(m[1]), Number(m[2]), Number(m[3])] as const;
  return c.every((n) => n <= 255) ? c : null;
}

export const toHex = ([r, g, b]: Rgb): string => "#" + [r, g, b].map((n) => clampByte(n).toString(16).padStart(2, "0")).join("");
export const toChannels = ([r, g, b]: Rgb): string => `${clampByte(r)} ${clampByte(g)} ${clampByte(b)}`;

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export const luminance = ([r, g, b]: Rgb): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast ratio, 1 .. 21, symmetric. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` drawn at `alpha` over an opaque `bg`. */
export const blend = (fg: Rgb, alpha: number, bg: Rgb): Rgb => [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as unknown as Rgb;

/** Hue 0..360, saturation and lightness 0..1 -> RGB. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [clampByte(f(0) * 255), clampByte(f(8) * 255), clampByte(f(4) * 255)];
}

/** The two inks an accent button can carry: near-black and white; the better of the two for `bg`. */
export function readableInk(bg: Rgb, dark: Rgb, light: Rgb): Rgb {
  return contrast(bg, dark) >= contrast(bg, light) ? dark : light;
}

// ---- colour-vision-deficiency simulation (Machado, Oliveira, Fernandes 2009, severity 1.0), applied in linear RGB ----

export type Deficiency = "protanopia" | "deuteranopia" | "tritanopia";

const MACHADO: Record<Deficiency, readonly [number, number, number, number, number, number, number, number, number]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const delin = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
};

/** How a person with the given colour-vision deficiency sees `c`. */
export function simulate(c: Rgb, kind: Deficiency): Rgb {
  const [r, g, b] = [lin(c[0]), lin(c[1]), lin(c[2])];
  const m = MACHADO[kind];
  return [delin(m[0] * r + m[1] * g + m[2] * b), delin(m[3] * r + m[4] * g + m[5] * b), delin(m[6] * r + m[7] * g + m[8] * b)];
}

/** CIE76 colour difference (Lab, D65). Around 10 is "noticeably different side by side", 25+ is "easy to tell apart at a glance". */
export function deltaE(a: Rgb, b: Rgb): number {
  const la = lab(a), lb = lab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

function lab(c: Rgb): readonly [number, number, number] {
  const [r, g, b] = [lin(c[0]), lin(c[1]), lin(c[2])];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
