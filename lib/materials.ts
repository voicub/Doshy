import { isFence, restyleWall } from "./fences.ts";
import { setFloorPhoto, type FloorPhoto } from "./floorPhoto.ts";
import type { MaterialRef } from "./materialRef.ts";
import { setFloorMaterial, withoutFaceMaterials } from "./planMaterials.ts";
import { levelIdOf } from "./levels.ts";
import { pillarAt } from "./pillars.ts";
import type { FloorKind, Item, Plan, Pt, Room, Wall, WallStyle } from "./types.ts";

// ---- what things are made of ----------------------------------------------------------------------------------------

type FloorGroup = "Wood" | "Tile and stone" | "Concrete" | "Soft" | "Outdoor";
/** `color` is the natural tint a fresh floor of this kind gets; `rough`/`metal` the PBR values; `tileM` the metres one texture tile covers. */
type FloorDef = { label: string; group: FloorGroup; color: string; rough: number; metal: number; tileM: number; outdoor: boolean };

const f = (label: string, group: FloorGroup, color: string, tileM: number, rough: number, outdoor = false, metal = 0): FloorDef => ({ label, group, color, rough, metal, tileM, outdoor });

// The first five are the original floors: their roughness stays the one RoomFloor always used (indoor 0.45, outdoor 0.85) so saved homes look the same.
export const FLOORS: Record<FloorKind, FloorDef> = {
  wood: f("Wood", "Wood", "#d8bf94", 1.2, 0.45),
  tile: f("Tile", "Tile and stone", "#c9ced4", 0.6, 0.45),
  carpet: f("Carpet", "Soft", "#9aa3b2", 1, 0.45),
  brick: f("Brick", "Outdoor", "#a98879", 0.6, 0.85, true),
  grass: f("Grass", "Outdoor", "#7fae60", 1.5, 0.85, true),
  oak: f("Oak planks", "Wood", "#c8a273", 1.2, 0.5),
  darkwood: f("Dark wood", "Wood", "#4f3a2a", 1.2, 0.4),
  herringbone: f("Herringbone", "Wood", "#c8a273", 0.8, 0.4),
  laminate: f("Laminate", "Wood", "#cdbba0", 1.6, 0.35),
  tilelarge: f("Large tile", "Tile and stone", "#d5d8db", 1.2, 0.3),
  mosaic: f("Mosaic", "Tile and stone", "#b9c7d1", 0.4, 0.3),
  marble: f("Marble", "Tile and stone", "#ece9e4", 1.6, 0.15),
  terrazzo: f("Terrazzo", "Tile and stone", "#e2ddd5", 1.2, 0.3),
  concrete: f("Concrete", "Concrete", "#a9a9a9", 2, 0.9),
  polished: f("Polished concrete", "Concrete", "#9a9c9f", 2, 0.25, false, 0.1),
  slabs: f("Stone slabs", "Tile and stone", "#b7b0a4", 1.6, 0.7),
  slate: f("Slate", "Tile and stone", "#5c6168", 1.2, 0.6),
  vinyl: f("Vinyl", "Soft", "#c9c3b8", 1.2, 0.4),
  paving: f("Brick paving", "Outdoor", "#b1796a", 0.8, 0.85, true),
  gravel: f("Gravel", "Outdoor", "#b8b2a6", 1, 1, true),
  sand: f("Sand", "Outdoor", "#dcc896", 1.2, 1, true),
  deck: f("Deck boards", "Outdoor", "#a8825a", 1.2, 0.8, true),
  asphalt: f("Asphalt", "Outdoor", "#4b4d52", 1.5, 0.95, true),
  water: f("Pool water", "Outdoor", "#4aa3c8", 2, 0.05, true, 0.1),
  cobble: f("Cobblestone", "Outdoor", "#8d8a85", 0.8, 0.9, true),
  flagstone: f("Flagstone", "Outdoor", "#a39a8c", 1.2, 0.85, true),
  pavers_grey: f("Pavers, grey", "Outdoor", "#9a9b9e", 0.8, 0.85, true),
  pavers_sand: f("Pavers, sand", "Outdoor", "#cbb895", 0.8, 0.85, true),
  pavers_red: f("Pavers, terracotta", "Outdoor", "#b5654d", 0.8, 0.85, true),
  mulch: f("Bark mulch", "Outdoor", "#6e4a32", 1, 1, true),
  soil: f("Flower bed soil", "Outdoor", "#5b4331", 1, 1, true),
  turf: f("Artificial turf", "Outdoor", "#5f9e4a", 1.2, 0.9, true),
  rubber: f("Play surface", "Outdoor", "#a0443a", 1.2, 0.8, true),
};
export const FLOOR_KINDS = Object.keys(FLOORS) as FloorKind[];
export const FLOOR_GROUPS: readonly FloorGroup[] = ["Wood", "Tile and stone", "Concrete", "Soft", "Outdoor"];
/** An open-air surface: lawn, paving, deck, pool ... Rooms floored with it get no roof, no weather shield, and do not count as living area. */
export const isOutdoorFloor = (k: FloorKind) => FLOORS[k]?.outdoor ?? false;
/** Floor kinds listed by group, in catalog order. */
export const floorsInGroup = (g: FloorGroup) => FLOOR_KINDS.filter((k) => FLOORS[k].group === g);
/** A room's floor kind, tolerating unknown values from an older or newer save. */
export const floorOf = (r: { floor: FloorKind }): FloorKind => (FLOORS[r.floor] ? r.floor : "wood");

