export type Pt = { x: number; y: number };
import type { Scene } from "./scenes";
import type { Choreography } from "./arrival";
import type { FloorPhoto } from "./floorPhoto";
import type { MaterialRef } from "./materialRef";
import type { Annotation, Trace } from "./designTypes";
import type { Maintenance } from "./maintenance";
import type { UtilityLine } from "./utilities";
import type { MdiIcon } from "./mdi";
import type { Site } from "./siteTypes";
/**
 * What a wall face is made of. `plaster` and `brick` are the original two; the rest are listed with their looks in lib/materials.ts.
 * `glass` makes the whole wall a transparent pane with a thin frame.
 */
export type WallStyle = "plaster" | "brick" | "redbrick" | "whitebrick" | "concrete" | "woodv" | "woodh" | "stone" | "metro" | "stripes" | "batten" | "glass" | "paint" | "fence_picket" | "fence_wire" | "fence_panel" | "wall_stone" | "wall_brick_low" | "hedge" | "fence_slat" | "fence_bar" | "fence_iron" | "fence_glass" | "wall_block" | "fence_rail" | "fence_electric" | "fence_bamboo";
export type Wall = {
  id: string;
  a: Pt;
  b: Pt;
  /** Material and colour of face A, the side on the right when walking a to b with y down (the wall's local +z). Absent colour = the material's natural colour. */
  style: WallStyle;
  color?: string;
  /** Face B (the left side): absent = same as face A. Lets a house be painted differently inside and out (lib/materials.ts `wallFaces`). */
  styleB?: WallStyle;
  colorB?: string;
  /** A PBR texture from Poly Haven on face A / face B (lib/materialRef.ts). Drawn instead of the style's look at Balanced and above; the ref's `avg` colour at Eco and Light. The style stays, so removing the material restores the old look. */
  material?: MaterialRef;
  materialB?: MaterialRef;
  /** Slab thickness in metres (default WALL_T). Used by the collision slabs of solid items (columns), which are modelled as one short thick wall. */
  thickness?: number;
  /** Height in metres (lib/fences.ts `wallHeight`). Absent = the storey's wall height. Fences, garden walls and hedges are low and set it. */
  height?: number;
  level?: string;
};
export type OpeningType = "door" | "window";
/** Door looks, picked from a gallery. Windows and doors each have their own list; an absent or mismatched `style` falls back to the plain single door / casement window. */
type DoorStyle = "single" | "double" | "slidingGlass" | "pocket" | "french" | "arch" | "passage" | "garageSectional" | "garageRoller" | "sidelight" | "folding" | "gate" | "wicket";
type WindowStyle = "casement" | "twin" | "picture" | "sliding" | "tiltTurn" | "bay" | "arched" | "round" | "highWindow" | "glassBlock" | "shopfront";
export type OpeningStyle = DoorStyle | WindowStyle;
/** Glass colour of a window or glazed door. Absent = the usual light blue-grey. */
export type GlassTint = "dark" | "bronze" | "green" | "frosted";
/** A door or window cut into a wall. All lengths are metres; `sill` is the height of the opening's bottom edge above the floor. */
export type Opening = {
  id: string;
  wallId: string;
  t: number; // centre along the wall, 0..1
  width: number;
  type: OpeningType;
  sill: number;
  height: number;
  entity?: string; // contact sensor / cover: when "on"/"open" the door or window leaf is drawn ajar
  /**
   * Door swing, relative to the wall's direction a -> b: `hinge` = which end of the opening carries the hinges
   * ("start" = nearer a), `swing` = which side of the wall the leaf opens toward ("left"/"right" when walking from a to b in plan view,
   * y down, so "left" is the side with smaller y for a wall running west to east). Windows use the same fields for their casement hinge.
   * Default when absent: hinge "start", swing "left".
   */
  hinge?: "start" | "end";
  swing?: "left" | "right";
  /** Look of the opening (see OpeningStyle). Absent = today's plain door / window. */
  style?: OpeningStyle;
  /** Frame colour (CSS hex); for a solid door leaf its paint. Absent = the default white frame / dark window frame / wooden leaf. */
  color?: string;
  tint?: GlassTint;
  level?: string;
};
/** What a floor is made of. Room.color tints any of them. Looks, defaults and which are outdoor surfaces: lib/materials.ts. */
export type FloorKind =
  | "wood" | "tile" | "carpet" | "brick" | "grass"
  | "oak" | "darkwood" | "herringbone" | "laminate" | "tilelarge" | "mosaic" | "marble" | "terrazzo" | "concrete" | "polished" | "slabs" | "slate" | "vinyl"
  | "paving" | "gravel" | "sand" | "deck" | "asphalt" | "water"
  | "cobble" | "flagstone" | "pavers_grey" | "pavers_sand" | "pavers_red" | "mulch" | "soil" | "turf" | "rubber";
