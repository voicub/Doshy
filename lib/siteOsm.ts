// OpenStreetMap (Overpass) -> the Site's buildings, trees, areas and roads. Pure: no network here (the route fetches), no DOM.
// The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { isRecord } from "./guards.ts";
import { latLonToSite, metresPerDegree, type LatLon } from "./geo.ts";
import { dedupeRing, polygonArea, polygonCentroid, polygonOverlapsRect, polylineOverlapsRect, pointInPolygon, ringSpan, type Rect } from "./siteGeom.ts";
import type { AreaKind, RoadKind, RoofShape, SiteArea, SiteBuilding, SiteData, SiteRoad, SiteTree, XY } from "./siteTypes.ts";
import type { Species } from "./vegetation.ts";

export const OSM_ATTRIBUTION = "\u00a9 OpenStreetMap contributors (ODbL)";
export const MAX_BUILDINGS = 1500;
export const MAX_TREES = 3000;
const MAX_AREAS = 1500;
const MAX_ROADS = 3000;
const MAX_RING_POINTS = 1500;
const TREE_ROW_SPACING = 7;

const HIGHWAYS = "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road|service|pedestrian|track|footway|path|cycleway|steps";
const LANDUSE = "forest|grass|meadow|farmland|residential|retail|commercial|industrial|cemetery|village_green|recreation_ground|reservoir|basin";
const NATURAL = "wood|scrub|water|grassland|sand|beach|bare_rock|scree";
const LEISURE = "park|garden|pitch|playground";

/**
 * The Overpass QL for everything within `radius` metres (a square box around the point). `out geom` returns every way's points, so nothing is looked up twice.
 * Barriers (hedges, fences, walls) are not asked for: the site has nowhere to draw lines of them.
 */
export function overpassQuery(lat: number, lon: number, radius: number): string {
  const m = metresPerDegree(lat);
  const dLat = radius / m.lat;
  const dLon = radius / m.lon;
  const box = `(${(lat - dLat).toFixed(6)},${(lon - dLon).toFixed(6)},${(lat + dLat).toFixed(6)},${(lon + dLon).toFixed(6)})`;
  const both = (filter: string) => `way${filter}${box};relation${filter}["type"="multipolygon"]${box};`;
  return (
    `[out:json][timeout:55][maxsize:134217728];(` +
    `way["building"]["building"!="no"]${box};relation["building"]["building"!="no"]["type"="multipolygon"]${box};` +
    `node["natural"="tree"]${box};way["natural"="tree_row"]${box};` +
    both(`["natural"~"^(${NATURAL})$"]`) +
    both(`["landuse"~"^(${LANDUSE})$"]`) +
    both(`["leisure"~"^(${LEISURE})$"]`) +
    both(`["amenity"="parking"]`) +
    `way["waterway"~"^(river|stream|canal)$"]${box};` +
    `way["highway"~"^(${HIGHWAYS})$"]${box};` +
    `way["railway"="rail"]${box};` +
    `);out geom;`
  );
}

// ---- reading tags -------------------------------------------------------------------------------------------------------------------

type LL = { lat: number; lon: number };
type Tags = Record<string, string>;
type Member = { type?: string; role?: string; geometry?: unknown };
type Element = { type?: string; id?: number; lat?: number; lon?: number; tags?: Tags; geometry?: unknown; members?: unknown };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** "12", "12.5 m", "12,5": metres, or undefined for anything else (feet, ranges, text). */
export function parseMetres(v: string | undefined, max = 500): number | undefined {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:m|meters?|metres?)?\s*$/i.exec(v ?? "");
  const n = m ? Number(m[1].replace(",", ".")) : NaN;
  return n > 0 && n <= max ? n : undefined;
}

const CSS_NAMES: Record<string, true> = Object.fromEntries(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral " +
    "cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange " +
    "darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey " +
    "dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred " +
    "indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey " +
    "lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon " +
    "mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue " +
    "mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred " +
    "papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna " +
    "silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" ").map((n) => [n, true]),
);

/** A colour OpenStreetMap carries as text, kept only when it is a CSS colour name or #rgb / #rrggbb (it ends up in the scene's materials: nothing else passes). */
export function cssColor(v: string | undefined): string | undefined {
  const s = v?.trim().toLowerCase();
  if (!s) return undefined;
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(s) || Object.hasOwn(CSS_NAMES, s) ? s : undefined;
}

