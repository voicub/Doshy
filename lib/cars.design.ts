import type { BodyStyle, Roofline } from "./cars.ts";
import { carId } from "./cars.ts";
import { CAR_TABLE } from "./cars.data.ts";
import { BRAND_DESIGNS, MODEL_DESIGNS } from "./cars.design.data.ts";

// CAR DESIGN: what makes a model recognisable, as PARAMETERS for the 3D generator (never geometry). The generator reads `designOf(id)`.
// Facts are public specifications and our own descriptions of each model's styling; no images or text are copied, no logos are drawn.
// Research notes and sources: docs/cars-design.md.
//
// Resolution order, later wins:  GENERIC -> body style -> brand (BRAND_DESIGNS) -> EV rules -> model row (MODEL_DESIGNS).
// To add or fix a car, add ONE line to lib/cars.design.data.ts (or a part file it imports). Every key is optional in a row.
//
// How to read the enums (shared by all brands, so pick the closest):
//   face.grille   shield = one big framed opening (trapezoid, hexagon, singleframe, Mitsubishi Dynamic Shield, Skoda, Kia/Hyundai tiger nose)
//                 slats = horizontal slats/louvres or kidney pair (BMW, Jeep slots, Mercedes AMG vertical bars use `bars`)
//                 mesh = honeycomb / mesh fill      bar = a thin bar between the headlamps (VW Golf, Mini, Mazda 3 wing)     closed = no grille (EV)
//   face.lamp     slim = narrow slit or strip       wide = broad wrap-around           round = round / circular   angular = wedge / swept / hexagonal
//   face.drl      strip = thin line on or under the lamp   c = C, L, J, hammer or hook shape   bar = full-width bar linking the lamps   none = no visible signature
//   face.intake   wide = one wide lower air intake   split = lower intake divided into corner pods / three parts   none = no lower opening
//   rear.lamp     wrap = lamps wrap round the quarter   bar = light bar across the tailgate   vertical = tall lamps up the tailgate edge
//                 block = rectangular block lamps   round = round lamps
//   wheels.style  five = 5 spokes   ten = 10 or multi-spoke   twin = 5 twin-spokes (10 thin spokes in pairs)   turbine = aero / turbine / flat disc   steel = steel wheel with a cap

export const GRILLES = ["shield", "slats", "mesh", "bar", "closed"] as const;
export const LAMPS = ["slim", "wide", "round", "angular"] as const;
export const DRLS = ["strip", "c", "bar", "none"] as const;
export const INTAKES = ["wide", "split", "none"] as const;
export const REAR_LAMPS = ["wrap", "bar", "vertical", "block", "round"] as const;
export const EXHAUSTS = ["single", "twin", "hidden"] as const;
export const ROOFS = ["flat", "fastback", "notchback"] as const;
export const PILLARS = ["body", "black"] as const;
export const TRIMS = ["chrome", "black", "none"] as const;
export const RIM_STYLES = ["five", "ten", "twin", "turbine", "steel"] as const;
// extras (optional; the generator may ignore them)
export const TOPS = ["body", "glass", "contrast", "soft"] as const;
export const CABS = ["single", "extended", "double"] as const;
export const BEDS = ["open", "cover", "none"] as const;
export const MIRRORS = ["body", "black", "chrome"] as const;
export const SKIDS = ["none", "silver", "black"] as const;

export type Grille = (typeof GRILLES)[number];
export type Lamp = (typeof LAMPS)[number];
export type Drl = (typeof DRLS)[number];
export type Intake = (typeof INTAKES)[number];
type RearLamp = (typeof REAR_LAMPS)[number];
export type Exhaust = (typeof EXHAUSTS)[number];
export type Pillars = (typeof PILLARS)[number];
type Trim = (typeof TRIMS)[number];
type RimStyle = (typeof RIM_STYLES)[number];

type FaceDesign = {
  grille: Grille;
  grilleW: number; // share of the car width taken by the grille opening, 0.3-0.6
  grilleChrome: boolean; // chrome frame or bars on the grille
  lamp: Lamp;
  drl: Drl;
  intake: Intake;
  fog: boolean; // visible fog lamps in the bumper
  bars?: number; // horizontal slats in the grille (0 = solid or mesh)
  id: string; // brand face language, informational: "mitsubishi-dynamic-shield", "bmw-kidney", ...
  sig?: string; // informational name of the lamp signature: "fang", "thors-hammer", "diamond-c", ...
};

type RearDesign = {
  lamp: RearLamp;
  exhaust: Exhaust;
  bar?: boolean; // a light bar links the tail lamps across the tailgate
};

