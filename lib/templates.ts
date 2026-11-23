import { ADDITIONS } from "./additions.ts";
import { CATALOG } from "./catalog.ts";
import { DEFAULT_LEVEL_HEIGHT, GROUND_ID, levelIdOf, levelsOf } from "./levels.ts";
import { FLOOR_COLORS } from "./palette.ts";
import { H, boxWalls, mergeSegs, openingOn, r3, room, settle, door, win, type Door, type Rect, type Seg, type Spec } from "./starterPlan.ts";
import { isOpenAir } from "./stairs.ts";
import type { BuildingType, FloorKind, Level, Plan } from "./types.ts";
import { uid } from "./uid.ts";

/** Starting points for the "New plan" panel. Every `build` returns a fresh plan (new ids), so a template is never shared between plans. */
export type Template = { id: string; name: string; summary: string; build: () => Plan };

type Content = Pick<Plan, "walls" | "openings" | "rooms" | "items">;
type Def = [name: string, r: Rect, floor: FloorKind];
type Side = "n" | "e" | "s" | "w";

/**
 * One storey from its room rectangles: walls close every indoor room (a wall between two rooms exists once, on the
 * centre line half a wall thickness outside both floors), openings and furniture are attached to those walls, `brick` makes
 * the outer shell brick. Grass rooms (gardens) get no walls.
 */
function storey(level: string, defs: Def[], doors: Door[], specs: Spec[], brick = false): Content {
  const indoor = defs.filter(([, , floor]) => floor !== "grass").map(([, r]) => r);
  const bb = { x0: r3(Math.min(...indoor.map((r) => r.x)) - H), y0: r3(Math.min(...indoor.map((r) => r.y)) - H), x1: r3(Math.max(...indoor.map((r) => r.x + r.w)) + H), y1: r3(Math.max(...indoor.map((r) => r.y + r.h)) + H) };
  const walls = mergeSegs(indoor.flatMap((r) => boxWalls(r)).map((s) => s.map(r3) as Seg)).map(([x1, y1, x2, y2]) => {
    const shell = x1 === x2 ? x1 === bb.x0 || x1 === bb.x1 : y1 === bb.y0 || y1 === bb.y1;
    return { id: uid(), a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: brick && shell ? ("brick" as const) : ("plaster" as const), level };
  });
  return {
    walls,
    rooms: defs.map(([name, r, floor]) => room(name, r, floor, FLOOR_COLORS[floor], { level })),
    openings: doors.map((d) => ({ ...openingOn(walls, d), level })),
    items: specs.map((s) => ({ ...settle(s, walls), level })),
  };
}

function assemble(type: BuildingType, levels: Level[], storeys: Content[]): Plan {
  return {
    walls: storeys.flatMap((s) => s.walls),
    openings: storeys.flatMap((s) => s.openings),
    rooms: storeys.flatMap((s) => s.rooms),
    items: storeys.flatMap((s) => s.items),
    bearing: 0,
    building: { type },
    levels,
    // the owner's flat gets pieces merged in on load (lib/additions.ts); a new plan must never receive them
    added: ADDITIONS.map((a) => a.key),
  };
}

const ground: Level = { id: GROUND_ID, name: "Ground floor", elevation: 0, height: DEFAULT_LEVEL_HEIGHT };
const first: Level = { id: "L1", name: "First floor", elevation: DEFAULT_LEVEL_HEIGHT, height: DEFAULT_LEVEL_HEIGHT };

/** A piece of furniture with its back on a room's wall; `at` = distance of its centre along that wall from the room's west (n, s) or north (e, w) corner. */
function against(r: Rect, side: Side, kind: string, at: number): Spec {
  const half = CATALOG[kind].d / 2;
  if (side === "n") return { kind, x: r.x + at, y: r.y + half };
  if (side === "s") return { kind, x: r.x + at, y: r.y + r.h - half, rot: 180 };
  if (side === "w") return { kind, x: r.x + half, y: r.y + at, rot: 270 };
  return { kind, x: r.x + r.w - half, y: r.y + at, rot: 90 };
}
const light = (r: Rect, dx = 0, dy = 0): Spec => ({ kind: "ceiling_light", x: r.x + r.w / 2 + dx, y: r.y + r.h / 2 + dy });
const at = (kind: string, x: number, y: number, rot = 0): Spec => ({ kind, x, y, rot });

