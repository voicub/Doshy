import { CATALOG } from "./catalog.ts";
import { WALL_T } from "./geometry.ts";
import { clearWalls, classify, mountOnWall, snapToWalls } from "./placement.ts";
import type { FloorKind, Item, Opening, Plan, Room, Wall } from "./types.ts";
import { uid } from "./uid.ts";
import { applyAdditions } from "./additions.ts";

/** Bump when the starter flat changes: the store migration replaces plans saved from an older starter. */
export const STARTER_VERSION = 15;

/** Compass bearing of the plan's up direction: the starter plan has the entrance corridor facing SSE (156 deg) and the balcony side NNW. */
const APARTMENT_BEARING = 156;

/**
 * The user's real flat after the architect's plan "Ap.5" (metres, x east / y south, north up).
 * Room sizes are INSIDE floor dimensions (living column and hall measured by the user, others from the plan);
 * walls are centre lines pushed out by half a wall thickness so the inside comes out exact.
 * Rooms sit WALL_T apart, which is the wall between them. Relocate a room by changing its ORIGIN below
 * (or drag it in the editor).
 */
export const H = WALL_T / 2;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export type Rect = { x: number; y: number; w: number; h: number };
const LIVING: Rect = { x: 0, y: 0, w: 2.67, h: 6.4 }; // west column: lounge at the top, kitchen run on the west wall, dining at the bottom
const ORIGIN_HALL = { x: LIVING.x + LIVING.w + WALL_T, y: 0 }; // open to the living column along its west side
const HALL_SIZE = { w: 4.0, h: 1.63 };
const ORIGIN_OFFICE = { x: ORIGIN_HALL.x, y: ORIGIN_HALL.y + HALL_SIZE.h + WALL_T };
const BEDROOM_ARM = { w: 1.01, h: 1.58 };
// The arm's east face lines up with the hall's east face, so the bathroom's west wall is also the arm's east wall: ONE wall between them.
const ORIGIN_BEDROOM_ARM = { x: ORIGIN_HALL.x + HALL_SIZE.w - BEDROOM_ARM.w, y: ORIGIN_OFFICE.y }; // its north wall is the hall's south wall
// The office takes the slack: 2.87 wide where the architect plan says 2.70 (its figures are 17 cm short of the measured hall + bedroom arm); 4.65 deep (plan: 4.85) so its south wall lines up with the living column.
const OFFICE_SIZE = { w: ORIGIN_BEDROOM_ARM.x - WALL_T - ORIGIN_OFFICE.x, h: LIVING.y + LIVING.h - ORIGIN_OFFICE.y };
const BEDROOM_MAIN = { w: 3.15, h: 3.07 };
const ORIGIN_BEDROOM = { x: ORIGIN_BEDROOM_ARM.x, y: LIVING.y + LIVING.h - BEDROOM_MAIN.h }; // south wall in line with the rest
const BATH_SIZE = { w: 1.76, h: 2.59 };
const ORIGIN_BATHROOM = { x: ORIGIN_HALL.x + HALL_SIZE.w + WALL_T, y: 0 }; // east of the hall
const BALCONY: Rect = { x: -0.2, y: 6.58, w: 3.6, h: 1.55 };

export type Seg = [number, number, number, number]; // x1, y1, x2, y2 (axis-aligned centre line)

/** Four walls around an inside rectangle; `skip` drops sides that belong to a neighbour or stay open. */
export function boxWalls(r: Rect, skip: ("n" | "e" | "s" | "w")[] = []): Seg[] {
  const [x0, y0, x1, y1] = [r.x - H, r.y - H, r.x + r.w + H, r.y + r.h + H];
  const all: Record<string, Seg> = { n: [x0, y0, x1, y0], e: [x1, y0, x1, y1], s: [x0, y1, x1, y1], w: [x0, y0, x0, y1] };
  return Object.entries(all).filter(([k]) => !skip.includes(k as "n")).map(([, s]) => s);
}

