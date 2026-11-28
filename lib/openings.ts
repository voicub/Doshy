import { MIN_OPENING, WALL_H, roomAt } from "./geometry.ts";
import { clamp } from "./mathUtil.ts";
import { isOpenState, type HAState } from "./ha.ts";
import type { GlassTint, Opening, OpeningStyle, OpeningType, Plan, Room, Wall } from "./types.ts";

/** One gallery entry. Sizes are metres: `w` x `h` with the bottom edge `sill` above the floor; `wide` / `tall` feed the Wide and Tall chips. */
type StyleDef = {
  type: OpeningType;
  label: string;
  hint: string;
  w: number;
  h: number;
  sill: number;
  wide: number;
  tall: number;
  /** A hinged leaf swings open: the plan draws an arc, the inspector offers the hinge side, furniture can block it. */
  swings?: boolean;
  /** Mostly glass: light shafts and a night glow come through. Absent for solid doors. */
  glazed?: boolean;
};

const d = (label: string, hint: string, w: number, h: number, wide: number, tall: number, extra: Partial<StyleDef> = {}): StyleDef => ({ type: "door", label, hint, w, h, sill: 0, wide, tall, ...extra });
const win = (label: string, hint: string, w: number, h: number, sill: number, wide: number, tall: number, extra: Partial<StyleDef> = {}): StyleDef => ({ type: "window", label, hint, w, h, sill, wide, tall, glazed: true, ...extra });

/** Every door and window look. The first of each type is what an opening without a `style` is. */
export const OPENING_STYLES: Record<OpeningStyle, StyleDef> = {
  single: d("Single door", "A normal hinged door", 0.9, 2.1, 1.0, 2.3, { swings: true }),
  double: d("Double door", "Two hinged leaves", 1.6, 2.1, 1.8, 2.3, { swings: true }),
  slidingGlass: d("Patio door", "Glass door that slides sideways", 1.8, 2.15, 2.4, 2.35, { glazed: true }),
  pocket: d("Sliding door", "A barn-style door that slides along the wall", 0.95, 2.1, 1.2, 2.3),
  french: d("French door", "Two glass leaves with small panes", 1.4, 2.15, 1.8, 2.35, { swings: true, glazed: true }),
  arch: d("Arched opening", "A rounded doorway with no door", 1.0, 2.3, 1.4, 2.5),
  passage: d("Open doorway", "A plain gap, no door", 1.0, 2.1, 1.6, 2.3),
  garageSectional: d("Garage door", "Rolls up in panels", 2.5, 2.1, 4.8, 2.3),
  garageRoller: d("Roller shutter", "Rolls up into a box above", 2.5, 2.1, 4.8, 2.3),
  sidelight: d("Door with side window", "Entrance door with a glass panel next to it", 1.3, 2.1, 1.5, 2.3, { swings: true }),
  folding: d("Folding door", "Panels that fold to the side", 2.4, 2.15, 3.6, 2.35, { glazed: true }),
  gate: d("Garden gate", "A swing gate for a fence or garden wall", 1.0, 1.0, 1.2, 1.2, { swings: true }),
  wicket: d("Small gate", "A narrow wicket gate, 0.8 m wide", 0.8, 1.0, 1.0, 1.2, { swings: true }),
  casement: win("Window", "Opens like a door on a side hinge", 1.2, 1.2, 0.9, 1.8, 1.5, { swings: true }),
  twin: win("Double window", "Two side-hinged sashes", 1.5, 1.3, 0.85, 2.0, 1.5, { swings: true }),
  picture: win("Fixed window", "A big pane that does not open", 1.8, 1.4, 0.7, 2.6, 1.7),
  sliding: win("Sliding window", "One sash slides past the other", 1.6, 1.2, 0.9, 2.2, 1.4),
  tiltTurn: win("Tilt and turn", "Tips in at the top or turns open", 0.9, 1.3, 0.85, 1.2, 1.5, { swings: true }),
  bay: win("Bay window", "Sticks out of the wall", 2.0, 1.4, 0.6, 2.8, 1.7),
  arched: win("Arched window", "Round top", 0.9, 1.5, 0.8, 1.2, 1.8),
  round: win("Round window", "A porthole", 0.8, 0.8, 1.2, 1.1, 1.1),
  highWindow: win("High window", "A strip of glass up near the ceiling", 1.8, 0.5, 1.9, 2.6, 0.6),
  glassBlock: win("Glass blocks", "Light comes through, you cannot see through", 1.2, 0.6, 1.6, 1.8, 0.8),
  shopfront: win("Shop front", "Floor-to-ceiling glass", 3.0, 2.3, 0, 4.0, 2.5),
};

