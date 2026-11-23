import type { Def, Part } from "./catalog";
import type { Swatch } from "./palette";

// Cars: one `CarSpec` (real published dimensions + a body style) becomes a catalog Def. The 3D is procedural bodywork lofted from the
// model's length, width, height, wheelbase and a few shape tweaks (lib/carGeometry.ts, drawn by components/scene/CarMesh.tsx); `Def.parts`
// is only a coarse box stand-in for anything that wants plain parts. Paint is `m` (recolourable); glass, tyres, trim and lights are fixed.
// Local coords: centred on the footprint, front = +z, the car's left side = +x, y = part centre height.
// The 3D is a generic approximation of the body style, not a replica of any model.

export type BodyStyle = "hatchback" | "sedan" | "estate" | "suv" | "crossover" | "coupe" | "convertible" | "pickup" | "van" | "minivan" | "microcar" | "sports";
type Fuel = "petrol" | "diesel" | "hybrid" | "ev";
export type Roofline = "flat" | "fastback" | "notchback";
export type WheelStyle = "steel" | "alloy" | "multi";
export type Finish = "gloss" | "metallic" | "matte";

export type CarSpec = {
  id: string;
  label: string;
  brand: string;
  length: number; // metres, bumper to bumper
  width: number; // metres, without mirrors
  height: number; // metres, unladen
  wheelbase: number; // metres
  bodyStyle: BodyStyle;
  fuel: Fuel;
  color: string; // default paint, #rrggbb
  /** Optional tweaks; every one has a per-body-style default (lib/carFrame.ts STYLES). */
  clearance?: number; // ground clearance, m
  hood?: number; // bonnet length as a share of the car length
  overhang?: number; // share of the (length - wheelbase) that is in front of the front axle
  ws?: number; // windscreen rake: run / rise (bigger = more laid back)
  rr?: number; // rear window rake: run / rise
  roof?: Roofline; // rear shape: flat (squared-off), fastback (long slope) or notchback (separate boot)
  wheel?: number; // wheel diameter, m
  wheels?: WheelStyle;
  port?: "l" | "r" | "f"; // EV charge flap: car's left / right rear quarter, or front centre
  rails?: boolean; // roof rails
  tow?: boolean; // tow bar
  spoiler?: boolean;
  belt?: number; // beltline (bottom of the side windows) as a share of the car height
  tumble?: number; // how much narrower the roof is than the shoulders, per side, as a share of the width
  trunk?: number; // boot length as a share of the car length (notchback and convertible)
};

export const CAR_BODY_TYPES: { id: BodyStyle; label: string; words: string }[] = [
  { id: "hatchback", label: "Hatchback", words: "hatch city supermini" },
  { id: "sedan", label: "Sedan", words: "saloon" },
  { id: "estate", label: "Estate", words: "wagon touring combi" },
  { id: "suv", label: "SUV", words: "off-road 4x4" },
  { id: "crossover", label: "Crossover", words: "suv" },
  { id: "coupe", label: "Coupe", words: "" },
  { id: "convertible", label: "Convertible", words: "cabrio roadster" },
  { id: "pickup", label: "Pickup", words: "truck" },
  { id: "van", label: "Van", words: "transporter delivery" },
  { id: "minivan", label: "Minivan", words: "mpv people carrier" },
  { id: "microcar", label: "Microcar", words: "city kei" },
  { id: "sports", label: "Sports", words: "supercar" },
];

/** Factory-style paint colours. Every car item shows these as a swatch row. */
export const CAR_COLORS: Swatch[] = [
  { name: "Pearl White", c: "#f1efe9" },
  { name: "Jet Black", c: "#15161a" },
  { name: "Graphite", c: "#3b3f45" },
  { name: "Silver", c: "#aeb3b9" },
  { name: "Titanium", c: "#7d8288" },
  { name: "Red", c: "#b3202a" },
  { name: "Burgundy", c: "#6b1a28" },
  { name: "Orange", c: "#d9621f" },
  { name: "Yellow", c: "#e2b91c" },
  { name: "Lime", c: "#8fc332" },
  { name: "Green", c: "#2f6b3f" },
  { name: "British Racing Green", c: "#1f3d2e" },
  { name: "Olive", c: "#6b6a3a" },
  { name: "Teal", c: "#1f6f73" },
  { name: "Light Blue", c: "#6fa6d6" },
  { name: "Blue", c: "#2c5aa0" },
  { name: "Navy", c: "#1d2f55" },
  { name: "Purple", c: "#5a2f7a" },
  { name: "Champagne", c: "#c9b48a" },
  { name: "Beige", c: "#d8cbb0" },
  { name: "Brown", c: "#5a3d2b" },
  { name: "Bronze", c: "#8a6a3c" },
  { name: "Matte Grey", c: "#6a6d70" },
  { name: "Matte Black", c: "#232427" },
];