export type Room = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string; // floor tint, multiplied with the floor texture
  floor: FloorKind;
  tempEntity?: string; // temperature sensor (or a climate entity: its current_temperature) shown on the room chip
  humidityEntity?: string; // relative humidity sensor
  presenceEntities?: string[]; // occupancy / presence binary sensors: the room is occupied when any is "on"
  powerEntities?: string[]; // power sensors (W) that belong to the room, summed for the room's live consumption
  areas?: string[]; // Home Assistant area ids whose entities belong to this room
  parent?: string; // id of the room this one is a part of (e.g. an alcove): shares its chip, entities and lights
  floorPhoto?: FloorPhoto; // a photo of the real floor, drawn instead of `floor` at Balanced and above (lib/floorPhoto.ts); the colour only at Eco and Light
  floorMaterial?: MaterialRef; // a PBR texture from Poly Haven on the floor (lib/materialRef.ts); never together with floorPhoto
  level?: string;
};
export type Item = {
  id: string;
  kind: string;
  x: number;
  y: number;
  rot: number; // degrees, clockwise in plan view
  w: number;
  d: number;
  h: number;
  color?: string; // finish override for the item's main material
  entity?: string;
  /** Per-piece options a catalog def exposes (stair width/turn, car colour, camera `fov` / `range`, vacuum position calibration `calX` / `calY` / `calScale` ...). Plain values only. */
  params?: Record<string, number | string | boolean>;
  elev?: number; // height of the item's base above the floor, e.g. a speaker on top of a fridge (default 0)
  /** Locked pieces cannot be picked, moved or turned with the pointer (or the keys); they stay in the lists and can still be selected there. Absent = free. */
  locked?: true;
  level?: string;
};
/** Building kind: an apartment is one flat (one level, possibly raised above the ground); a house can have several levels. */
export type BuildingType = "apartment" | "house";
/**
 * A storey. `elevation` = height of its finished floor above the ground (m); a raised ground floor is a level
 * with elevation 1.0. `height` = floor-to-floor height (storey incl. slab), used to stack levels automatically.
 */
export type Level = { id: string; name: string; elevation: number; height: number };
/** Roof of a house (an apartment has none). `pitch` in degrees, `overhang` in metres; absent = gable, 30 deg, 0.4 m (lib/roof.ts). */
export type RoofType = "gable" | "hip" | "shed" | "flat";
export type Roof = { type: RoofType; pitch: number; overhang: number };
/**
 * How the front door meets the world: onto the building's shared corridor ("hallway"), with steps or stairs up from outside ("stairs", only
 * generated when the floor is raised), or just the door in the wall ("door"). Absent = hallway for an apartment, stairs for a house (lib/planOps.ts entryOf).
 * "street" is what "stairs" was first called: still read from saved plans, never written.
 */
export type BuildingEntry = "hallway" | "stairs" | "door";
export type Building = { type: BuildingType; name?: string; roof?: Roof; entry?: BuildingEntry | "street" };
/**
 * Walls, openings, rooms and items belong to a level by `level` (a Level id); absent = the first level.
 * `building`/`levels` absent = a single level at elevation 0 (legacy plans).
 */
/**
 * A hole cut through the floor slab of `level` (a stairwell, or a void over a double-height room): a rectangle in plan metres, turned `rot` degrees
 * about its centre; x, y is the top-left corner of the unturned rectangle (like a Room). Seen from the level below it is the opening in the ceiling.
 * Stairs themselves are catalog items; a void only cuts the slab. `auto` = id of the stair item this hole belongs to: such a void is derived from
 * the stair (lib/voids.ts withAutoVoids) and follows it, so it is regenerated, never edited by hand.
 */
