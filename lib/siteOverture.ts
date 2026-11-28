// Overture Maps buildings (docs/site-data.md) as the Surroundings' `SiteBuilding`s: which z14 vector tiles cover a site, and how a decoded `building` /
// `building_part` feature (height, num_floors, roof_shape, roof_height, facade_color, has_parts, class ...) becomes a building. Pure: the server reads the tiles.
// The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { latLonToSite, tileCorner, tileOf, type LatLon } from "./geo.ts";
import type { MvtFeature, MvtLayer, MvtValue, Ring } from "./mvt.ts";
import { dedupeRing, polygonArea, polygonBounds } from "./siteGeom.ts";
import { LEVEL, buildingShape, cssColor, r2 } from "./siteOsm.ts";
import type { RoofShape, SiteBuilding, XY } from "./siteTypes.ts";

/** The deepest level of Overture's building tiles: full detail, about 0.4 m per coordinate step. */
export const OVERTURE_ZOOM = 14;
/** The most tiles one site may ask for (a 1.2 km square touches at most 3 x 3 at mid latitudes; near the poles the tiles shrink). */
export const MAX_OVERTURE_TILES = 16;
/** The most buildings handed to the scene (nearest first); the OpenStreetMap side is capped at 1500. */
export const MAX_OVERTURE_BUILDINGS = 2500;
/** Footprints under this many square metres are bins and pillars, not buildings the scene should draw. */
const MIN_AREA = 6;

export type TileId = { z: number; x: number; y: number };

/** The z14 tiles that hold every building within `radius` metres (a square) of `center`, or undefined when that is too many. */
export function overtureTiles(center: LatLon, radius: number, z = OVERTURE_ZOOM): TileId[] | undefined {
  const nw = tileOf(center.lat + radius / 111_000, center.lon - radius / (111_000 * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180))), z);
  const se = tileOf(center.lat - radius / 111_000, center.lon + radius / (111_000 * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180))), z);
  if ((se.x - nw.x + 1) * (se.y - nw.y + 1) > MAX_OVERTURE_TILES) return undefined;
  const out: TileId[] = [];
  for (let y = nw.y; y <= se.y; y++) for (let x = nw.x; x <= se.x; x++) out.push({ z, x, y });
  return out;
}

const ROOFS: Record<string, RoofShape> = {
  flat: "flat", gabled: "gabled", gambrel: "gabled", saltbox: "gabled", hipped: "hipped", half_hipped: "hipped", mansard: "hipped", pyramidal: "pyramidal", skillion: "skillion", dome: "dome", onion: "dome", round: "dome",
};

const metres = (v: MvtValue | undefined, max: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : undefined);
const text = (v: MvtValue | undefined): string | undefined => (typeof v === "string" ? v : undefined);

/** One polygon (outer ring in tile units, then holes) as site metres about `center`. */
function toSite(tile: TileId, extent: number, center: LatLon, ring: Ring): XY[] {
  const out: XY[] = [];
  for (const [px, py] of ring) {
    const c = tileCorner(tile.z, tile.x + px / extent, tile.y + py / extent);
    const [x, y] = latLonToSite(center, c.lat, c.lon);
    out.push([r2(x), r2(y)]);
  }
  return dedupeRing(out);
}

/** The id the feature carries (Overture's own UUID, else the tile's number), as a short safe string. */
const idOf = (f: MvtFeature): string => {
  const s = typeof f.props.id === "string" && /^[0-9a-f-]{8,40}$/.test(f.props.id) ? f.props.id : String(f.id ?? "x");
  return s.slice(0, 40);
};

/**
 * The buildings of one feature (a multipolygon gives one per polygon), or none when it is underground, too small or has no usable outline. Heights follow the
 * OpenStreetMap rules (`buildingShape`): `height` is to the ridge, else `num_floors` x 3 m, else a guess by kind, and `real` says which. `part` marks a
 * `building_part`.
 */