const blankApartment = (): Plan => assemble("apartment", [ground], [{ walls: [], openings: [], rooms: [], items: [] }]);
const blankHouse = (): Plan => assemble("house", [ground, first], [{ walls: [], openings: [], rooms: [], items: [] }, { walls: [], openings: [], rooms: [], items: [] }]);

/** About 28 m2: one room to live and sleep in with a kitchenette, a bathroom and the entrance hall. */
function studio(): Plan {
  const living: Rect = { x: 0, y: 0, w: 4.2, h: 4.6 };
  const bath: Rect = { x: 4.32, y: 0, w: 1.9, h: 2.4 };
  const hall: Rect = { x: 4.32, y: 2.52, w: 1.9, h: 2.08 };
  const L = GROUND_ID;
  return assemble("apartment", [ground], [
    storey(L, [["Living & sleeping", living, "wood"], ["Bathroom", bath, "tile"], ["Hall", hall, "wood"]], [
      door(5.27, 4.66, 0.9, "start", "left"), // entrance, opens into the hall
      door(4.26, 3.8, 0.8, "start", "right"), // hall -> living, opens into the living room
      door(5.27, 2.46, 0.7, "start", "left"), // hall -> bathroom
      win(3.0, 4.66, 1.4, 1.2, 0.9),
      win(-0.06, 3.2, 1.0, 1.2, 0.9),
      win(6.28, 1.2, 0.6, 0.6, 1.2),
      win(6.28, 3.6, 0.6, 0.8, 1.0),
    ], [
      against(living, "w", "malm_bed", 1.2),
      against(living, "w", "malm_night", 2.4),
      against(living, "n", "wardrobe", 2.8),
      against(living, "e", "fridge", 0.4),
      against(living, "e", "sink_unit", 1.6),
      against(living, "e", "stove", 2.82),
      against(living, "s", "ektorp", 2.0),
      at("lack_coffee", 2.5, 3.0),
      at("rug", 2.6, 2.9),
      light(living),
      against(bath, "n", "bathtub", 0.95),
      against(bath, "e", "toilet", 1.4),
      against(bath, "w", "basin", 1.4),
      light(bath),
      against(hall, "w", "shoe_rack", 0.45),
      at("door_mat", 5.27, 4.3),
      light(hall),
    ]),
  ]);
}