type WallDef = { label: string; color: string; rough: number; tileM: number; /** Drawn without a texture (flat colour or glass). */ plain?: true; glass?: true; plinth?: true };
const w = (label: string, color: string, tileM: number, rough = 0.9, o: Partial<WallDef> = {}): WallDef => ({ label, color, rough, tileM, ...o });

export const WALLS: Record<WallStyle, WallDef> = {
  plaster: w("Plaster", "#f1efea", 2),
  brick: w("Brick", "#d9cfc3", 0.6, 0.9, { plinth: true }),
  redbrick: w("Red brick", "#c7826f", 0.6),
  whitebrick: w("White brick", "#f0eeea", 0.6),
  concrete: w("Concrete", "#b4b4b2", 2),
  woodv: w("Wood, vertical", "#c8a273", 1.2, 0.75),
  woodh: w("Wood, horizontal", "#c8a273", 1.2, 0.75),
  stone: w("Stone", "#bdb4a6", 1.2, 0.95),
  metro: w("Wall tile", "#e8ecee", 0.6, 0.3),
  stripes: w("Striped wallpaper", "#d9dfe6", 1),
  batten: w("Board and batten", "#e6e3dc", 1.2, 0.8),
  glass: w("Glass", "#bfe2f0", 1, 0.05, { plain: true, glass: true }),
  paint: w("Plain paint", "#f1efea", 1, 0.9, { plain: true }),
  // garden boundaries (lib/fences.ts): drawn as real geometry in 3D, the texture only paints swatches and the 2D look
  fence_picket: w("Picket fence", "#f4f1ea", 1, 0.8),
  fence_wire: w("Wire / chain-link fence", "#8f969d", 1, 0.5),
  fence_panel: w("Privacy fence", "#b08a5e", 1.2, 0.8),
  wall_stone: w("Stone wall", "#a79f92", 1.2, 0.95),
  wall_brick_low: w("Low brick wall", "#b9735f", 0.6),
  hedge: w("Hedge", "#4f8a3d", 1, 1),
  fence_slat: w("Slat fence", "#a9794c", 1.2, 0.75),
  fence_bar: w("Metal bar railing", "#2b2d31", 1, 0.45),
  fence_iron: w("Wrought iron fence", "#25272a", 1, 0.45),
  fence_glass: w("Glass panel fence", "#bfe2f0", 1, 0.05),
  wall_block: w("Concrete block wall", "#b5b3ae", 1.2, 0.9),
  fence_rail: w("Post and rail fence", "#8a6a45", 1, 0.85),
  fence_electric: w("Electric fence", "#f2f2f2", 1, 0.6),
  fence_bamboo: w("Bamboo fence", "#cdb870", 1, 0.7),
};
export const WALL_STYLES = Object.keys(WALLS) as WallStyle[];
export const wallStyleOf = (s: WallStyle): WallStyle => (WALLS[s] ? s : "plaster");
/** Brick-built styles (the foundation plinth and the plan hatch follow them). */
export const isBrickWall = (s: WallStyle) => s === "brick" || s === "redbrick" || s === "whitebrick";