/** Merge collinear segments that touch or overlap so shared walls exist exactly once. */
export function mergeSegs(segs: Seg[]): Seg[] {
  const byLine = new Map<string, [number, number][]>();
  for (const [x1, y1, x2, y2] of segs) {
    const horiz = y1 === y2;
    const key = `${horiz ? "h" : "v"}${r3(horiz ? y1 : x1)}`;
    const span: [number, number] = horiz ? [Math.min(x1, x2), Math.max(x1, x2)] : [Math.min(y1, y2), Math.max(y1, y2)];
    byLine.set(key, [...(byLine.get(key) ?? []), span]);
  }
  const out: Seg[] = [];
  for (const [key, spans] of byLine) {
    const c = Number(key.slice(1));
    const merged: [number, number][] = [];
    for (const s of spans.sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], s[1]);
      else merged.push([...s]);
    }
    for (const [lo, hi] of merged) out.push(key[0] === "h" ? [lo, c, hi, c] : [c, lo, c, hi]);
  }
  return out;
}

export type Door = { x: number; y: number; type: Opening["type"]; width: number; height: number; sill: number; entity?: string; hinge?: Opening["hinge"]; swing?: Opening["swing"] };
/** `hinge`/`swing` are relative to the wall direction a -> b (see Opening). */
export const door = (x: number, y: number, width: number, hinge: Opening["hinge"], swing: Opening["swing"], height = 2.04): Door => ({ x, y, type: "door", width, height, sill: 0, hinge, swing });
export const win = (x: number, y: number, width: number, height: number, sill: number, entity?: string): Door => ({ x, y, type: "window", width, height, sill, ...(entity ? { entity } : {}) });

/** Attach an opening to the wall passing through its centre point. */
export function openingOn(walls: Wall[], d: Door): Opening {
  const w = walls.find((w) => {
    const [lox, hix, loy, hiy] = [Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x), Math.min(w.a.y, w.b.y), Math.max(w.a.y, w.b.y)];
    return d.x >= lox - 1e-6 && d.x <= hix + 1e-6 && d.y >= loy - 1e-6 && d.y <= hiy + 1e-6;
  });
  if (!w) throw new Error(`no wall under opening at ${d.x},${d.y}`);
  const horiz = w.a.y === w.b.y;
  const [lo, hi] = horiz ? [w.a.x, w.b.x] : [w.a.y, w.b.y];
  return { id: uid(), wallId: w.id, t: ((horiz ? d.x : d.y) - lo) / (hi - lo), width: d.width, type: d.type, sill: d.sill, height: d.height, ...(d.entity ? { entity: d.entity } : {}), ...(d.hinge ? { hinge: d.hinge } : {}), ...(d.swing ? { swing: d.swing } : {}) };
}

export type Spec = { kind: string; x: number; y: number; rot?: number; entity?: string; elev?: number; fixed?: true; w?: number };
const FLUSH_REACH = 0.3; // furniture drawn this close to a wall is pulled flush and squared to it

/** Build an item and settle it against the plan's walls with the same rules the editor uses when dragging. */
export function settle(s: Spec, walls: Wall[]): Item {
  const d = CATALOG[s.kind];
  if (!d) throw new Error(`unknown catalog kind ${s.kind}`);
  const f = { x: s.x, y: s.y, w: d.w, d: d.d, rot: s.rot ?? 0 };
  const cls = classify(d, s.kind);
  if (s.fixed) return { id: uid(), kind: s.kind, x: r3(s.x), y: r3(s.y), rot: s.rot ?? 0, w: s.w ?? d.w, d: d.d, h: d.h, ...(s.entity ? { entity: s.entity } : {}), ...(s.elev ? { elev: s.elev } : {}) };
  // items standing on something (elev) keep the spot they were given
  const p = cls === "mounted" ? mountOnWall(f, walls) : cls === "floor" && !s.elev ? snapToWalls(f, walls, FLUSH_REACH) : { x: f.x, y: f.y, rot: f.rot };
  const q = clearWalls({ ...f, ...p }, walls, cls);
  return { id: uid(), kind: s.kind, x: r3(q.x), y: r3(q.y), rot: p.rot, w: d.w, d: d.d, h: d.h, ...(s.entity ? { entity: s.entity } : {}), ...(s.elev ? { elev: s.elev } : {}) };
}