/** About 60 m2: open living and kitchen, two bedrooms, bathroom and hall. */
function twoBedroom(): Plan {
  const living: Rect = { x: 0, y: 0, w: 5.6, h: 4.0 };
  const bed2: Rect = { x: 5.72, y: 0, w: 3.2, h: 4.0 };
  const bed1: Rect = { x: 0, y: 4.12, w: 3.8, h: 2.88 };
  const hall: Rect = { x: 3.92, y: 4.12, w: 2.0, h: 2.88 };
  const bath: Rect = { x: 6.04, y: 4.12, w: 2.88, h: 2.88 };
  return assemble("apartment", [ground], [
    storey(GROUND_ID, [["Living & kitchen", living, "wood"], ["Bedroom 2", bed2, "wood"], ["Bedroom 1", bed1, "wood"], ["Hall", hall, "wood"], ["Bathroom", bath, "tile"]], [
      door(4.7, 7.06, 0.9, "start", "left"), // entrance, opens into the hall
      door(4.6, 4.06, 0.9, "end", "left"), // hall -> living
      door(3.86, 5.6, 0.8, "start", "right"), // hall -> bedroom 1
      door(5.98, 5.6, 0.8, "start", "left"), // hall -> bathroom
      door(5.66, 3.0, 0.8, "start", "left"), // living -> bedroom 2
      win(4.6, -0.06, 1.4, 1.2, 0.9),
      win(-0.06, 2.2, 1.4, 1.2, 0.9),
      win(8.98, 1.6, 1.2, 1.2, 0.9),
      win(2.0, 7.06, 1.4, 1.2, 0.9),
      win(8.98, 6.2, 0.6, 0.6, 1.2),
      win(5.62, 7.06, 0.4, 0.8, 1.0),
    ], [
      against(living, "n", "fridge", 0.4),
      against(living, "n", "base_cabinet", 1.0),
      against(living, "n", "sink_unit", 2.0),
      against(living, "n", "stove", 2.9),
      at("dining_table", 3.3, 2.0),
      at("dining_chair", 2.9, 1.2),
      at("dining_chair", 3.7, 1.2),
      at("dining_chair", 2.9, 2.85, 180),
      at("dining_chair", 3.7, 2.85, 180),
      against(living, "w", "ektorp", 2.6),
      at("lack_coffee", 1.6, 2.6),
      at("rug", 2.2, 2.6),
      against(living, "e", "besta_tv", 1.2),
      at("plant", 5.35, 3.75),
      light(living, 0, 0.2),
      against(bed2, "n", "bed_frame", 1.7),
      against(bed2, "n", "malm_night", 0.4),
      against(bed2, "n", "malm_night", 3.0),
      against(bed2, "e", "pax", 3.0),
      light(bed2, 0, 0.6),
      against(bed1, "w", "malm_bed", 1.5),
      against(bed1, "w", "malm_night", 0.4),
      against(bed1, "w", "malm_night", 2.6),
      against(bed1, "n", "wardrobe", 2.9),
      light(bed1, 0.4, 0),
      against(hall, "w", "shoe_rack", 0.6),
      against(hall, "e", "coat_rack", 0.6),
      at("door_mat", 4.7, 6.6),
      light(hall),
      against(bath, "n", "washer", 0.4),
      against(bath, "e", "basin", 0.5),
      against(bath, "e", "toilet", 1.2),
      against(bath, "s", "bathtub", 1.7),
      light(bath),
    ]),
  ]);
}

/** About 120 m2 per floor: living, kitchen, hall, WC, utility and study with a garden on the ground floor, four bedrooms and a bathroom upstairs. */
function familyHouse(): Plan {
  return assemble("house", [ground, first], [familyGroundFloor(), familyFirstFloor()]);
}