// ---- colours ----------------------------------------------------------------------------------------------------------

export type Swatch = { name: string; c: string };

/** Curated paint colours, named the way a paint shop would, grouped in rows of related tones. The tint is multiplied with the material, so all are light-to-mid. */
export const PALETTE: Swatch[] = [
  { name: "Chalk", c: "#f4f1ea" }, { name: "Warm white", c: "#ece4d6" }, { name: "Cream", c: "#efe3c8" }, { name: "Blush", c: "#e3c3bb" }, { name: "Sand", c: "#d8c7a6" }, { name: "Mustard", c: "#d3a84a" },
  { name: "Light grey", c: "#c9ccd1" }, { name: "Greige", c: "#b9b1a5" }, { name: "Stone grey", c: "#8f9296" }, { name: "Charcoal", c: "#4a4e57" }, { name: "Graphite", c: "#32353b" }, { name: "Black", c: "#1f2024" },
  { name: "Sage", c: "#a9b8a0" }, { name: "Olive", c: "#8a8f5c" }, { name: "Forest", c: "#4f6b52" }, { name: "Sky", c: "#b8d4e3" }, { name: "Dusty blue", c: "#9fb2c4" }, { name: "Teal", c: "#4e8a8c" },
  { name: "Navy", c: "#3b4a63" }, { name: "Plum", c: "#6d4a63" }, { name: "Terracotta", c: "#c98d74" }, { name: "Brick red", c: "#b9695a" }, { name: "Oak", c: "#c8a273" }, { name: "Walnut", c: "#7b5a3f" },
];