/** Gallery order: what the user sees, most common first. */
export const STYLES_OF: Record<OpeningType, OpeningStyle[]> = {
  door: ["single", "double", "slidingGlass", "french", "sidelight", "pocket", "folding", "arch", "passage", "garageSectional", "garageRoller", "gate", "wicket"],
  window: ["casement", "twin", "picture", "sliding", "tiltTurn", "bay", "arched", "round", "highWindow", "glassBlock", "shopfront"],
};

/** The look an opening really has: its `style` when that belongs to its type, else the plain single door / casement window (so old plans and a door turned into a window stay valid). */
export function styleOf(o: { type: OpeningType; style?: OpeningStyle }): OpeningStyle {
  return o.style && OPENING_STYLES[o.style]?.type === o.type ? o.style : STYLES_OF[o.type][0];
}
export const styleDef = (o: { type: OpeningType; style?: OpeningStyle }): StyleDef => OPENING_STYLES[styleOf(o)];

/** Does this opening have a hinged leaf that swings into a room? */
export const swings = (o: { type: OpeningType; style?: OpeningStyle }) => !!styleDef(o).swings;

/** Styles with no hinge that still have a "side": the leaf slides or folds toward the chosen end. */
export const HANDED: readonly OpeningStyle[] = ["slidingGlass", "pocket", "folding", "sliding"];

type SizeChip = "Standard" | "Wide" | "Tall";
export const SIZE_CHIPS: readonly SizeChip[] = ["Standard", "Wide", "Tall"];
export type OpeningDims = { width: number; height: number; sill: number };

/** Width, height and sill for a style at one of the three chip sizes: Wide changes only the width, Tall only the height. */
export function styleSize(style: OpeningStyle, chip: SizeChip = "Standard"): OpeningDims {
  const s = OPENING_STYLES[style];
  const height = chip === "Tall" ? s.tall : s.h;
  return { width: chip === "Wide" ? s.wide : s.w, sill: s.sill, height: clamp(height, MIN_OPENING, WALL_H - s.sill) };
}

/** Which chip the current size equals (within a centimetre), if any. */
export function chipOf(style: OpeningStyle, o: OpeningDims): SizeChip | null {
  return SIZE_CHIPS.find((c) => {
    const z = styleSize(style, c);
    return Math.abs(z.width - o.width) < 0.01 && Math.abs(z.height - o.height) < 0.01 && Math.abs(z.sill - o.sill) < 0.01;
  }) ?? null;
}

/**
 * What to change when the user swaps an opening to another style: the style itself, plus the new style's size when the old size was one of its
 * chips (Standard / Wide / Tall); a hand-typed size is kept. Works on an opening or on the "next one" defaults.
 */
export function restyle(cur: { type: OpeningType; style?: OpeningStyle } & OpeningDims, next: OpeningStyle): { style: OpeningStyle } & Partial<OpeningDims> {
  const chip = chipOf(styleOf(cur), cur);
  return { style: next, ...(chip ? styleSize(next, chip) : {}) };
}

/** Glass looks the user can pick. Absent tint = clear blue-grey. */
export const GLASS_TINTS: Record<GlassTint | "clear", { label: string; color: string; opacity: number }> = {
  clear: { label: "Clear", color: "#9bb8cc", opacity: 0.28 },
  dark: { label: "Dark", color: "#3d4a55", opacity: 0.55 },
  bronze: { label: "Bronze", color: "#8a7355", opacity: 0.42 },
  green: { label: "Green", color: "#6f9a88", opacity: 0.38 },
  frosted: { label: "Frosted", color: "#dfe8ee", opacity: 0.7 },
};

/** Frame colours offered as swatches. `undefined` colour = the style's own default. */
export const FRAME_COLORS: { label: string; color: string }[] = [
  { label: "White", color: "#f4f2ee" },
  { label: "Anthracite", color: "#3a3d44" },
  { label: "Black", color: "#1c1d21" },
  { label: "Wood", color: "#8a6a4a" },
  { label: "Grey", color: "#8a9099" },
  { label: "Green", color: "#2f5d4a" },
  { label: "Blue", color: "#2f4b6e" },
  { label: "Red", color: "#8e2f2a" },
];

export const FRAME_LIGHT = "#e8e4dc"; // painted white frames (doors, French doors, passages)
export const FRAME_DARK = "#3a3d44"; // dark window frames and patio doors
const LEAF_WOOD = "#8a6a4a";