// ---- geometry out of Overpass -------------------------------------------------------------------------------------------------------

const isMember = (m: unknown): m is Member => isRecord(m);
const points = (g: unknown): LL[] => (Array.isArray(g) ? g.filter((p): p is LL => !!p && num((p as LL).lat) && num((p as LL).lon)) : []);
const same = (a: LL, b: LL) => a.lat === b.lat && a.lon === b.lon;

/** Joins ways that share end points into closed rings (a multipolygon's outline often comes in pieces); pieces that never close are dropped. */
export function joinRings(parts: LL[][]): LL[][] {
  const open = parts.filter((p) => p.length > 1).map((p) => p.slice());
  const rings: LL[][] = [];
  while (open.length) {
    let cur = open.pop() ?? [];
    while (!(cur.length > 3 && same(cur[0], cur[cur.length - 1]))) {
      const end = cur[cur.length - 1];
      const i = open.findIndex((o) => same(o[0], end) || same(o[o.length - 1], end));
      if (i < 0) break;
      const next = open.splice(i, 1)[0];
      if (!same(next[0], end)) next.reverse();
      cur = cur.concat(next.slice(1));
    }
    if (cur.length > 3 && same(cur[0], cur[cur.length - 1])) rings.push(cur.slice(0, -1));
  }
  return rings;
}

/** At most MAX_RING_POINTS points, evenly decimated (a county-sized forest is not worth more). */
const thin = <T>(pts: T[]): T[] => (pts.length <= MAX_RING_POINTS ? pts : pts.filter((_, i) => i % Math.ceil(pts.length / MAX_RING_POINTS) === 0));

type Shape = { id: string; ring: XY[]; holes: XY[][] };

/** The outlines of a way (when closed) or multipolygon relation, in site metres: one Shape per outer ring, holes assigned to the outer that contains them. */
function shapesOf(el: Element, prefix: string, center: LatLon): Shape[] {
  const toSite = (ring: LL[]): XY[] => dedupeRing(thin(ring).map((p) => latLonToSite(center, p.lat, p.lon).map(r2) as XY));
  const id = `${prefix}${el.id}`;
  if (el.type === "way") {
    const g = points(el.geometry);
    if (g.length < 4 || !same(g[0], g[g.length - 1])) return [];
    const ring = toSite(g.slice(0, -1));
    return ring.length >= 3 ? [{ id, ring, holes: [] }] : [];
  }
  if (el.type !== "relation" || !Array.isArray(el.members)) return [];
  const members = el.members.filter(isMember).filter((m) => m.type === "way");
  const outers = joinRings(members.filter((m) => m.role === "outer" || m.role === "").map((m) => points(m.geometry))).map(toSite).filter((r) => r.length >= 3);
  const inners = joinRings(members.filter((m) => m.role === "inner").map((m) => points(m.geometry))).map(toSite).filter((r) => r.length >= 3);
  return outers.map((ring, i) => ({ id: outers.length > 1 ? `${id}-${i}` : id, ring, holes: inners.filter((h) => pointInPolygon(h[0], ring)) }));
}

const lineOf = (el: Element, center: LatLon): XY[] => dedupeRing(thin(points(el.geometry)).map((p) => latLonToSite(center, p.lat, p.lon).map(r2) as XY));

// ---- buildings ----------------------------------------------------------------------------------------------------------------------

const LEVEL = 3;
const KIND_HEIGHT: Record<string, number> = {
  house: 6, detached: 7, semidetached_house: 7, terrace: 7, bungalow: 4, residential: 9, apartments: 15, dormitory: 12, hotel: 14, office: 12, commercial: 8, retail: 6, supermarket: 6,
  industrial: 8, warehouse: 8, school: 10, kindergarten: 5, university: 12, hospital: 15, church: 12, cathedral: 20, chapel: 8, garage: 3, garages: 3, shed: 3, roof: 3, carport: 3, hut: 3, cabin: 4, service: 4, farm: 6,
};
const FLAT_KINDS = new Set(["apartments", "commercial", "industrial", "retail", "office", "warehouse", "supermarket", "hospital", "school", "university", "dormitory", "hotel", "garage", "garages", "shed", "roof", "carport", "service"]);
const PITCHED_KINDS = new Set(["house", "detached", "semidetached_house", "terrace", "bungalow", "residential", "farm", "cabin", "church", "chapel", "cathedral"]);
const ROOF_TAGS: Record<string, RoofShape> = {
  flat: "flat", gabled: "gabled", gambrel: "gabled", saltbox: "gabled", hipped: "hipped", "half-hipped": "hipped", mansard: "hipped", pyramidal: "pyramidal", skillion: "skillion", lean_to: "skillion", dome: "dome", onion: "dome",
};