export const room = (name: string, r: Rect, floor: FloorKind, color: string, extra: Partial<Room> = {}): Room => ({ id: uid(), name, x: r3(r.x), y: r3(r.y), w: r.w, h: r.h, floor, color, ...extra });
const OAK_FLOOR = "#d8bf94"; // light oak planks
const BEDROOM_FLOOR = "#c8a977"; // light oak, as in the photos
const TILE_FLOOR = "#e4dccb";
const BALCONY_FLOOR = "#b9b5ad";

/** Handrail on the balcony slab's three open sides (the fourth is the building wall), in modules so the balusters keep their look. */
function balconyRailing(b: Rect): Spec[] {
  const t = CATALOG.balcony_railing.d;
  const south = Array.from({ length: 3 }, (_, i): Spec => ({ kind: "balcony_railing", x: b.x + ((i + 0.5) * b.w) / 3, y: b.y + b.h - t / 2, w: b.w / 3, fixed: true }));
  const sideLen = b.h - t; // the south railing already covers the corners
  const side = (x: number, i: number): Spec => ({ kind: "balcony_railing", x, y: b.y + ((i + 0.5) * sideLen) / 2, rot: 90, w: sideLen / 2, fixed: true });
  return [...south, ...[0, 1].map((i) => side(b.x + t / 2, i)), ...[0, 1].map((i) => side(b.x + b.w - t / 2, i))];
}

