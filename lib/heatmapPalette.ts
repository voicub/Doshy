// Colour ramps of the heat map as plain stop tables (pure: the scene uploads them as a shader uniform, the legend draws them as a CSS gradient).

export const PALETTES = ["viridis", "turbo", "diverging"] as const;
export type PaletteName = (typeof PALETTES)[number];

/** Plain-English names for the picker. */
export const PALETTE_LABEL: Record<PaletteName, string> = { viridis: "Colour-blind safe", turbo: "Rainbow", diverging: "Blue to red" };

/** Nine evenly spaced stops each: viridis (perceptually even, readable with every kind of colour blindness), a turbo-like rainbow, ColorBrewer's blue-white-red. */
const HEX: Record<PaletteName, readonly string[]> = {
  viridis: ["#440154", "#472d7b", "#3b528b", "#2c728e", "#21908c", "#27ad81", "#5dc863", "#aadc32", "#fde725"],
  turbo: ["#30123b", "#4662d7", "#36aaf9", "#1ae4b6", "#72fe5e", "#c7ef34", "#faba39", "#f66b19", "#ca2a04"],
  diverging: ["#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b"],
};

export type Rgb = [number, number, number];

const parse = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** The stops as 0-255 sRGB triples. */
export const paletteStops = (name: PaletteName): Rgb[] => HEX[name].map(parse);

/** The colour at position `t` (0 = low end, 1 = high end; clamped), linearly blended between the stops, as whole 0-255 numbers. */
export function paletteColor(name: PaletteName, t: number): Rgb {
  const stops = HEX[name];
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const a = parse(stops[i]);
  const b = parse(stops[i + 1]);
  const f = x - i;
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as Rgb;
}

/** A CSS left-to-right gradient of the palette, for the legend bar. */
export const paletteGradient = (name: PaletteName): string => `linear-gradient(to right, ${HEX[name].join(", ")})`;