function buildingOf(s: Shape, tags: Tags): SiteBuilding | undefined {
  const kind = /^[a-z_]{1,32}$/.test(tags.building ?? "") ? tags.building : "yes";
  const area = polygonArea(s.ring) - s.holes.reduce((a, h) => a + polygonArea(h), 0);
  if (area < 2) return undefined;
  const levels = parseMetres(tags["building:levels"], 200);
  const small = area < 150;
  const roof: RoofShape = ROOF_TAGS[tags["roof:shape"] ?? ""] ?? (FLAT_KINDS.has(kind) ? "flat" : PITCHED_KINDS.has(kind) || (kind === "yes" && small) ? "gabled" : "flat");
  const [, short] = ringSpan(s.ring);
  const roofLevels = parseMetres(tags["roof:levels"], 20);
  let roofHeight = roof === "flat" ? 0 : (parseMetres(tags["roof:height"], 60) ?? (roofLevels !== undefined ? roofLevels * LEVEL : Math.min(4, short * 0.25)));
  const total = parseMetres(tags.height, 500);
  let height: number;
  if (total !== undefined) {
    roofHeight = Math.min(roofHeight, Math.max(0, total - 2.5));
    height = total - roofHeight;
  } else {
    height = levels !== undefined ? levels * LEVEL : (KIND_HEIGHT[kind] ?? (small ? 7 : 12));
  }
  height = Math.max(2.5, height);
  const lift = parseMetres(tags.min_height, 500) ?? (parseMetres(tags["building:min_level"], 100) ?? 0) * LEVEL;
  const b: SiteBuilding = { id: s.id, ring: s.ring, height: r2(height), minHeight: r2(Math.min(lift, height - 1 > 0 ? height - 1 : 0)), roof, roofHeight: r2(roofHeight), kind };
  if (s.holes.length) b.holes = s.holes;
  const roofColor = cssColor(tags["roof:colour"]);
  const wallColor = cssColor(tags["building:colour"]);
  if (roofColor) b.roofColor = roofColor;
  if (wallColor) b.wallColor = wallColor;
  return b;
}

// ---- trees --------------------------------------------------------------------------------------------------------------------------

/** What an OpenStreetMap `species` / `genus` / `species:en` value names, as one of the scene's tree species. */
const TREE_NAMES = {
  oak: "oak", quercus: "oak", birch: "birch", betula: "birch", maple: "maple", acer: "maple", linden: "linden", lime: "linden", tilia: "linden", willow: "willow", salix: "willow",
  poplar: "poplar", populus: "poplar", cypress: "cypress", cupressus: "cypress", cherry: "cherry", prunus: "cherry", apple: "apple", malus: "apple", pine: "pine", pinus: "pine",
  spruce: "spruce", picea: "spruce", fir: "fir", abies: "fir", palm: "palm", olive: "olive", olea: "olive",
} satisfies Record<string, Species>;

function speciesOfTags(tags: Tags): Species | undefined {
  for (const key of ["species", "species:en", "genus"]) {
    const word = (tags[key] ?? "").trim().toLowerCase().split(/[\s,;_]+/)[0];
    if (Object.hasOwn(TREE_NAMES, word)) return TREE_NAMES[word as keyof typeof TREE_NAMES];
  }
  return undefined;
}

function leafOf(tags: Tags, species?: Species): "broad" | "needle" {
  if (tags.leaf_type === "needleleaved") return "needle";
  if (tags.leaf_type === "broadleaved") return "broad";
  return species === "pine" || species === "spruce" || species === "fir" || species === "cypress" ? "needle" : "broad";
}

