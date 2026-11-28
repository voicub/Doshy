import { CATALOG } from "./catalog.ts";
import { distinctPoints, stationsAlong, type Station } from "./lineGeometry.ts";
import type { LightKind } from "./lineKinds.ts";
import type { Item, Plan, Pt } from "./types.ts";
import { placedHeight } from "./voids.ts";

// Lamps placed along a drawn line (the "Lights" family of the Garden lines tool). Pure: the tool passes the plan in and gets the plan back.

/** Each lit lamp is a real glow and point light in the scene, so one line may not flood the plan (or the Pi) with them. */
export const MAX_LAMPS = 200;
const MIN_GAP = 0.05; // m: stations closer than this are one lamp (a double click leaves two points on top of each other)

type Spacing = Pick<LightKind, "spacing" | "span">;
export type LampSpot = { x: number; y: number; angle: number };

const mm = (v: number) => Math.round(v * 1000) / 1000;
const DEG = 180 / Math.PI;
/** Degrees clockwise in plan view, 0..360 (plan y points down, so atan2(dy, dx) already turns clockwise on screen). */
const degrees = (rad: number) => ((rad * DEG) % 360 + 360) % 360;

/**
 * Where the lamps land. Standing kinds: one on every station. `span` kinds (a string of lights between two posts): one per pair of consecutive stations, at the
 * chord's midpoint and turned along the chord. The item keeps its own size, so a gap that is a little off the item's length only leaves the posts slightly
 * off the line's stations; the kind pins `spacing` to the item's post distance to keep that small.
 */
function spots(points: Pt[], kind: Spacing): LampSpot[] {
  const stations: Station[] = [];
  for (const s of stationsAlong(distinctPoints(points), kind.spacing)) {
    const last = stations[stations.length - 1];
    if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= MIN_GAP) stations.push(s);
  }
  if (!kind.span) return stations.slice(0, MAX_LAMPS).map(({ x, y, angle }) => ({ x, y, angle }));
  const out: LampSpot[] = [];
  for (let i = 1; i < stations.length && out.length < MAX_LAMPS; i++) {
    const [a, b] = [stations[i - 1], stations[i]];
    out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: Math.atan2(b.y - a.y, b.x - a.x) });
  }
  return out;
}

/** Where lamps (or the centres of string spans) will land, for the ghost drawn while the line is being drawn. Angle in radians as in lib/lineGeometry.ts. */
export const lampPreview = (points: Pt[], kind: Spacing): LampSpot[] => spots(points, kind);

/**
 * The plan with lamps added along the line. A lamp's arm or head points along its local +z, which at rot = the line's direction is the line's right-hand side;
 * `face` -1 turns it round to the left. Kinds without a `faces` side are symmetric, so they just follow the line. The same plan comes back for a line with fewer
 * than two distinct points or a kind that is not in the catalog.
 */
export function addLampsAlong(
  plan: Plan,
  points: Pt[],
  kind: Pick<LightKind, "item" | "spacing" | "span" | "faces">,
  opts: { level: string; face: 1 | -1; entity?: string; newId: () => string },
): Plan {
  const def = CATALOG[kind.item];
  if (!def) return plan;
  const placed = spots(points, kind);
  if (!placed.length) return plan;
  const h = placedHeight(plan, opts.level, kind.item);
  const turn = kind.faces && !kind.span && opts.face === -1 ? 180 : 0;
  const items: Item[] = placed.map((s) => ({
    id: opts.newId(),
    kind: kind.item,
    x: mm(s.x),
    y: mm(s.y),
    rot: mm(degrees(s.angle + turn / DEG)),
    w: def.w,
    d: def.d,
    h,
    level: opts.level,
    ...(opts.entity ? { entity: opts.entity } : {}),
  }));
  return { ...plan, items: [...plan.items, ...items] };
}
