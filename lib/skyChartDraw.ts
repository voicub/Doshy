// The stars and constellation lines of the "Tonight's sky" chart as a handful of SVG path strings, not thousands of elements: stars are grouped by brightness and colour,
// each group is one path of zero-length round-capped strokes (a dot per star), so a chart with every naked-eye star is about twenty DOM nodes and redraws instantly even on
// a Raspberry Pi. Pure: the node test runner loads this file directly.
import { applyToRaDec, type Mat3 } from "./nightskyFrame.ts";
import type { StarCatalog } from "./stars.ts";

const RAD = 180 / Math.PI;

/** Brightness groups: a star of magnitude m is drawn with the width of the first group whose `to` is above m. Diameters are in chart units (the chart is 200 wide). */
const SIZES = [
  { to: 0.5, width: 4.4 },
  { to: 1.5, width: 3.4 },
  { to: 2.5, width: 2.6 },
  { to: 3.5, width: 2 },
  { to: 4.5, width: 1.5 },
  { to: 9, width: 1.1 },
] as const;
export type StarClass = "blue" | "white" | "warm";
const classOf = (bv: number): StarClass => (bv < 0.25 ? "blue" : bv < 0.85 ? "white" : "warm");

export type StarPath = { d: string; width: number; tone: StarClass };

type Xy = (alt: number, az: number) => { x: number; y: number };

/** Scene direction (x east, y up, z south, bearing 0) -> altitude and compass azimuth in degrees. */
const horizon = ([x, y, z]: [number, number, number]): { alt: number; az: number } => ({ alt: Math.asin(Math.max(-1, Math.min(1, y))) * RAD, az: ((Math.atan2(x, -z) * RAD) % 360 + 360) % 360 });

const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

/** The visible stars (above the horizon, brighter than `magLimit`) grouped into paths. `at` places an altitude and azimuth on the chart; `m` is `equatorialToScene(date, lat, lon, 0)`. */
export function starPaths(stars: StarCatalog, m: Mat3, at: Xy, magLimit: number): StarPath[] {
  const groups = new Map<string, { width: number; tone: StarClass; d: string[] }>();
  for (let i = 0; i < stars.count && stars.mag[i] <= magLimit; i++) {
    const { alt, az } = horizon(applyToRaDec(m, stars.ra[i], stars.dec[i]));
    if (alt < 0) continue;
    const size = SIZES.find((s) => stars.mag[i] < s.to) ?? SIZES[SIZES.length - 1];
    const tone = classOf(stars.bv[i]);
    const key = `${size.width}-${tone}`;
    const g = groups.get(key) ?? { width: size.width, tone, d: [] };
    groups.set(key, g);
    const p = at(alt, az);
    g.d.push(`M${fmt(p.x)} ${fmt(p.y)}h0`);
  }
  return [...groups.values()].map((g) => ({ d: g.d.join(""), width: g.width, tone: g.tone }));
}

/** The constellation lines above the horizon as one path (a line with an end below the horizon is cut at that end by the rim's clip, so it is kept whole). */
export function linesPath(stars: StarCatalog, m: Mat3, at: Xy): string {
  const where = (i: number) => horizon(applyToRaDec(m, stars.ra[i], stars.dec[i]));
  const out: string[] = [];
  for (const c of stars.constellations) {
    for (const [a, b] of c.lines) {
      const [pa, pb] = [where(a), where(b)];
      if (pa.alt < -2 && pb.alt < -2) continue;
      const [qa, qb] = [at(pa.alt, pa.az), at(pb.alt, pb.az)];
      out.push(`M${fmt(qa.x)} ${fmt(qa.y)}L${fmt(qb.x)} ${fmt(qb.y)}`);
    }
  }
  return out.join("");
}

/** Where each named constellation's label goes: the middle of its label point, only if that is above the horizon. */
export function constellationLabels(stars: StarCatalog, m: Mat3, at: Xy): { name: string; x: number; y: number }[] {
  return stars.constellations.flatMap((c) => {
    const { alt, az } = horizon(applyToRaDec(m, c.label.ra, c.label.dec));
    return alt > 4 ? [{ name: c.name, ...at(alt, az) }] : [];
  });
}

/** The named stars above the horizon, brightest first. */
export function starLabels(stars: StarCatalog, m: Mat3, at: Xy, max: number): { name: string; x: number; y: number }[] {
  const out: { name: string; x: number; y: number; mag: number }[] = [];
  for (const n of stars.names) {
    const { alt, az } = horizon(applyToRaDec(m, stars.ra[n.index], stars.dec[n.index]));
    if (alt > 4) out.push({ name: n.name, mag: stars.mag[n.index], ...at(alt, az) });
  }
  return out.sort((a, b) => a.mag - b.mag).slice(0, max);
}

export { horizon };
