import type { HAState } from "./ha";

export type RGB = [number, number, number];

export const isOn = (st?: HAState) => st?.state === "on" || st?.state === "playing";

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const c255 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** Tanner Helland approximation: colour temperature (K) to RGB. */
function kelvinToRgb(kelvin: number): RGB {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [c255(r), c255(g), c255(b)];
}

/** Resolve what an entity's light looks like: HA colour if it reports one, else `fallbackHex`. */
export function lightInfo(st: HAState | undefined, fallbackHex: string): { on: boolean; level: number; rgb: RGB } {
  const on = isOn(st);
  const a = st?.attributes;
  const rgb = a?.rgb_color ?? (a?.color_temp_kelvin ? kelvinToRgb(a.color_temp_kelvin) : hexToRgb(fallbackHex));
  const level = on ? (a?.brightness != null ? Math.max(0.15, a.brightness / 255) : 1) : 0;
  return { on, level, rgb };
}

export const rgbCss = ([r, g, b]: RGB, alpha = 1) => `rgba(${r},${g},${b},${alpha})`;
