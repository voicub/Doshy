// The star catalogue for the night sky: decodes lib/starData.ts (generated, see docs/night-sky-data.md) once into typed arrays. Pure: no React, no browser globals
// beyond `atob`, which Node and every browser have.
import { STAR_BV_B64, STAR_CONSTELLATIONS, STAR_COUNT, STAR_DEC_B64, STAR_MAG_B64, STAR_NAMES, STAR_RA_B64 } from "./starData.ts";

export type StarCatalog = {
  count: number;
  /** degrees, J2000 */
  ra: Float32Array;
  /** degrees, J2000 */
  dec: Float32Array;
  /** visual magnitude, smaller is brighter */
  mag: Float32Array;
  /** B-V colour index */
  bv: Float32Array;
  names: { index: number; name: string }[];
  constellations: { name: string; lines: [number, number][]; label: { ra: number; dec: number } }[];
};

/** The base64 text as a little-endian view: DataView, so the result does not depend on the machine's byte order. */
function view(b64: string): DataView {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new DataView(bytes.buffer);
}

function decode(): StarCatalog {
  const n = STAR_COUNT;
  const ra = new Float32Array(n);
  const dec = new Float32Array(n);
  const mag = new Float32Array(n);
  const bv = new Float32Array(n);
  const raV = view(STAR_RA_B64);
  const decV = view(STAR_DEC_B64);
  const magV = view(STAR_MAG_B64);
  const bvV = view(STAR_BV_B64);
  for (let i = 0; i < n; i++) {
    ra[i] = (raV.getUint16(i * 2, true) * 360) / 65536;
    dec[i] = (decV.getInt16(i * 2, true) * 90) / 32767;
    mag[i] = magV.getInt16(i * 2, true) / 100;
    bv[i] = bvV.getInt16(i * 2, true) / 100;
  }
  return {
    count: n,
    ra,
    dec,
    mag,
    bv,
    names: STAR_NAMES.map(([index, name]) => ({ index, name })),
    constellations: STAR_CONSTELLATIONS.map((c) => ({ name: c.name, lines: c.lines.map(([a, b]): [number, number] => [a, b]), label: { ...c.label } })),
  };
}

let cached: StarCatalog | undefined;

/** The catalogue, decoded on first use and shared after that (treat it as read-only). Sorted brightest first, so a prefix of the arrays is the brightest N stars. */
export function getStars(): StarCatalog {
  cached ??= decode();
  return cached;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A plausible star colour (r, g, b in 0..1) from the B-V index: blue-white (about -0.3) through white (0.6 is Sun-like, slightly warm) to orange-red (2.0).
 * Temperature from Ballesteros (2012), then Tanner Helland's black-body-to-sRGB fit. Stars look washed out to the eye, so this is meant to be mixed with white by the caller.
 */
export function bvToRgb(bv: number): [number, number, number] {
  const b = clamp(Number.isFinite(bv) ? bv : 0.65, -0.4, 2.0);
  const kelvin = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  const t = clamp(kelvin, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const bl = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(bl, 0, 255) / 255];
}
