// OpenStreetMap buildings + Overture Maps buildings -> the one list the scene draws (docs/site-data.md). "Both" keeps every OpenStreetMap footprint, takes the
// heights and roofs from Overture where OpenStreetMap only has a guess and Overture has a real value, and adds the Overture buildings OpenStreetMap lacks.
// Footprints are matched by how much they overlap (sampled on a grid: buildings are not convex, and a polygon-clipping library is not worth it for this).
// Pure; runs in the browser. The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { pointInShape, polygonArea, polygonBounds, type Rect } from "./siteGeom.ts";
import { MAX_BUILDINGS } from "./siteOsm.ts";
import { MAX_OVERTURE_BUILDINGS } from "./siteOverture.ts";
import type { SiteBuilding } from "./siteTypes.ts";

export type BuildingChoice = "osm" | "overture" | "both";

/** Overlap (square metres) of two footprints, estimated on a grid over their common bounding box: about 144 samples, never finer than 0.75 m. */
export function overlapArea(a: SiteBuilding, b: SiteBuilding, boxA = polygonBounds(a.ring), boxB = polygonBounds(b.ring)): number {
  const x0 = Math.max(boxA.x0, boxB.x0);
  const y0 = Math.max(boxA.y0, boxB.y0);
  const x1 = Math.min(boxA.x1, boxB.x1);
  const y1 = Math.min(boxA.y1, boxB.y1);
  if (x1 <= x0 || y1 <= y0) return 0;
  const cell = Math.max(0.75, Math.sqrt(((x1 - x0) * (y1 - y0)) / 144));
  let hits = 0;
  for (let y = y0 + cell / 2; y < y1; y += cell) for (let x = x0 + cell / 2; x < x1; x += cell) if (pointInShape([x, y], a.ring, a.holes) && pointInShape([x, y], b.ring, b.holes)) hits++;
  return hits * cell * cell;
}

const footprint = (b: SiteBuilding): number => Math.max(1, polygonArea(b.ring) - (b.holes ?? []).reduce((s, h) => s + polygonArea(h), 0));

/** The same building in two sources: they overlap for at least 40 % of their union, or one lies (mostly) inside the other (OpenStreetMap splits terraces, Overture often does not). */
export const IOU_MATCH = 0.4;
export const INSIDE_MATCH = 0.7;

export type Overlap = { inter: number; iou: number; /** share of `a` that lies under `b`, and of `b` under `a` */ ofA: number; ofB: number };

export function overlapOf(a: SiteBuilding, b: SiteBuilding, boxA?: Rect, boxB?: Rect): Overlap {
  const inter = overlapArea(a, b, boxA, boxB);
  const [fa, fb] = [footprint(a), footprint(b)];
  return { inter, iou: Math.min(1, inter / (fa + fb - inter)), ofA: Math.min(1, inter / fa), ofB: Math.min(1, inter / fb) };
}

export const isMatch = (o: Overlap): boolean => o.inter > 0 && (o.iou >= IOU_MATCH || Math.max(o.ofA, o.ofB) >= INSIDE_MATCH);

export const sameBuilding = (a: SiteBuilding, b: SiteBuilding, boxA?: Rect, boxB?: Rect): boolean => isMatch(overlapOf(a, b, boxA, boxB));

/** A grid of 25 m cells over bounding boxes, so a footprint is only compared with the few that are near it. */
function boxIndex(list: readonly SiteBuilding[]) {
  const CELL = 25;
  const boxes = list.map((b) => polygonBounds(b.ring));
  const cells = new Map<string, number[]>();
  const cover = (r: Rect, visit: (key: string) => void) => {
    for (let cx = Math.floor(r.x0 / CELL); cx <= Math.floor(r.x1 / CELL); cx++) for (let cy = Math.floor(r.y0 / CELL); cy <= Math.floor(r.y1 / CELL); cy++) visit(`${cx},${cy}`);
  };
  boxes.forEach((r, i) =>
    cover(r, (key) => {
      const list = cells.get(key);
      if (list) list.push(i);
      else cells.set(key, [i]);
    }),
  );
  return {
    boxes,
    near(r: Rect): number[] {
      const out = new Set<number>();
      cover(r, (key) => {
        for (const i of cells.get(key) ?? []) if (boxes[i].x0 <= r.x1 && boxes[i].x1 >= r.x0 && boxes[i].y0 <= r.y1 && boxes[i].y1 >= r.y0) out.add(i);
      });
      return [...out];
    },
  };
}

