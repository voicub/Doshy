import type { BodyStyle, CarSpec, Roofline, WheelStyle } from "./cars.ts";
import { designOf } from "./cars.design.ts";

// Design parameters of a car: what makes a model recognisable beyond its size and body style (the face, the tail lamps, the pillars,
// the wheels). Every field is optional input; `resolveDesign` fills the gaps from the body style, so a model without researched data
// still gets a sensible car. The generator reads only the resolved result.

export type Grille = "shield" | "slats" | "mesh" | "bar" | "closed";
type LampShape = "slim" | "wide" | "round" | "angular";
export type Drl = "strip" | "c" | "bar" | "none";
export type Intake = "wide" | "split" | "none";
type TailLamp = "wrap" | "bar" | "vertical" | "block" | "round";
export type Exhaust = "single" | "twin" | "hidden";
export type WheelDesign = "five" | "ten" | "twin" | "turbine" | "steel";

export type CarDesign = {
  face?: { grille?: Grille; grilleW?: number; grilleChrome?: boolean; lamp?: LampShape; drl?: Drl; intake?: Intake; fog?: boolean; id?: string; bars?: number };
  rear?: { lamp?: TailLamp; exhaust?: Exhaust };
  body?: {
    belt?: number; roofTaper?: number; tumble?: number; hood?: number; ws?: number; rr?: number; roof?: Roofline; clearance?: number;
    pillars?: "body" | "black"; windowTrim?: "chrome" | "black" | "none"; crease?: number; cladding?: number; rails?: boolean; spoiler?: boolean;
  };
  wheels?: { size?: number; spokes?: number; style?: WheelDesign };
  notes?: string;
};

export type Resolved = {
  /** The spec with the design's body numbers folded in (explicit spec extras win over the design). */
  spec: CarSpec;
  face: Required<Omit<NonNullable<CarDesign["face"]>, "id" | "bars">> & { id?: string; bars?: number };
  rear: Required<NonNullable<CarDesign["rear"]>>;
  roofTaper: number;
  pillars: "body" | "black";
  windowTrim: "chrome" | "black" | "none";
  crease: number;
  cladding: number;
  wheel: { style: WheelDesign; spokes: number };
};

const BASE_FACE: Omit<Resolved["face"], "id" | "bars"> = { grille: "slats", grilleW: 0.48, grilleChrome: true, lamp: "wide", drl: "strip", intake: "wide", fog: true };

/** Face defaults that differ by body style. */
const STYLE_FACE: Partial<Record<BodyStyle, NonNullable<CarDesign["face"]>>> = {
  sports: { lamp: "slim", grille: "mesh", grilleChrome: false, fog: false },
  coupe: { lamp: "slim", grille: "mesh", grilleChrome: false },
  convertible: { lamp: "slim", grille: "mesh", grilleChrome: false, fog: false },
  pickup: { grille: "bar", lamp: "angular" },
  van: { grille: "bar", fog: false },
  microcar: { lamp: "round", fog: false, intake: "none" },
};

const ROOF_TAPER: Record<BodyStyle, number> = { hatchback: 0.04, sedan: 0, estate: 0.02, suv: 0.03, crossover: 0.05, coupe: 0, convertible: 0, pickup: 0, van: 0, minivan: 0.02, microcar: 0, sports: 0 };

const SPOKES = (spec: CarSpec) => 5 + ([...spec.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 3);

function resolveDesign(spec: CarSpec, d: CarDesign = {}): Resolved {
  const ev = spec.fuel === "ev";
  const body = d.body ?? {};
  const face = { ...BASE_FACE, ...(ev ? { grille: "closed" as Grille, fog: false } : {}), ...STYLE_FACE[spec.bodyStyle], ...d.face };
  const wheelStyle: WheelDesign = d.wheels?.style ?? (spec.wheels === "steel" ? "steel" : spec.wheels === "multi" ? "ten" : spec.bodyStyle === "van" || spec.bodyStyle === "microcar" ? "steel" : "five");
  const wheels: WheelStyle = wheelStyle === "steel" ? "steel" : wheelStyle === "ten" ? "multi" : "alloy";
  const eff: CarSpec = {
    ...spec,
    belt: spec.belt ?? body.belt,
    tumble: spec.tumble ?? body.tumble,
    hood: spec.hood ?? body.hood,
    ws: spec.ws ?? body.ws,
    rr: spec.rr ?? body.rr,
    roof: spec.roof ?? body.roof,
    clearance: spec.clearance ?? body.clearance,
    rails: spec.rails ?? body.rails,
    spoiler: spec.spoiler ?? body.spoiler,
    wheel: spec.wheel ?? d.wheels?.size,
    wheels: spec.wheels ?? wheels,
  };
  return {
    spec: eff,
    face,
    rear: { lamp: "wrap", exhaust: ev ? "hidden" : spec.bodyStyle === "sports" ? "twin" : "single", ...d.rear },
    roofTaper: body.roofTaper ?? ROOF_TAPER[spec.bodyStyle],
    pillars: body.pillars ?? "body",
    windowTrim: body.windowTrim ?? "none",
    crease: body.crease ?? 0.3,
    cladding: body.cladding ?? 1,
    wheel: { style: wheelStyle, spokes: d.wheels?.spokes ?? (wheelStyle === "ten" ? 10 : SPOKES(spec)) },
  };
}

/** The resolved design of a car model: the researched data of lib/cars.design.ts over the body-style defaults above. */
export const designFor = (spec: CarSpec): Resolved => resolveDesign(spec, designOf(spec.id));