function familyGroundFloor(): Content {
  const living: Rect = { x: 0, y: 0, w: 5.6, h: 5.2 };
  const kitchen: Rect = { x: 5.72, y: 0, w: 6.28, h: 5.2 };
  const wc: Rect = { x: 0, y: 5.32, w: 2.2, h: 2.0 };
  const utility: Rect = { x: 0, y: 7.44, w: 2.2, h: 2.56 };
  const hall: Rect = { x: 2.32, y: 5.32, w: 3.6, h: 4.68 };
  const study: Rect = { x: 6.04, y: 5.32, w: 5.96, h: 4.68 };
  const garden: Rect = { x: -2, y: 10.12, w: 16, h: 5 };

  return storey(GROUND_ID, [["Living room", living, "wood"], ["Kitchen & dining", kitchen, "wood"], ["WC", wc, "tile"], ["Utility", utility, "tile"], ["Hall", hall, "wood"], ["Study", study, "wood"], ["Garden", garden, "grass"]], [
    door(4.12, 10.06, 1.0, "start", "left"), // front door, opens into the hall
    door(3.5, 5.26, 0.9, "start", "left"), // hall -> living
    door(5.66, 2.6, 1.0, "start", "left"), // living -> kitchen
    door(2.26, 6.3, 0.8, "start", "right"), // hall -> WC
    door(2.26, 8.7, 0.8, "start", "right"), // hall -> utility
    door(5.98, 8.3, 0.9, "start", "left"), // hall -> study
    win(3.7, -0.06, 1.4, 1.2, 0.9),
    win(-0.06, 2.6, 1.6, 1.2, 0.9),
    win(10.6, -0.06, 1.4, 1.2, 0.9),
    win(12.06, 2.6, 1.4, 1.2, 0.9),
    win(-0.06, 6.3, 0.6, 0.5, 1.4),
    win(-0.06, 8.7, 0.8, 0.6, 1.1),
    win(5.3, 10.06, 0.6, 1.0, 0.9),
    win(10.8, 10.06, 1.2, 1.2, 0.9),
    win(12.06, 6.3, 1.0, 1.2, 0.9),
  ], [
    against(living, "n", "besta_tv", 1.4),
    against(living, "n", "billy", 5.0),
    against(living, "s", "ektorp", 1.8),
    at("lack_coffee", 1.8, 3.0),
    at("rug", 1.8, 2.8),
    at("poang", 4.4, 2.6),
    at("floor_lamp", 0.3, 4.9),
    at("plant", 5.2, 4.8),
    light(living, 0, 0),
    against(kitchen, "n", "fridge", 0.4),
    against(kitchen, "n", "base_cabinet", 1.0),
    against(kitchen, "n", "sink_unit", 2.0),
    against(kitchen, "n", "stove", 2.95),
    against(kitchen, "n", "base_cabinet", 3.55),
    at("dining_table", 9.2, 3.0),
    at("dining_chair", 8.8, 2.2),
    at("dining_chair", 9.6, 2.2),
    at("dining_chair", 8.8, 3.8, 180),
    at("dining_chair", 9.6, 3.8, 180),
    at("plant", 11.6, 4.7),
    light(kitchen, 0, 0.4),
    against(wc, "w", "toilet", 1.0),
    against(wc, "n", "basin", 1.4),
    light(wc),
    against(utility, "n", "washer", 0.45),
    against(utility, "n", "base_cabinet", 1.1),
    against(utility, "s", "tall_cabinet", 0.4),
    light(utility),
    against(hall, "e", "shoe_rack", 1.3),
    against(hall, "e", "coat_rack", 3.9),
    at("plant", 2.7, 9.6),
    at("door_mat", 4.12, 9.5),
    light(hall, 0, -0.6),
    against(study, "s", "desk_led", 2.0),
    at("desk_chair", 8.04, 8.7),
    against(study, "e", "bed_frame", 2.7),
    against(study, "e", "malm_night", 1.7),
    against(study, "e", "malm_night", 3.7),
    against(study, "w", "pax", 1.2),
    against(study, "n", "bookcase", 2.0),
    against(study, "n", "bookcase", 3.0),
    light(study, 0, -0.5),
    at("tree_round", -0.4, 13.0),
    at("tree_conifer", 13.2, 13.0),
    at("bush", 1.6, 10.7),
    at("bush", 6.9, 10.7),
    at("flower_bed", 9.5, 10.6),
    at("paving", 4.12, 11.4),
    at("stepping_stones", 4.12, 13.2, 90),
    at("garden_shed", 12.3, 11.4),
    at("patio_table", 10.5, 13.2),
    at("patio_chair", 9.6, 13.2),
    at("patio_chair", 11.4, 13.2),
    at("bench", 6.5, 12.6),
    ...[1, 3, 5].map((x) => at("hedge", x, 14.7)),
  ], true);
}