export type MergeStats = {
  /** buildings in the result, and how many of them have a height from the data rather than a guess */
  total: number;
  withHeight: number;
  /** the same counts for OpenStreetMap alone, before the merge */
  osmTotal: number;
  osmWithHeight: number;
  /** Overture buildings that matched an OpenStreetMap one / were added / gave their height to one that had only a guess */
  matched: number;
  added: number;
  heightsGained: number;
};

/** `real`-height count of a list. */
export const withHeight = (list: readonly SiteBuilding[]): number => list.filter((b) => b.real).length;

/**
 * The buildings to draw. "osm": as given. "overture": Overture's alone. "both": every OpenStreetMap footprint is kept, except that
 *  - where OpenStreetMap only guessed the height and exactly one Overture building covers it with a real height, it takes that height and roof;
 *  - where OpenStreetMap only guessed and several Overture buildings cover it (Overture splits terraces finer), they replace it;
 *  - Overture buildings that overlap no OpenStreetMap footprint are added.
 * A footprint OpenStreetMap has a real height for is never changed (colours are filled in from Overture when it has none). Nearest first, at most MAX_OVERTURE_BUILDINGS.
 */
export function mergeBuildings(osm: readonly SiteBuilding[], overture: readonly SiteBuilding[], choice: BuildingChoice): { buildings: SiteBuilding[]; stats: MergeStats } {
  const base = { osmTotal: osm.length, osmWithHeight: withHeight(osm) };
  if (choice === "osm") return { buildings: [...osm], stats: { ...base, total: osm.length, withHeight: base.osmWithHeight, matched: 0, added: 0, heightsGained: 0 } };
  if (choice === "overture") return { buildings: [...overture], stats: { ...base, total: overture.length, withHeight: withHeight(overture), matched: overture.length, added: 0, heightsGained: 0 } };

  const index = boxIndex(osm);
  const coversOsm: { ov: SiteBuilding; o: Overlap }[][] = osm.map(() => []);
  const unmatched: SiteBuilding[] = [];
  let matched = 0;
  for (const ov of overture) {
    const box = polygonBounds(ov.ring);
    let any = false;
    for (const i of index.near(box)) {
      const o = overlapOf(osm[i], ov, index.boxes[i], box);
      if (!isMatch(o)) continue;
      coversOsm[i].push({ ov, o });
      any = true;
    }
    if (any) matched++;
    else unmatched.push(ov);
  }
  const result: SiteBuilding[] = [];
  const taken = new Set<SiteBuilding>();
  let gained = 0;
  osm.forEach((b, i) => {
    const cover = coversOsm[i];
    const best = cover.reduce<(typeof cover)[number] | undefined>((m, c) => (!m || c.o.iou > m.o.iou ? c : m), undefined);
    const hasReal = cover.some((c) => c.ov.real === true);
    if (b.real || !hasReal || !best) {
      result.push(best ? withColours(b, best.ov) : b);
    } else if (cover.length === 1 && best.o.iou >= IOU_MATCH) {
      const o = best.ov;
      result.push({ ...withColours(b, o), height: o.height, minHeight: o.minHeight, roof: o.roof, roofHeight: o.roofHeight, real: true });
      gained++;
    } else if (cover.reduce((s, c) => s + c.o.inter, 0) >= REPLACE_COVERAGE * footprint(b)) {
      for (const { ov } of cover) if (!taken.has(ov)) result.push(ov);
      for (const { ov } of cover) taken.add(ov);
      gained++;
    } else result.push(b);
  });
  const buildings = [...result, ...unmatched].sort((a, b) => nearness(a) - nearness(b)).slice(0, Math.max(MAX_BUILDINGS, MAX_OVERTURE_BUILDINGS));
  return { buildings, stats: { ...base, total: buildings.length, withHeight: withHeight(buildings), matched, added: unmatched.length, heightsGained: gained } };
}

/** Several Overture buildings replace an OpenStreetMap one only when together they cover this share of it. */
const REPLACE_COVERAGE = 0.6;

/** The building with the source's colours where it has none of its own. */
function withColours(b: SiteBuilding, from: SiteBuilding): SiteBuilding {
  const wall = !b.wallColor && from.wallColor;
  const roof = !b.roofColor && from.roofColor;
  return wall || roof ? { ...b, ...(wall ? { wallColor: from.wallColor } : {}), ...(roof ? { roofColor: from.roofColor } : {}) } : b;
}

function nearness(b: SiteBuilding): number {
  const r = polygonBounds(b.ring);
  return ((r.x0 + r.x1) / 2) ** 2 + ((r.y0 + r.y1) / 2) ** 2;
}