function treeAt(x: number, y: number, tags: Tags): SiteTree {
  const species = speciesOfTags(tags);
  const height = parseMetres(tags.height, 60) ?? 8;
  const crown = parseMetres(tags.diameter_crown, 40) ?? Math.min(12, Math.max(2, height * 0.6));
  const t: SiteTree = { x: r2(x), y: r2(y), height, crown, leaf: leafOf(tags, species), source: "osm" };
  if (species) t.species = species;
  return t;
}

/** Evenly spaced points along a line, end to end. */
function along(pts: XY[], step: number): XY[] {
  const out: XY[] = [];
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = carry; d <= len; d += step) {
      const t = len ? d / len : 0;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      carry = d + step - len;
    }
  }
  return out;
}

// ---- areas and roads ----------------------------------------------------------------------------------------------------------------

function areaKind(tags: Tags): AreaKind | undefined {
  switch (tags.natural) {
    case "wood": return "wood";
    case "scrub": return "scrub";
    case "water": return "water";
    case "grassland": return "grass";
    case "sand": case "beach": return "sand";
    case "bare_rock": case "scree": return "rock";
  }
  switch (tags.landuse) {
    case "forest": return "wood";
    case "grass": case "meadow": case "village_green": case "recreation_ground": case "cemetery": return "grass";
    case "farmland": return "farmland";
    case "residential": return "residential";
    case "retail": case "commercial": case "industrial": return "paving";
    case "reservoir": case "basin": return "water";
  }
  switch (tags.leisure) {
    case "park": case "garden": case "pitch": return "grass";
    case "playground": return "sand";
  }
  return tags.amenity === "parking" ? "paving" : undefined;
}

/** Drawn first to last: broad ground cover underneath, then woods and scrub, then paving, water on top; larger before smaller inside a kind. */
const AREA_ORDER: Record<AreaKind, number> = { residential: 0, farmland: 1, grass: 2, sand: 3, rock: 3, scrub: 4, wood: 5, paving: 6, water: 7 };

const LEAF: Record<string, "broad" | "needle" | "mixed"> = { broadleaved: "broad", needleleaved: "needle", mixed: "mixed" };

const ROAD_KINDS: Record<string, RoadKind> = {
  motorway: "motorway", motorway_link: "motorway", trunk: "motorway", trunk_link: "motorway", primary: "primary", primary_link: "primary", secondary: "secondary", secondary_link: "secondary",
  tertiary: "secondary", tertiary_link: "secondary", unclassified: "residential", residential: "residential", living_street: "residential", road: "residential", service: "service",
  pedestrian: "footway", footway: "footway", path: "footway", cycleway: "footway", steps: "footway", track: "track",
};
const ROAD_WIDTH: Record<RoadKind, number> = { motorway: 12, primary: 9, secondary: 7, residential: 5.5, service: 3.5, footway: 1.8, track: 3, railway: 3.5, river: 8 };
const WATERWAY_WIDTH: Record<string, number> = { river: 10, canal: 6, stream: 2 };
const LANE = 3.2;

function roadOf(el: Element, tags: Tags, center: LatLon, rect: Rect): SiteRoad | undefined {
  if (tags.tunnel === "yes" || tags.tunnel === "building_passage" || tags.covered === "yes") return undefined;
  let kind: RoadKind | undefined;
  let width: number | undefined;
  if (tags.highway) kind = ROAD_KINDS[tags.highway];
  else if (tags.railway === "rail") kind = "railway";
  else if (tags.waterway) {
    kind = "river";
    width = WATERWAY_WIDTH[tags.waterway];
  }
  if (!kind) return undefined;
  const pts = lineOf(el, center);
  if (pts.length < 2 || !polylineOverlapsRect(pts, rect)) return undefined;
  const lanes = parseMetres(tags.lanes, 12);
  width = parseMetres(tags.width, 60) ?? width ?? (lanes !== undefined && kind !== "footway" && kind !== "railway" ? lanes * LANE : ROAD_WIDTH[kind]);
  return { id: `w${el.id}`, kind, width: r2(Math.min(40, Math.max(0.5, width))), pts };
}

// ---- the whole answer ---------------------------------------------------------------------------------------------------------------

const dist2 = (p: XY) => p[0] * p[0] + p[1] * p[1];

/** What parseOverpass gathers: each thing with the sort key it is trimmed by (distance from the centre, or area size). */
type Found = {
  buildings: { b: SiteBuilding; d: number }[];
  trees: { t: SiteTree; d: number }[];
  areas: { a: SiteArea; size: number }[];
  roads: { r: SiteRoad; d: number }[];
};