function familyFirstFloor(): Content {
  const master: Rect = { x: 0, y: 0, w: 5.4, h: 4.4 };
  const bath: Rect = { x: 5.52, y: 0, w: 3.0, h: 4.4 };
  const bed2: Rect = { x: 8.64, y: 0, w: 3.36, h: 4.4 };
  const landing: Rect = { x: 0, y: 4.52, w: 12, h: 1.4 };
  const bed3: Rect = { x: 0, y: 6.04, w: 5.9, h: 3.96 };
  const bed4: Rect = { x: 6.02, y: 6.04, w: 5.98, h: 3.96 };
  return storey("L1", [["Master bedroom", master, "wood"], ["Bathroom", bath, "tile"], ["Bedroom 2", bed2, "wood"], ["Landing", landing, "wood"], ["Bedroom 3", bed3, "wood"], ["Bedroom 4", bed4, "wood"]], [
    door(1.3, 4.46, 0.9, "start", "left"), // landing -> master bedroom
    door(7.0, 4.46, 0.8, "start", "left"), // landing -> bathroom
    door(10.3, 4.46, 0.9, "start", "left"), // landing -> bedroom 2
    door(2.95, 5.98, 0.9, "start", "right"), // landing -> bedroom 3
    door(9.0, 5.98, 0.9, "start", "right"), // landing -> bedroom 4
    win(2.7, -0.06, 1.6, 1.2, 0.9),
    win(-0.06, 2.2, 1.4, 1.2, 0.9),
    win(7.9, -0.06, 0.6, 0.6, 1.2),
    win(12.06, 2.2, 1.2, 1.2, 0.9),
    win(12.06, 5.22, 0.8, 1.2, 0.9),
    win(-0.06, 5.22, 0.8, 1.2, 0.9),
    win(-0.06, 8.0, 1.2, 1.2, 0.9),
    win(4.8, 10.06, 1.2, 1.2, 0.9),
    win(11.0, 10.06, 1.4, 1.2, 0.9),
    win(12.06, 8.0, 1.4, 1.2, 0.9),
  ], [
    against(master, "e", "malm_bed", 2.2),
    against(master, "e", "malm_night", 1.13),
    against(master, "e", "malm_night", 3.27),
    against(master, "s", "wardrobe", 3.0),
    against(master, "s", "pax", 4.4),
    against(master, "n", "hemnes_chest", 4.5),
    light(master, -0.2, 0),
    against(bath, "n", "bathtub", 1.0),
    against(bath, "e", "toilet", 1.8),
    against(bath, "e", "godmorgon", 3.0),
    against(bath, "w", "washer", 2.0),
    light(bath),
    against(bed2, "n", "bed_frame", 1.4),
    against(bed2, "n", "malm_night", 0.4),
    against(bed2, "n", "malm_night", 2.45),
    against(bed2, "w", "wardrobe", 3.0),
    light(bed2, 0, 0.4),
    at("plant", 1.0, 5.22),
    at("plant", 11.0, 5.22),
    light(landing, -3),
    light(landing, 3),
    against(bed3, "s", "malm_bed", 1.8),
    against(bed3, "s", "malm_night", 0.5),
    against(bed3, "s", "malm_night", 3.1),
    against(bed3, "n", "pax", 5.0),
    against(bed3, "e", "micke", 1.96),
    at("desk_chair", 5.0, 8.0, 270),
    light(bed3, 0.2, 0),
    against(bed4, "s", "bed_frame", 3.4),
    against(bed4, "s", "malm_night", 2.2),
    against(bed4, "s", "malm_night", 4.7),
    against(bed4, "w", "pax", 1.3),
    against(bed4, "e", "micke", 1.96),
    at("desk_chair", 11.0, 8.0, 270),
    light(bed4),
  ], true);
}

export const TEMPLATES: readonly Template[] = [
  { id: "blank-apartment", name: "Blank apartment", summary: "One empty level: draw the walls yourself.", build: blankApartment },
  { id: "blank-house", name: "Blank house", summary: "Ground and first floor, both empty.", build: blankHouse },
  { id: "studio", name: "Studio flat", summary: "One room to live and sleep in, kitchenette, bathroom.", build: studio },
  { id: "two-bedroom", name: "Two-bedroom flat", summary: "Open living and kitchen, two bedrooms, bathroom.", build: twoBedroom },
  { id: "family-house", name: "Family house", summary: "Two floors with a garden, four bedrooms, brick shell.", build: familyHouse },
];

/** Indoor floor area (m2) of the biggest storey: what a buyer calls the footprint. Open-air rooms (gardens, balconies) and alcove strips are not counted. */
export function footprintArea(plan: Plan): number {
  const per = levelsOf(plan).map((l) => plan.rooms.filter((r) => levelIdOf(plan, r) === l.id && !r.parent && !isOpenAir(r)).reduce((a, r) => a + r.w * r.h, 0));
  return Math.max(0, ...per);
}