/** "#rgb", "#rrggbb" (case and leading # optional) to lowercase "#rrggbb", or null when it is not a colour. */
export function parseHex(s: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((s ?? "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(parseHex(hex) ?? "#000000").map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Most colours kept in the recently-used row. */
export const RECENT_MAX = 8;
/** `hex` moved to the front of the recent colours (deduplicated, capped); an invalid colour leaves the list alone. */
export function pushRecent(list: readonly string[], hex: string, max = RECENT_MAX): string[] {
  const c = parseHex(hex);
  return c ? [c, ...list.filter((x) => x !== c)].slice(0, max) : [...list];
}

// ---- per-face walls -----------------------------------------------------------------------------------------------------

/** What one face of a wall looks like: its material and colour (absent colour = the material's natural colour). */
export type Face = { style: WallStyle; color?: string };
type FaceKey = "A" | "B";
/** The tint a face is drawn with. */
export const faceTint = (face: Face) => face.color ?? WALLS[wallStyleOf(face.style)].color;

/**
 * Both faces of a wall: A (right when walking a to b, y down) and B (left). A wall with no `styleB`/`colorB` (every wall saved before faces existed)
 * has two identical faces. A glass wall is glass on both faces: a pane has no inside and outside material.
 */
export function wallFaces(wall: Wall): [Face, Face] {
  const a: Face = { style: wallStyleOf(wall.style), ...(wall.color ? { color: wall.color } : {}) };
  // face B is either inherited whole from A or fully its own: a B with a style but no colour is in its natural colour, not A's
  const own = wall.styleB !== undefined || wall.colorB !== undefined;
  const bColor = own ? wall.colorB : wall.color;
  const b: Face = { style: wallStyleOf(wall.styleB ?? wall.style), ...(bColor ? { color: bColor } : {}) };
  if (WALLS[a.style].glass || WALLS[b.style].glass) return [{ ...a, style: "glass" }, { ...b, style: "glass" }];
  return [a, b];
}
export const isGlassWall = (wall: Wall) => wallFaces(wall)[0].style === "glass";

/** Write two faces back onto a wall in its canonical form: face B is stored (style and colour) only where it differs from face A. */
function withFaces(wall: Wall, a: Face, b: Face): Wall {
  const { styleB: _sb, colorB: _cb, color: _c, ...rest } = wall;
  const same = a.style === b.style && a.color === b.color;
  const next: Wall = { ...rest, style: a.style, ...(a.color ? { color: a.color } : {}), ...(same ? {} : { styleB: b.style, ...(b.color ? { colorB: b.color } : {}) }) };
  return wallEq(wall, next) ? wall : next;
}
const wallEq = (x: Wall, y: Wall) => x.style === y.style && x.color === y.color && x.styleB === y.styleB && x.colorB === y.colorB;

// ---- which side is inside -----------------------------------------------------------------------------------------------

/** How far from the wall centre each side is sampled to find the room it faces (metres). */
const SIDE_PROBE = 0.21;
const inRect = (r: Room, p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const dir = (wall: Wall) => {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len, len };
};
/** Right-hand normal of a wall in plan (y down): the direction face A looks toward. */
const normalA = (wall: Wall) => {
  const { dx, dy } = dir(wall);
  return { x: -dy, y: dx };
};
/** Which face of `wall` a point is on: A when it lies on the wall's right-hand side. */
function faceOfPoint(wall: Wall, p: Pt): FaceKey {
  const n = normalA(wall);
  return (p.x - wall.a.x) * n.x + (p.y - wall.a.y) * n.y >= 0 ? "A" : "B";
}

type WallSides = {
  /** The room each face looks into, or null (open ground, garden, or no room at all). Garden and other open-air rooms count as outside. */
  a: Room | null;
  b: Room | null;
} & (
  /** exterior: one side is a room and the other is outside, so one face looks out of the building and the other in. */
  | { kind: "exterior"; outside: FaceKey; inside: FaceKey }
  /** interior: rooms on both sides; free: no room either side (a fence or loose wall). */
  | { kind: "interior" | "free"; outside?: undefined; inside?: undefined }
);

/** Which rooms a wall separates, sampled at its middle; open-air rooms (lawn, terrace, pool) count as outside. */
export function wallSides(plan: Plan, wall: Wall): WallSides {
  const level = levelIdOf(plan, wall);
  const rooms = plan.rooms.filter((r) => levelIdOf(plan, r) === level);
  const n = normalA(wall);
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
  const at = (s: number) => {
    const p = { x: mid.x + n.x * SIDE_PROBE * s, y: mid.y + n.y * SIDE_PROBE * s };
    return rooms.filter((r) => inRect(r, p)).sort((x, y) => x.w * x.h - y.w * y.h)[0] ?? null;
  };
  const a = at(1);
  const b = at(-1);
  const indoor = (r: Room | null) => !!r && !isOutdoorFloor(floorOf(r));
  const ia = indoor(a);
  const ib = indoor(b);
  if (ia && ib) return { a, b, kind: "interior" };
  if (ia) return { a, b, kind: "exterior", inside: "A", outside: "B" };
  if (ib) return { a, b, kind: "exterior", inside: "B", outside: "A" };
  return { a, b, kind: "free" };
}

/** Plain-words names of the two faces for the inspector: Inside / Outside, or the rooms either side. */
export function faceLabels(sides: WallSides): Record<FaceKey, string> {
  if (sides.kind === "exterior") return sides.inside === "A" ? { A: "Inside", B: "Outside" } : { A: "Outside", B: "Inside" };
  return { A: sides.a?.name ?? "Side 1", B: sides.b?.name ?? "Side 2" };
}

// ---- painting ---------------------------------------------------------------------------------------------------------------

/**
 * A paint brush: a material to lay down (floor or wall; null = keep what is there and only change the colour) and a colour (null = the material's natural colour).
 * `roomWalls` makes a colour-only brush paint the walls around a clicked room instead of its floor. `floorPhoto` makes it lay a photo of a real floor on a clicked room
 * (`color` is then the photo's average colour, which is what a furniture piece takes); walls ignore it. `floorMaterial` does the same with a Poly Haven texture (lib/materialRef.ts).
 */
export type Brush = { material: { kind: "floor"; id: FloorKind } | { kind: "wall"; id: WallStyle } | null; color: string | null; roomWalls?: boolean; floorPhoto?: FloorPhoto; floorMaterial?: MaterialRef };
export const DEFAULT_BRUSH: Brush = { material: null, color: "#a9b8a0" };

/** The brush with `patch` laid over it. A new material or colour replaces a floor photo or texture the brush held (so the eyedropper and the pickers never leave one behind), and a new photo or texture replaces the other kind; other settings (`roomWalls`) leave them. */
export function mergeBrush(brush: Brush, patch: Partial<Brush>): Brush {
  const { floorPhoto, floorMaterial, ...bare } = brush;
  const drops = "material" in patch || "color" in patch || "floorPhoto" in patch || "floorMaterial" in patch;
  return { ...bare, ...(drops ? {} : { ...(floorPhoto ? { floorPhoto } : {}), ...(floorMaterial ? { floorMaterial } : {}) }), ...patch };
}

export type WallTarget = FaceKey | "both";

function paintedFace(face: Face, brush: Brush): Face {
  return { style: brush.material?.kind === "wall" ? brush.material.id : face.style, ...(brush.color ? { color: brush.color } : {}) };
}

/**
 * `wall` with the brush laid on one face or both. Glass is whole-wall: glass goes on both faces, and any other material replaces a glass wall on both.
 * A face that is painted loses its Poly Haven material (`wall.material`): the paint would otherwise be hidden under it.
 */
export function paintWall(wall: Wall, target: WallTarget, brush: Brush): Wall {
  if (brush.material?.kind === "floor" || brush.floorPhoto || brush.floorMaterial) return wall;
  const [a, b] = wallFaces(wall);
  const newGlass = brush.material?.kind === "wall" && WALLS[brush.material.id].glass;
  // glass and fences are one material through and through: they take both faces, and a fence repainted takes its other face along
  const both = target === "both" || newGlass || a.style === "glass" || (brush.material?.kind === "wall" && isFence(brush.material.id)) || isFence(a.style);
  const hitA = target === "A" || both;
  const hitB = target === "B" || both;
  return withoutFaceMaterials(restyleWall(wall, withFaces(wall, hitA ? paintedFace(a, brush) : a, hitB ? paintedFace(b, brush) : b)), hitA, hitB);
}

const mapWalls = (plan: Plan, fn: (w: Wall) => Wall): Plan => {
  const walls = plan.walls.map(fn);
  return walls.some((x, i) => x !== plan.walls[i]) ? { ...plan, walls } : plan;
};

export function paintWallId(plan: Plan, id: string, target: WallTarget, brush: Brush): Plan {
  return mapWalls(plan, (w) => (w.id === id ? paintWall(w, target, brush) : w));
}

/** A room's floor painted: the brush's floor kind (or the current one) in its colour (or the kind's natural colour), or the brush's floor photo or material. A wall material is ignored. Any other paint takes the room's photo and material off. */
export function paintFloor(plan: Plan, roomId: string, brush: Brush): Plan {
  if (brush.material?.kind === "wall") return plan;
  if (brush.floorPhoto) return setFloorPhoto(plan, roomId, brush.floorPhoto);
  if (brush.floorMaterial) return setFloorMaterial(plan, roomId, brush.floorMaterial);
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const floor = brush.material ? brush.material.id : floorOf(room);
  const color = brush.color ?? FLOORS[floor].color;
  if (room.floor === floor && room.color === color && !room.floorPhoto && !room.floorMaterial) return plan;
  const { floorPhoto: _gone, floorMaterial: _mat, ...rest } = room;
  return { ...plan, rooms: plan.rooms.map((r) => (r.id === roomId ? { ...rest, floor, color } : r)) };
}

/** Walls that run along the edge of a room (or of one of its alcoves), each with the face that looks into the room. */
export function roomWalls(plan: Plan, roomId: string): { wall: Wall; face: FaceKey }[] {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const level = levelIdOf(plan, room);
  const rects = [room, ...plan.rooms.filter((r) => r.parent === room.id)];
  const out: { wall: Wall; face: FaceKey }[] = [];
  for (const wall of plan.walls) {
    if (levelIdOf(plan, wall) !== level) continue;
    const { dx, dy, len } = dir(wall);
    const tol = (wall.thickness ?? 0.12) / 2 + 0.05;
    for (const r of rects) {
      const edge = (p: Pt) => Math.min(Math.abs(p.x - r.x), Math.abs(p.x - (r.x + r.w)), Math.abs(p.y - r.y), Math.abs(p.y - (r.y + r.h)));
      const steps = Math.max(2, Math.ceil(len / 0.25));
      let hits = 0;
      for (let i = 0; i <= steps; i++) {
        const p = { x: wall.a.x + dx * len * (i / steps), y: wall.a.y + dy * len * (i / steps) };
        const near = p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol;
        if (near && edge(p) <= tol) hits++;
      }
      if (hits * (len / steps) < 0.3) continue;
      out.push({ wall, face: faceOfPoint(wall, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) });
      break;
    }
  }
  return out;
}

/** The brush laid on the inside face of every wall around a room. */
export function paintRoomWalls(plan: Plan, roomId: string, brush: Brush): Plan {
  const mine = roomWalls(plan, roomId);
  return mapWalls(plan, (w) => {
    const m = mine.find((x) => x.wall.id === w.id);
    return m ? paintWall(w, m.face, brush) : w;
  });
}

/**
 * The brush laid on every outside face (`outside`), every face that looks into a room (`inside`), or both faces of every wall (`all`) on a level.
 * A loose wall (no room either side) counts as outside on both faces.
 */
export function paintLevelWalls(plan: Plan, level: string, which: "outside" | "inside" | "all", brush: Brush): Plan {
  return mapWalls(plan, (w) => {
    if (levelIdOf(plan, w) !== level || isFence(w.style)) return w; // fences and garden walls are not the house's walls
    if (which === "all") return paintWall(w, "both", brush);
    const s = wallSides(plan, w);
    if (which === "outside") return s.kind === "exterior" ? paintWall(w, s.outside, brush) : s.kind === "free" ? paintWall(w, "both", brush) : w;
    return s.kind === "exterior" ? paintWall(w, s.inside, brush) : s.kind === "interior" ? paintWall(w, "both", brush) : w;
  });
}

/** A piece of furniture's finish colour (null = its own colours). */
export function paintItem(plan: Plan, itemId: string, color: string | null): Plan {
  const it = plan.items.find((i) => i.id === itemId);
  if (!it || (it.color ?? null) === color) return plan;
  const items = plan.items.map((i): Item => {
    if (i.id !== itemId) return i;
    const { color: _old, ...rest } = i;
    return color ? { ...rest, color } : rest;
  });
  return { ...plan, items };
}

/** What the paint bucket would pick up from a floor, a wall face or an item (the eyedropper). A colour equal to the natural one is `null`. */
const sampleFloor = (room: Room): Brush => {
  if (room.floorPhoto) return { material: null, color: room.floorPhoto.avg, floorPhoto: room.floorPhoto };
  if (room.floorMaterial) return { material: null, color: room.floorMaterial.avg, floorMaterial: room.floorMaterial };
  const kind = floorOf(room);
  return { material: { kind: "floor", id: kind }, color: room.color === FLOORS[kind].color ? null : room.color };
};
const sampleWall = (wall: Wall, face: FaceKey): Brush => {
  const f = wallFaces(wall)[face === "A" ? 0 : 1];
  return { material: { kind: "wall", id: f.style }, color: f.color ?? null };
};

export type PaintHit = { type: "wall"; id: string; face: FaceKey } | { type: "room"; id: string } | { type: "pillar"; id: string };

/** What a click at plan point `p` lands on: a pillar standing there, else the nearest wall within its width plus `reach` metres (and which face), else the smallest room under it. `plan` should be one level. */
export function pickSurface(plan: Plan, p: Pt, reach: number): PaintHit | null {
  const pillar = pillarAt(plan.items, p); // a column in a facade is drawn above the wall, so it is painted first
  if (pillar) return { type: "pillar", id: pillar.id };
  let best: { wall: Wall; d: number } | null = null;
  for (const wall of plan.walls) {
    const { dx, dy, len } = dir(wall);
    if (len < 0.01) continue;
    const t = Math.min(len, Math.max(0, (p.x - wall.a.x) * dx + (p.y - wall.a.y) * dy));
    const d = Math.hypot(p.x - (wall.a.x + dx * t), p.y - (wall.a.y + dy * t)) - (wall.thickness ?? 0.12) / 2;
    if (d <= reach && (!best || d < best.d)) best = { wall, d };
  }
  if (best) return { type: "wall", id: best.wall.id, face: faceOfPoint(best.wall, p) };
  const room = plan.rooms.filter((r) => inRect(r, p)).sort((x, y) => x.w * x.h - y.w * y.h)[0];
  return room ? { type: "room", id: room.id } : null;
}

/** Apply the brush to what a click hit; `both` paints both faces of a wall. Returns the same plan when nothing changes (so no undo step is recorded). */
export function paintHit(plan: Plan, hit: PaintHit, brush: Brush, both = false): Plan {
  if (hit.type === "pillar") return paintItem(plan, hit.id, brush.color); // a pillar takes the brush's colour only: its stone or plaster texture stays
  if (hit.type === "wall") return paintWallId(plan, hit.id, both ? "both" : hit.face, brush);
  const walls = !brush.floorPhoto && !brush.floorMaterial && (brush.material ? brush.material.kind === "wall" : !!brush.roomWalls); // a colour-only brush paints a room's floor unless told to do its walls; a photo or texture is always a floor
  return walls ? paintRoomWalls(plan, hit.id, brush) : paintFloor(plan, hit.id, brush);
}

/** The eyedropper: the brush a floor or wall face under a click would pick up. */
export function sampleHit(plan: Plan, hit: PaintHit): Brush | null {
  if (hit.type === "pillar") return { material: null, color: plan.items.find((i) => i.id === hit.id)?.color ?? null };
  if (hit.type === "room") {
    const room = plan.rooms.find((r) => r.id === hit.id);
    return room ? sampleFloor(room) : null;
  }
  const wall = plan.walls.find((w) => w.id === hit.id);
  return wall ? sampleWall(wall, hit.face) : null;
}

/** The material a cut wall is hatched with in the plan: the outside face of a house wall (the brick you see from the street), else face A. */
export function sectionStyle(plan: Plan, wall: Wall): WallStyle {
  const s = wallSides(plan, wall);
  return wallFaces(wall)[s.kind === "exterior" && s.outside === "B" ? 1 : 0].style;
}