export function buildingsOfFeature(f: MvtFeature, tile: TileId, extent: number, center: LatLon, part: boolean): SiteBuilding[] {
  if (f.props.is_underground === true) return [];
  const kindRaw = text(f.props.class) ?? text(f.props.subtype);
  const kind = kindRaw && /^[a-z_]{1,32}$/.test(kindRaw) ? kindRaw : "yes";
  const out: SiteBuilding[] = [];
  f.polygons.forEach((poly, n) => {
    const ring = toSite(tile, extent, center, poly[0]);
    const holes = poly.slice(1).map((h) => toSite(tile, extent, center, h)).filter((h) => h.length >= 3);
    const area = polygonArea(ring) - holes.reduce((a, h) => a + polygonArea(h), 0);
    if (ring.length < 3 || area < MIN_AREA) return;
    const floors = metres(f.props.num_floors, 200);
    const minFloor = metres(f.props.min_floor, 100);
    const { real, ...shape } = buildingShape({
      kind,
      ring,
      area,
      roof: ROOFS[text(f.props.roof_shape) ?? ""],
      roofHeight: metres(f.props.roof_height, 60),
      total: metres(f.props.height, 500),
      levels: floors,
      lift: metres(f.props.min_height, 500) ?? (minFloor ?? 0) * LEVEL,
    });
    const b: SiteBuilding = { id: `ov${part ? "p" : ""}-${idOf(f)}${f.polygons.length > 1 ? `-${n}` : ""}`, ring, ...shape, kind, from: "overture" };
    if (real) b.real = true;
    if (holes.length) b.holes = holes;
    const roofColor = cssColor(text(f.props.roof_color));
    const wallColor = cssColor(text(f.props.facade_color));
    if (roofColor) b.roofColor = roofColor;
    if (wallColor) b.wallColor = wallColor;
    out.push(b);
  });
  return out;
}

/** What one decoded tile holds: its buildings (with Overture's id and whether it says it has parts) and its building parts by the id of the building they belong to. */
export type TileBuildings = {
  entries: { key: string; hasParts: boolean; buildings: SiteBuilding[] }[];
  parts: Map<string, SiteBuilding[]>;
};

/** The buildings of one decoded tile: the `building` layer and the `building_part` layer. */
export function buildingsOfTile(layers: readonly MvtLayer[], tile: TileId, center: LatLon): TileBuildings {
  const entries: TileBuildings["entries"] = [];
  const parts = new Map<string, SiteBuilding[]>();
  for (const layer of layers) {
    if (layer.name === "building") {
      for (const f of layer.features) {
        const buildings = buildingsOfFeature(f, tile, layer.extent, center, false);
        if (buildings.length) entries.push({ key: text(f.props.id) ?? "", hasParts: f.props.has_parts === true, buildings });
      }
    } else if (layer.name === "building_part") {
      for (const f of layer.features) {
        const parent = text(f.props.building_id);
        if (!parent) continue;
        const made = buildingsOfFeature(f, tile, layer.extent, center, true);
        if (made.length) parts.set(parent, [...(parts.get(parent) ?? []), ...made]);
      }
    }
  }
  return { entries, parts };
}

/** At least this share of a building's footprint under its parts, and the parts replace it (a tower on a podium keeps its podium). */
const PARTS_REPLACE = 0.7;

/**
 * Buildings of every tile of a site, ready for the scene: a building with parts is drawn by its parts when they cover most of it, outlines kept in the radius's
 * square (nearest first, at most MAX_OVERTURE_BUILDINGS), ids made unique (a building cut by a tile edge arrives as one piece per tile).
 */
export function assembleBuildings(tiles: readonly TileBuildings[], radius: number): SiteBuilding[] {
  const partsOf = new Map<string, SiteBuilding[]>();
  for (const t of tiles) for (const [k, v] of t.parts) partsOf.set(k, [...(partsOf.get(k) ?? []), ...v]);
  const picked: SiteBuilding[] = [];
  const partsDone = new Set<string>();
  for (const t of tiles) {
    for (const { key, hasParts, buildings } of t.entries) {
      const parts = hasParts ? partsOf.get(key) : undefined;
      if (!parts) {
        picked.push(...buildings);
        continue;
      }
      const covered = parts.reduce((a, p) => a + polygonArea(p.ring), 0) / Math.max(1, buildings.reduce((a, b) => a + polygonArea(b.ring), 0));
      if (!partsDone.has(key)) picked.push(...parts);
      partsDone.add(key);
      if (covered < PARTS_REPLACE) picked.push(...buildings);
    }
  }
  const seen = new Map<string, number>();
  return picked
    .filter((b) => {
      const r = polygonBounds(b.ring);
      return r.x1 >= -radius && r.x0 <= radius && r.y1 >= -radius && r.y0 <= radius;
    })
    .map((b) => {
      const n = seen.get(b.id) ?? 0;
      seen.set(b.id, n + 1);
      return n ? { ...b, id: `${b.id}~${n}` } : b;
    })
    .sort((a, b) => nearness(a) - nearness(b))
    .slice(0, MAX_OVERTURE_BUILDINGS);
}

/** Squared distance of the outline's bounding box centre from the site centre: only for ordering. */
function nearness(b: SiteBuilding): number {
  const r = polygonBounds(b.ring);
  return ((r.x0 + r.x1) / 2) ** 2 + ((r.y0 + r.y1) / 2) ** 2;
}