function collectTree(found: Found, radius: number, t: SiteTree) {
  if (Math.abs(t.x) <= radius && Math.abs(t.y) <= radius) found.trees.push({ t, d: dist2([t.x, t.y]) });
}

function collectBuildings(found: Found, el: Element, prefix: string, tags: Tags, center: LatLon, rect: Rect) {
  if (tags.location === "underground" || tags.tunnel === "yes") return;
  for (const s of shapesOf(el, prefix, center)) {
    if (!polygonOverlapsRect(s.ring, rect)) continue;
    const b = buildingOf(s, tags);
    if (b) found.buildings.push({ b, d: dist2(polygonCentroid(s.ring)) });
  }
}

function collectAreas(found: Found, el: Element, prefix: string, tags: Tags, kind: AreaKind, center: LatLon, rect: Rect) {
  for (const s of shapesOf(el, prefix, center)) {
    if (!polygonOverlapsRect(s.ring, rect) || polygonArea(s.ring) < 4) continue;
    const a: SiteArea = { id: s.id, kind, ring: s.ring };
    if (s.holes.length) a.holes = s.holes;
    if (kind === "wood" && LEAF[tags.leaf_type ?? ""]) a.leaf = LEAF[tags.leaf_type];
    found.areas.push({ a, size: polygonArea(s.ring) });
  }
}

/** Files one element under what it is: a tree, tree row, building, area or road (the first that matches); anything else is ignored. */
function collectElement(found: Found, el: Element, center: LatLon, radius: number, rect: Rect) {
  if (!el || typeof el !== "object" || !num(el.id)) return;
  const tags: Tags = el.tags && typeof el.tags === "object" ? el.tags : {};
  const prefix = el.type === "node" ? "n" : el.type === "relation" ? "r" : "w";
  if (el.type === "node") {
    if (tags.natural === "tree" && num(el.lat) && num(el.lon)) {
      const [x, y] = latLonToSite(center, el.lat, el.lon);
      collectTree(found, radius, treeAt(x, y, tags));
    }
    return;
  }
  if (tags.building && tags.building !== "no") return collectBuildings(found, el, prefix, tags, center, rect);
  if (el.type === "way" && tags.natural === "tree_row") {
    for (const [x, y] of along(lineOf(el, center), TREE_ROW_SPACING)) collectTree(found, radius, treeAt(x, y, tags));
    return;
  }
  const kind = areaKind(tags);
  if (kind) return collectAreas(found, el, prefix, tags, kind, center, rect);
  if (el.type === "way") {
    const r = roadOf(el, tags, center, rect);
    if (r) found.roads.push({ r, d: dist2(r.pts[0]) });
  }
}

/** Overpass JSON -> the OpenStreetMap part of SiteData (buildings, trees, areas, roads, notes). Things completely outside the square of `radius` metres are dropped. */
export function parseOverpass(json: unknown, center: LatLon, radius: number): Pick<SiteData, "buildings" | "trees" | "areas" | "roads" | "notes"> {
  const raw = json && typeof json === "object" && "elements" in json ? json.elements : undefined;
  const elements: Element[] = Array.isArray(raw) ? raw : [];
  const rect: Rect = { x0: -radius, y0: -radius, x1: radius, y1: radius };
  const found: Found = { buildings: [], trees: [], areas: [], roads: [] };
  for (const el of elements) collectElement(found, el, center, radius, rect);

  const notes: string[] = [];
  const nearest = <T extends { d: number }>(list: T[], max: number, what: string): T[] => {
    if (list.length <= max) return list;
    notes.push(`There are more ${what} around you than are drawn (${max} nearest shown).`);
    return list.sort((a, b) => a.d - b.d).slice(0, max);
  };
  return {
    buildings: nearest(found.buildings, MAX_BUILDINGS, "buildings").map((x) => x.b),
    trees: nearest(found.trees, MAX_TREES, "trees").map((x) => x.t),
    areas: found.areas
      .sort((p, q) => AREA_ORDER[p.a.kind] - AREA_ORDER[q.a.kind] || q.size - p.size)
      .slice(0, MAX_AREAS)
      .map((x) => x.a),
    roads: nearest(found.roads, MAX_ROADS, "roads").map((x) => x.r),
    notes,
  };
}