export const paintHex = (name: string): string | undefined => (name.startsWith("#") ? name : CAR_COLORS.find((c) => c.name.toLowerCase() === name.toLowerCase())?.c);

export const FINISHES: { id: Finish; label: string }[] = [
  { id: "gloss", label: "Gloss" },
  { id: "metallic", label: "Metallic" },
  { id: "matte", label: "Matte" },
];

const MATTE_PAINTS = ["#6a6d70", "#232427"]; // the two "Matte ..." factory colours

/** The paint finish of a car item: its choice (`params.finish`), else matte for the matte factory colours and gloss for the rest. */
export function finishOf(params: Record<string, number | string | boolean> | undefined, color: string | undefined): Finish {
  const v = params?.finish;
  if (v === "gloss" || v === "metallic" || v === "matte") return v;
  return color && MATTE_PAINTS.includes(color.toLowerCase()) ? "matte" : "gloss";
}

// colours of the coarse stand-in parts
const GLASS = "#18222c";
const TYRE = "#16171a";
const HEADLIGHT = "#dfe6ee";
const TAILLIGHT = "#8d1d27";

const part = (p: [number, number, number], s: [number, number, number], c: string, o?: Partial<Part>): Part => ({ p, s, c, ...o });

/** A coarse box car: body, glasshouse, four wheels, headlights and tail lights. Only a stand-in; the real look is carGeometry. */
function coarseParts(s: CarSpec): Part[] {
  const { length: L, width: W, height: H, wheelbase: WB } = s;
  const gc = 0.15;
  const belt = H * 0.66;
  const D = s.wheel ?? 0.66;
  const out: Part[] = [
    part([0, (gc + belt) / 2, 0], [W * 0.97, belt - gc, L - 0.04], s.color, { m: true }),
    part([0, (belt + H) / 2, -L * 0.06], [W * 0.84, H - belt, L * 0.46], GLASS),
  ];
  for (const z of [WB / 2, -WB / 2]) for (const sx of [-1, 1]) out.push(part([sx * (W / 2 - 0.1), D / 2, z], [D, 0.2, D], TYRE, { shape: "cyl", r: [0, 0, Math.PI / 2] }));
  for (const sx of [-1, 1]) {
    out.push(part([sx * W * 0.35, belt - 0.1, L / 2 - 0.015], [W * 0.2, 0.08, 0.03], HEADLIGHT, { glow: true }));
    out.push(part([sx * W * 0.37, belt - 0.1, -L / 2 + 0.015], [W * 0.18, 0.08, 0.03], TAILLIGHT, { glow: true }));
  }
  return out;
}

/** One car per kind of chassis is offered (brand "Generic" in lib/cars.data.ts); every other row stays so saved plans and real 3D models keep working. */
const GENERIC_BRAND = "Generic";

export function carDef(s: CarSpec): Def {
  const body = CAR_BODY_TYPES.find((t) => t.id === s.bodyStyle);
  return {
    label: s.label,
    brand: s.brand,
    cat: "Garage & EV",
    w: s.width,
    d: s.length,
    h: s.height,
    parts: coarseParts(s),
    car: s,
    ...(s.brand === GENERIC_BRAND ? {} : { legacy: true as const }),
    tags: `${s.bodyStyle} ${body?.words ?? ""} ${s.fuel}${s.fuel === "ev" ? " electric" : ""} car`.replace(/\s+/g, " ").trim(), // first word = CAR_BODY_TYPES id (the drawer's body chips filter on it)
  };
}

export const isCarKind = (kind: string) => kind.startsWith("car_");

/** A car linked to a device_tracker or person: "home" lights its headlights, "away" (not_home) draws it as a ghost. Any other link shows nothing special. */
export function carPresence(kind: string, entity: string | undefined, state: string | undefined): "home" | "away" | undefined {
  if (!isCarKind(kind) || !entity || !/^(device_tracker|person)\./.test(entity)) return undefined;
  return state === "home" ? "home" : state === "not_home" ? "away" : undefined;
}

/** One line of lib/cars.data.ts. Metres. `paint` is a CAR_COLORS name or a #hex; `extra` overrides any optional CarSpec field. */
export type CarRow = [brand: string, model: string, body: BodyStyle, fuel: Fuel, length: number, width: number, height: number, wheelbase: number, paint: string, extra?: Partial<CarSpec>];

export const carId = (brand: string, model: string) => `car_${`${brand} ${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;

export function carSpec([brand, model, bodyStyle, fuel, length, width, height, wheelbase, paint, extra]: CarRow): CarSpec {
  const color = paintHex(paint);
  if (!color) throw new Error(`cars.data: unknown paint "${paint}" for ${brand} ${model}`);
  return { id: carId(brand, model), label: `${brand} ${model}`, brand, bodyStyle, fuel, length, width, height, wheelbase, color, ...extra };
}