/** What a frame is drawn in when the user picked no colour: one entry per style, so the swatches, the free picker and the 3D scene agree on it. */
const DEFAULT_FRAME: Record<OpeningStyle, string> = {
  single: FRAME_LIGHT, double: FRAME_LIGHT, slidingGlass: FRAME_DARK, pocket: LEAF_WOOD, french: FRAME_LIGHT, arch: FRAME_LIGHT, passage: FRAME_LIGHT,
  garageSectional: "#d9d6cf", garageRoller: "#9aa0a8", sidelight: FRAME_LIGHT, folding: FRAME_DARK, gate: "#f4f1ea", wicket: "#4a5d46",
  casement: FRAME_DARK, twin: FRAME_DARK, picture: FRAME_DARK, sliding: FRAME_DARK, tiltTurn: FRAME_DARK, bay: FRAME_DARK, arched: FRAME_DARK, round: FRAME_DARK,
  highWindow: FRAME_DARK, glassBlock: "#c9c5bd", shopfront: FRAME_DARK,
};

/** The colour of an opening's frame: the one the user chose, else its style's own. Glass, handles, sills and reveals keep colours of their own. */
export const frameColor = (o: { type: OpeningType; style?: OpeningStyle; color?: string }): string => o.color ?? DEFAULT_FRAME[styleOf(o)];

/**
 * Which way a wall's room side points: +1 = local +z (plan normal (-uy, ux)), -1 = the other. Mirrors what the 3D scene uses so the plan symbol
 * and the model agree (a bay window sticks out the opposite way). `plan` must hold the opening's level only.
 */
export function inwardSign(plan: Plan, wall: Wall, t: number): 1 | -1 {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
  const ux = (wall.b.x - wall.a.x) / len;
  const uy = (wall.b.y - wall.a.y) / len;
  const x = wall.a.x + ux * len * t;
  const y = wall.a.y + uy * len * t;
  const at = (k: number) => roomAt(plan, x - uy * 0.4 * k, y + ux * 0.4 * k);
  const a = at(1);
  const b = at(-1);
  const outdoor = (r?: Room) => !!r && (r.floor === "grass" || r.floor === "brick");
  if (a && b) return outdoor(a) && !outdoor(b) ? -1 : 1;
  return b && !a ? -1 : 1;
}

const NEAR = 0.2; // m: an opening belongs to a room whose rectangle is this close to the opening's centre
const SIDE = 0.25; // m: probe distance either side of the wall to tell an outside wall from an inner one

type OpenOpening = {
  opening: Opening;
  /** Ids of the (parent) rooms the opening serves: usually one, two for a door between rooms. */
  roomIds: string[];
  /** Room names, same order. */
  rooms: string[];
  /** Faces the outside: only one side of the wall is inside a room. Rain comes in through these. */
  exterior: boolean;
  entity: string;
};

const gap = (r: Room, x: number, y: number) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
const root = (plan: Plan, r: Room) => plan.rooms.find((p) => p.id === r.parent) ?? r;

/** Rooms an opening serves (nearest first within tolerance) and whether it faces the outside. */
export function openingRooms(plan: Plan, o: Opening): { rooms: Room[]; exterior: boolean } {
  const wall = plan.walls.find((w) => w.id === o.wallId);
  if (!wall) return { rooms: [], exterior: false };
  const x = wall.a.x + (wall.b.x - wall.a.x) * o.t;
  const y = wall.a.y + (wall.b.y - wall.a.y) * o.t;
  const near = plan.rooms.map((r) => ({ r, d: gap(r, x, y) })).filter((c) => c.d <= NEAR).sort((a, b) => a.d - b.d);
  const best = near[0]?.d ?? 0;
  // a window serves the room it looks into; a door may join two rooms
  const picked = near.filter((c) => (o.type === "door" ? true : c.d <= best + 0.05)).map((c) => root(plan, c.r));
  const rooms = [...new Set(picked)];
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
  const nx = -(wall.b.y - wall.a.y) / len;
  const ny = (wall.b.x - wall.a.x) / len;
  const inside = [1, -1].filter((s) => plan.rooms.some((r) => gap(r, x + nx * SIDE * s, y + ny * SIDE * s) === 0)).length;
  return { rooms, exterior: inside === 1 };
}

/** Doors and windows linked to a contact sensor or cover that currently reads open. */
export function openOpenings(plan: Plan, states: Record<string, HAState>): OpenOpening[] {
  const out: OpenOpening[] = [];
  for (const opening of plan.openings) {
    if (!opening.entity || !isOpenState(states[opening.entity])) continue;
    const { rooms, exterior } = openingRooms(plan, opening);
    out.push({ opening, roomIds: rooms.map((r) => r.id), rooms: rooms.map((r) => r.name), exterior, entity: opening.entity });
  }
  return out;
}