export type SlabVoid = { id: string; x: number; y: number; w: number; h: number; rot?: number; name?: string; level?: string; auto?: string };
/** How the rim of a garden area or path is finished: nothing, a stone kerb, a wooden sleeper, a brick course, a thin steel strip. */
export type GroundEdge = "none" | "kerb" | "sleeper" | "brick" | "steel";
/**
 * A patch of ground in the garden (patio, lawn, drive, pond, flower bed): a rectangle in plan metres turned `rot` degrees about its centre, x, y being the
 * top-left corner of the unturned rectangle (like a Room). Not a room: no walls, no chip, no area in the building's totals. It always lies on the ground,
 * whatever level is shown. `color` tints the surface; absent = the kind's natural colour (lib/materials.ts).
 */
export type GroundArea = { id: string; x: number; y: number; w: number; h: number; rot?: number; kind: FloorKind; color?: string; edge?: GroundEdge; name?: string; material?: MaterialRef };
/** Lane markings painted along a road: none, a dashed or solid white centre line, white lines along both edges, or a double yellow centre line. */
export type RoadMarks = "none" | "dashed" | "solid" | "edges" | "double";
/** Which sides of a road get a raised pavement (sidewalk). `left` and `right` are seen walking along the line from its first point to its last, plan y down. */
export type PavementSides = "none" | "left" | "right" | "both";
/**
 * A strip of ground drawn as a line of points: a garden path, a drive, a road, a river of gravel. `width` in metres. Every option below is optional, so
 * plans saved before roads existed keep their round-ended path:
 * `ends` = how the two ends finish (default round); `smooth` = the points are control points of a curve; `marks` / `pavement` / `pavementWidth` make it a road;
 * `stones` lays separate stepping stones along the line instead of a continuous surface (lib/ground.ts, lib/lineGeometry.ts).
 */
export type GroundPath = {
  id: string;
  points: Pt[];
  width: number;
  kind: FloorKind;
  color?: string;
  edge?: GroundEdge;
  name?: string;
  ends?: "round" | "flat";
  smooth?: boolean;
  marks?: RoadMarks;
  pavement?: PavementSides;
  pavementWidth?: number;
  stones?: boolean;
  material?: MaterialRef; // a PBR texture from Poly Haven for the surface (lib/materialRef.ts)
};
/** What a flow carries; decides its colour and unit. */
export type FlowKind = "power" | "water" | "gas" | "data";
/**
 * A live connection between two items (solar panel -> inverter -> house / battery / grid / EV charger ...), drawn as an animated line that carries
 * the value of `entity` (a power sensor, watts or kilowatts). Positive = from -> to; `invert` flips the sign for sensors that report the other way.
 */
export type Flow = { id: string; from: string; to: string; kind?: FlowKind; entity?: string; invert?: boolean; label?: string };
export type Plan = {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: Item[];
  bearing?: number; // compass bearing (degrees clockwise from true north) of the plan's up direction (-y). 0 = plan up is north.
  building?: Building;
  levels?: Level[];
  voids?: SlabVoid[];
  ground?: GroundArea[];
  paths?: GroundPath[];
  site?: Site; // where the plan stands on Earth and which real surroundings to draw (lib/siteTypes.ts); absent = no surroundings
  flows?: Flow[];
  added?: string[]; // keys of lib/additions.ts already merged into this plan
  scenes?: Scene[]; // named sets of device targets, run from the HUD (lib/scenes.ts)
  choreographies?: Choreography[]; // arrival and departure choreographies: lights that welcome you home, what goodbye switches off (lib/arrival.ts); never in a guest link
  annotations?: Annotation[]; // notes, arrows, dimension lines and zones to remember (lib/annotations.ts)
  trace?: Trace; // a floor plan image shown under the plan to trace over (lib/trace.ts)
  maintenance?: Maintenance; // recurring upkeep tasks and what was snoozed on the maintenance board (lib/maintenance.ts); never in a guest link
  utilities?: UtilityLine[]; // drawn water, gas, drain and heating pipes, traced from a leak or gas alarm to the valve that stops them (lib/utilities.ts)
  icons?: Record<string, MdiIcon>; // Material Design icons chosen by hand for devices (`item.params.icon` = `mdi:name`), kept so the plan shows them offline and in guest links (lib/mdiPlan.ts)
};

export type SelType = "wall" | "opening" | "room" | "item" | "void" | "ground" | "path";
export type Sel = { type: SelType; id: string } | null;