type BodyDesign = {
  belt?: number; // side-window sill height / car height, 0.6-0.75
  roofTaper?: number; // metres the roof drops from the windscreen header to the rear, 0-0.12
  tumble?: number; // 0.05-0.15
  hood?: number; // bonnet length / car length
  ws?: number; // windscreen run/rise
  rr?: number; // rear glass run/rise
  roof?: Roofline;
  clearance?: number; // ground clearance, m
  pillars?: Pillars; // black = blacked-out B/C pillars (floating roof look)
  windowTrim?: Trim;
  crease?: number; // shoulder crease strength, 0-1
  cladding?: number; // black plastic arch/sill share, 0-1
  rails?: boolean;
  spoiler?: boolean;
  top?: (typeof TOPS)[number]; // roof finish: body colour, panoramic glass, contrast colour (see `accent`), soft top
  accent?: string; // #hex of the contrast roof / pillars
  kick?: boolean; // the beltline kicks up at the C pillar
  slide?: boolean; // sliding rear doors
  cab?: (typeof CABS)[number]; // pickups
  bed?: (typeof BEDS)[number]; // pickups: open load bed, tonneau cover, none
  mirror?: (typeof MIRRORS)[number];
  skid?: (typeof SKIDS)[number]; // visible front skid plate
};

export type WheelDesign = {
  size: number; // overall diameter incl. tyre, metres
  spokes: number; // 5-10
  style: RimStyle;
  rim?: number; // rim diameter, inch
  tyre?: string; // "225/55" (section width mm / aspect ratio %)
};

export type CarDesign = { face: FaceDesign; rear: RearDesign; body: BodyDesign; wheels: WheelDesign; notes: string; source: string };

/** One line of data: any subset of the design. `wheels.size` is computed from `rim` (and `tyre`) when absent. */
export type DesignRow = { face?: Partial<FaceDesign>; rear?: Partial<RearDesign>; body?: BodyDesign; wheels?: Partial<WheelDesign>; notes?: string; source?: string };

const GENERIC: DesignRow = {
  face: { grille: "slats", grilleW: 0.4, grilleChrome: false, lamp: "wide", drl: "none", intake: "wide", fog: false, id: "generic" },
  rear: { lamp: "wrap", exhaust: "single" },
  body: {},
  wheels: { rim: 16, style: "five", spokes: 5 },
  notes: "",
  source: "",
};

// body style defaults: only what differs from GENERIC
const BY_STYLE: Partial<Record<BodyStyle, DesignRow>> = {
  pickup: { body: { cab: "double", bed: "open", rails: false } },
  convertible: { body: { top: "soft" } },
  van: { rear: { lamp: "vertical" }, body: { slide: true } },
  sports: { rear: { exhaust: "twin" } },
};

// an electric car has no grille opening, no lower intake and no exhaust unless the model row says otherwise
const EV: DesignRow = { face: { grille: "closed", intake: "none" }, rear: { exhaust: "hidden" } };

/** Rim diameter plus two sidewalls, metres. With `tyre` ("225/55") the sidewall is exact, otherwise a typical profile for the rim. */
export function tyreDiameter(rim: number, tyre?: string): number {
  const m = tyre && /^(\d{3})\/(\d{2})$/.exec(tyre);
  if (m) return rim * 0.0254 + (2 * Number(m[1]) * Number(m[2])) / 100000;
  return rim * 0.0254 + 0.25 - 0.007 * (rim - 15);
}

const merge = (a: DesignRow, b: DesignRow | undefined): DesignRow =>
  b ? { face: { ...a.face, ...b.face }, rear: { ...a.rear, ...b.rear }, body: { ...a.body, ...b.body }, wheels: { ...a.wheels, ...b.wheels }, notes: b.notes ?? a.notes, source: b.source ?? a.source } : a;

const ROWS = new Map(CAR_TABLE.map((r) => [carId(r[0], r[1]), r]));
const cache = new Map<string, CarDesign>();

/** The full design of a catalogue model (id from `carId`, e.g. "car_mitsubishi_asx_2016"). Unknown ids get the generic design. Never throws. */
export function designOf(id: string): CarDesign {
  const hit = cache.get(id);
  if (hit) return hit;
  const row = ROWS.get(id);
  let d = merge(GENERIC, row && BY_STYLE[row[2]]);
  d = merge(d, row && BRAND_DESIGNS[row[0]]);
  d = merge(d, row?.[3] === "ev" ? EV : undefined);
  d = merge(d, MODEL_DESIGNS[id]);
  const w = d.wheels as Partial<WheelDesign>;
  const rim = w.rim ?? 16;
  const out: CarDesign = {
    face: d.face as FaceDesign,
    rear: d.rear as RearDesign,
    body: d.body as BodyDesign,
    wheels: { ...(w as WheelDesign), size: w.size ?? Math.round(tyreDiameter(rim, w.tyre) * 1000) / 1000, rim },
    notes: d.notes ?? "",
    source: d.source ?? "",
  };
  cache.set(id, out);
  return out;
}

/** True when the model (not just its brand) has been researched individually. */
export const isResearched = (id: string): boolean => id in MODEL_DESIGNS;