export function starterPlan(): Plan {
  // ---- rooms ----
  const hall: Rect = { ...ORIGIN_HALL, ...HALL_SIZE };
  const office: Rect = { ...ORIGIN_OFFICE, ...OFFICE_SIZE };
  const bedArm: Rect = { ...ORIGIN_BEDROOM_ARM, ...BEDROOM_ARM };
  const bedMain: Rect = { ...ORIGIN_BEDROOM, ...BEDROOM_MAIN }; // the arm sits on top of the main body's west end
  const bath: Rect = { ...ORIGIN_BATHROOM, ...BATH_SIZE };
  const bedNiche: Rect = { x: bedArm.x + bedArm.w + WALL_T, y: bath.y + bath.h + WALL_T, w: r3(bedMain.x + bedMain.w - (bedArm.x + bedArm.w + WALL_T)), h: r3(bedMain.y - (bath.y + bath.h + WALL_T)) }; // wardrobe niche under the bathroom, part of the bedroom
  const bedroom = room("Bedroom", bedMain, "wood", BEDROOM_FLOOR, { areas: ["bedroom"], tempEntity: "sensor.bedroom_climate_temperature", humidityEntity: "sensor.bedroom_climate_humidity" });
  const rooms: Room[] = [
    room("Living & kitchen", LIVING, "wood", OAK_FLOOR, { areas: ["living_room", "kitchen"], presenceEntities: ["binary_sensor.kitchen_occupancy_occupancy"] }),
    room("Hall", hall, "wood", OAK_FLOOR, { areas: ["hall"], tempEntity: "climate.flat_thermostat", presenceEntities: ["binary_sensor.hall_occupancy_occupancy"] }),
    room("Office", office, "wood", OAK_FLOOR, {
      areas: ["office"],
      tempEntity: "sensor.office_climate_temperature",
      humidityEntity: "sensor.office_climate_humidity",
      presenceEntities: ["binary_sensor.office_occupancy_occupancy", "binary_sensor.office_fp2_presence"],
      powerEntities: ["sensor.office_pc_display_power", "sensor.office_dehumidifier_power"],
    }),
    bedroom,
    room("Bedroom alcove", bedArm, "wood", BEDROOM_FLOOR, { parent: bedroom.id }),
    room("Bedroom wardrobe niche", bedNiche, "wood", BEDROOM_FLOOR, { parent: bedroom.id }),
    room("Bathroom", bath, "tile", TILE_FLOOR, { areas: ["bathroom"] }),
    room("Balcony", BALCONY, "tile", BALCONY_FLOOR, { areas: ["balcony"] }),
  ];
  const living = rooms[0];
  const balcony = rooms[rooms.length - 1];
  // Floor strips through the wall thickness: the open hall/lounge side and under every interior door (child rooms: no chip of their own).
  const strip = (name: string, parent: Room, floor: FloorKind, color: string, x0: number, y0: number, x1: number, y1: number): Room => room(name, { x: x0, y: y0, w: r3(x1 - x0), h: r3(y1 - y0) }, floor, color, { parent: parent.id });
  rooms.push(
    strip("Hall opening floor", living, "wood", OAK_FLOOR, LIVING.x + LIVING.w, hall.y, hall.x, hall.y + hall.h),
    strip("Entrance threshold", rooms[1], "wood", OAK_FLOOR, 3.59, -WALL_T, 4.49, 0),
    strip("Office door threshold", rooms[2], "wood", OAK_FLOOR, 3.0, hall.y + hall.h, 3.9, office.y),
    strip("Bedroom door threshold", bedroom, "wood", BEDROOM_FLOOR, 5.83, hall.y + hall.h, 6.73, bedArm.y),
    strip("Bathroom door threshold", rooms.find((r) => r.name === "Bathroom")!, "tile", TILE_FLOOR, hall.x + hall.w, 0.65, bath.x, 1.45),
    strip("Balcony door threshold", balcony, "tile", BALCONY_FLOOR, 0.675, LIVING.y + LIVING.h, 2.125, balcony.y),
  );

  // ---- walls (shared walls are merged; no wall between the hall and the living column) ----
  const north = -H;
  const south = LIVING.y + LIVING.h + H;
  const westX = -H;
  const livingEastX = LIVING.x + LIVING.w + H; // wall shared by the living column and the office
  const hallSouthY = hall.y + hall.h + H; // wall shared by the hall, the office and the bedroom arm
  const hallEastX = hall.x + hall.w + H; // wall shared by the hall and the bathroom
  const officeEastX = office.x + office.w + H; // wall shared by the office and the bedroom
  const armEastX = bedArm.x + bedArm.w + H;
  const bedMainNorthY = bedMain.y - H;
  const bedEastX = bedMain.x + bedMain.w + H;
  const bathEastX = bath.x + bath.w + H;
  const bathSouthY = bath.y + bath.h + H;
  const segs: Seg[] = [
    [westX, north, bathEastX, north], // entrance side: living, hall and bathroom
    [westX, north, westX, south],
    [westX, south, bedEastX, south], // living, office and bedroom south walls in one line
    [livingEastX, hallSouthY, livingEastX, south],
    [livingEastX, hallSouthY, hallEastX, hallSouthY],
    [hallEastX, north, hallEastX, bathSouthY], // hall's east end wall, then the single wall between the bathroom and the bedroom arm
    [bathEastX, north, bathEastX, bathSouthY],
    [armEastX, bathSouthY, bedEastX, bathSouthY], // the one wall between the bathroom and the bedroom
    [officeEastX, hallSouthY, officeEastX, south],
    [armEastX, bathSouthY, armEastX, bedMainNorthY], // same line as the bathroom's west wall: one wall, not two
    [bedEastX, bathSouthY, bedEastX, south],
  ];
  const walls: Wall[] = mergeSegs(segs.map((s) => s.map(r3) as Seg)).map(([x1, y1, x2, y2]) => ({ id: uid(), a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, style: "plaster" }));

  // ---- doors and windows ----
  // Door leaves open into the room they belong to (architect plan arcs and the photos). Walls run west->east or north->south.
  const openings = ([
    door(4.04, north, 0.9, "start", "right"), // apartment entrance: opens into the hall, hinges on the entry-table side
    door(3.45, hallSouthY, 0.9, "end", "right"), // hall -> office: opens into the office, hinges on the right as seen from inside
    door(6.28, hallSouthY, 0.9, "end", "right"), // hall -> bedroom: opens into the bedroom arm
    door(hallEastX, 1.05, 0.8, "end", "left"), // hall -> bathroom: opens into the bathroom against the sink wall
    door(1.4, south, 1.45, "start", "left", 2.15), // balcony French door: both leaves open into the lounge
    win(3.95, south, 0.9, 2.2, 0, "binary_sensor.office_window_contact"), // office floor-length window
    win(6.77, south, 0.9, 2.2, 0, "binary_sensor.bedroom_window_contact"), // bedroom F2
    win(7.72, south, 0.6, 2.2, 0), // bedroom F3
  ] satisfies Door[]).map((d) => openingOn(walls, d));

  // ---- furniture ----
  const specs: Spec[] = [
    // hall: the entrance, entry table, shoe cabinet and coat shelf all hang on the north wall; mirror opposite
    { kind: "lv_entry_table_marble", x: 3.25, y: 0.15 },
    { kind: "lv_doormat_black", x: 4.04, y: 0.5 },
    { kind: "lv_shoe_cabinet_oak", x: 4.85, y: 0.15 },
    { kind: "lv_network_cabinet", x: 4.85, y: 0.15 },
    { kind: "lv_fuse_box", x: 5.22, y: 0.06 },
    { kind: "lv_coat_wall", x: 6.03, y: 0.06 },
    { kind: "lv_hall_bench", x: 6.05, y: 0.2 },
    { kind: "lv_mirror_floor_black", x: 4.8, y: 1.55 },
    { kind: "lv_rug_dark_runner", x: 4.9, y: 0.95, rot: 90 },
    { kind: "lv_ceiling_round_led", x: hall.x + hall.w / 2, y: hall.h / 2, entity: "switch.hall_light" },
    { kind: "thermostat_wall", x: 5.3, y: 1.55, entity: "climate.flat_thermostat", elev: 1.5 }, // hall south wall, at hand height
    // lounge (top of the living column): corner sofa with its chaise toward the hall end, KALLAX in the north end wall
    { kind: "lv_friheten_corner", x: 0.8, y: 1.65, rot: 270 },
    { kind: "lv_kallax_oak_3x4", x: 1.89, y: 0.255 },
    { kind: "lv_art_forest_oak", x: 1.89, y: 0.05 },
    { kind: "lv_rug_shaggy_black", x: 1.45, y: 2.9 },
    { kind: "lv_coffee_table_low", x: 1.675, y: 3.3, rot: 90 },
    { kind: "lv_coffee_table_tall", x: 1.925, y: 3.6, rot: 90 },
    { kind: "lv_sideboard_oak_black", x: 2.5, y: 3.7, rot: 90 },
    { kind: "kt_microwave", x: 2.47, y: 3.7, rot: 90, elev: 0.8 },
    { kind: "lv_ceiling_square_led", x: 1.4, y: 1.6, entity: "switch.livingroom_light" },
    // dining, just inside from the balcony door
    { kind: "kt_dining_table_oak", x: 1.6, y: 5.0, rot: 90 },
    ...[[1.0, 4.75, 270], [1.0, 5.25, 270], [2.2, 4.75, 90], [2.2, 5.25, 90]].map(([x, y, rot]): Spec => ({ kind: "kt_dining_chair_dark", x, y, rot })),
    { kind: "lv_ceiling_bar_led", x: 1.5, y: 5.0, rot: 90, entity: "switch.kitchen_light" },
    { kind: "kt_ceiling_light_small", x: 1.4, y: 6.0 },
    { kind: "lv_sheer_curtain_door", x: 1.4, y: 6.38 },
    // kitchen run along the west wall, balcony corner first: boiler beside the curtain, 3-drawer, hob + oven, sink, fridge, tall cabinet
    { kind: "kt_base_drawers", x: 0.3, y: 5.825, rot: 270 },
    { kind: "kt_hob_oven", x: 0.3, y: 5.3, rot: 270 },
    { kind: "kt_sink_unit", x: 0.3, y: 4.6, rot: 270 },
    { kind: "kt_fridge_steel", x: 0.3, y: 3.9, rot: 270 },
    { kind: "kt_tall_dark", x: 0.3, y: 3.3, rot: 270 },
    { kind: "kt_wall_unit_hood", x: 0.18, y: 5.3 },
    { kind: "kt_wall_unit", x: 0.18, y: 4.7 },
    { kind: "kt_wall_unit", x: 0.18, y: 4.1 },
    { kind: "kt_backsplash", x: 0.03, y: 4.7 },
    { kind: "kt_boiler", x: 0.15, y: 6.1 },
    { kind: "kt_air_fryer", x: 0.3, y: 5.825, rot: 270, elev: 0.93 },
    { kind: "kt_kettle", x: 0.25, y: 4.35, rot: 270, elev: 0.93 },
    { kind: "kt_plant_trailing", x: 0.3, y: 3.3, elev: 2.1 },
    // office (long axis north-south; door in the north wall, window with curtain at the south end).
    // Entering facing south: the desk wall is on the left, i.e. the EAST wall (rot 90 = front faces west).
    { kind: "of_wardrobe_oak", x: 5.2, y: 2.3, rot: 90 },
    { kind: "of_alex_drawers_tall", x: 5.2, y: 2.95, rot: 90 },
    { kind: "of_desk_wood_led", x: 5.1, y: 4.1, rot: 90, entity: "light.office_desk_light" },
    { kind: "of_alex_drawers_tall", x: 5.2, y: 5.2, rot: 90 },
    { kind: "of_kallax_white_2x4", x: 5.2, y: 5.95, rot: 90 },
    { kind: "of_table_low_black", x: 4.55, y: 6.15 },
    { kind: "of_chair_ergo_grey", x: 4.5, y: 4.1, rot: 270 },
    { kind: "of_art_panorama", x: 5.4, y: 4.4, rot: 90 },
    // EKET wall modules, one item each, in two groups either side of the painting (photo IMG_4641): tall door unit, open books cube above a door cube
    ...[3.17, 5.62].map((y): Spec => ({ kind: "eket_door_35x70", x: 5.45, y, rot: 90, elev: 1.35 })),
    ...[3.52, 5.27].flatMap((y): Spec[] => [{ kind: "eket_open_35_books", x: 5.45, y, rot: 90, elev: 1.7 }, { kind: "eket_door_35", x: 5.45, y, rot: 90, elev: 1.35 }]),
    { kind: "of_wall_plant", x: 5.4, y: 3.8, rot: 90 },
    { kind: "of_wall_plant", x: 5.4, y: 5.0, rot: 90 },
    // west wall, door end to window: white chest, LACK-style printer table, bean bag; gap; mini desk (drawer cabinet at the door end) with two open EKET cubes above
    { kind: "of_desk_mini", x: 3.04, y: 5.01, rot: 270, entity: "light.office_mini_desk" },
    { kind: "of_desk_lamp_small", x: 2.98, y: 5.5, rot: 270, elev: 0.78 },
    { kind: "eket_open_35", x: 2.9, y: 5.01, rot: 270, elev: 1.3 },
    { kind: "eket_open_35", x: 2.9, y: 5.01, rot: 270, elev: 1.65 },
    { kind: "echo_dot", x: 5.5, y: 4.6, entity: "media_player.office_echo_dot", elev: 0.75 },
    { kind: "of_chest_white_3", x: 3.0, y: 2.9, rot: 270 }, // west wall, clear of the door swing
    { kind: "of_bean_bag", x: 3.9, y: 3.3 },
    { kind: "of_printer_3d", x: 3.0, y: 3.85, rot: 270 },
    { kind: "of_rug_geo", x: 4.2, y: 4.3, rot: 90 },
    { kind: "of_hektar_stand", x: 3.45, y: 6.1 },
    { kind: "of_dehumidifier", x: 2.89, y: 5.95, rot: 270, entity: "humidifier.office_dehumidifier", fixed: true },
    { kind: "of_curtain_grey_sheer", x: 3.95, y: 6.38 },
    { kind: "of_ceiling_round", x: 4.14, y: 4.07, entity: "light.office_ambient_lights" },
    // bedroom: wardrobe on the bathroom wall, bed with its head on the east wall, TV on the west wall (photos)
    { kind: "bd_wardrobe_sliding", x: bath.x + bath.w / 2, y: bedNiche.y + CATALOG.bd_wardrobe_sliding.d / 2, fixed: true },
    { kind: "bd_bed", x: 7.87, y: 4.7, rot: 90 },
    { kind: "bd_nightstand", x: 8.5, y: 3.6, rot: 90 },
    { kind: "bd_rug_dark", x: 7.17, y: 5.8, rot: 90 },
    { kind: "bd_tv_wall", x: 5.7, y: 4.7, rot: 270, entity: "media_player.bedroom_tv_2" },
    { kind: "bd_ceiling_light", x: 7.37, y: 4.8, entity: "switch.bedroom_light" },
    // bathroom: enter from the west facing east. North wall: washer by the door. East wall, north to south: tall cabinet,
    // WC, water column, vanity sink with mirror; the bathtub with curtain runs along the south wall.
    { kind: "bt_washer", x: 7.25, y: 0.3 },
    { kind: "bt_corner_cabinet", x: 8.355, y: 0.185, fixed: true }, // beside the NE column, against the north wall
    { kind: "bt_wc", x: 8.3, y: 0.575, rot: 90 },
    { kind: "bt_water_column", x: 8.495, y: 0.99, rot: 90, fixed: true },
    { kind: "bt_vanity_sink", x: 8.4, y: 1.53, rot: 90 },
    { kind: "bt_mirror", x: 8.55, y: 1.53, rot: 90 },
    { kind: "bt_bathtub", x: 7.79, y: 2.2, rot: 180 },
    { kind: "ceiling_light", x: bath.x + bath.w / 2, y: 1.3, entity: "switch.bathroom_switch_left" },
    // structural columns of the architect plan: centred on the facade, taking floor space inside
    ...balconyRailing(BALCONY),
    { kind: "column", x: livingEastX, y: north, fixed: true },
    { kind: "column", x: bathEastX + 0.07, y: north, fixed: true },
    { kind: "column", x: livingEastX, y: south, fixed: true },
    { kind: "column", x: bedEastX - 0.02, y: south, fixed: true },
  ];
  const items = specs.map((s) => settle(s, walls));
  const fridge = items.find((i) => i.kind === "kt_fridge_steel")!;
  // Echo Dot on top of the fridge
  items.push(settle({ kind: "echo_dot", x: fridge.x, y: fridge.y, entity: "media_player.kitchen_echo_dot", elev: CATALOG.kt_fridge_steel.h }, walls));
  // HEKTAR lamp heads, one per bulb, on the stand's pole (top to bottom: bulbs 1, 2, 3)
  const stand = items.find((i) => i.kind === "of_hektar_stand")!;
  ["light.office_sofa_lamp_1", "light.office_sofa_lamp_2", "light.office_sofa_lamp_3"].forEach((entity, i) =>
    items.push(settle({ kind: "of_hektar_head", x: stand.x, y: stand.y, rot: stand.rot, elev: [1.66, 1.31, 0.96][i], entity }, walls)),
  );

  return applyAdditions({ walls, openings, rooms, items, bearing: APARTMENT_BEARING });
}
