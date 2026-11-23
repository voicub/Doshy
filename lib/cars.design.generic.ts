import type { DesignRow } from "./cars.design.ts";

// Generic rows: the typical look of each body style, with no brand face (a plain framed grille, plain lamps). Public general knowledge, no sources needed.
// sources: own = our own description of the body style

export const BRANDS: Record<string, DesignRow> = {
  Generic: {
    face: { grille: "shield", grilleW: 0.4, grilleChrome: false, lamp: "wide", drl: "none", intake: "wide", fog: false, id: "generic" },
    rear: { lamp: "wrap", exhaust: "single" },
    wheels: { rim: 16, style: "five", spokes: 5 },
    source: "own",
  },
};

export const ROWS: Record<string, DesignRow> = {
  car_generic_hatchback: { body: { roof: "flat", rr: 0.8, spoiler: true }, wheels: { rim: 16, style: "five" }, notes: "Plain five-door hatchback: short bonnet, steep hatch, small roof spoiler.", source: "own" },
  car_generic_sedan: { body: { roof: "notchback", rr: 1.3, windowTrim: "chrome" }, wheels: { rim: 17, style: "five" }, notes: "Three-box saloon: long bonnet, separate boot lid, chrome window line.", source: "own" },
  car_generic_estate: { body: { roof: "flat", rr: 0.25, rails: true, windowTrim: "chrome", spoiler: true }, wheels: { rim: 17, style: "five" }, notes: "Estate: long roof with rails, near-vertical tailgate with roof spoiler.", source: "own" },
  car_generic_suv: { face: { grilleW: 0.46 }, body: { roof: "flat", clearance: 0.21, cladding: 0.4, rails: true, crease: 0.4 }, wheels: { rim: 18, style: "ten", spokes: 10 }, notes: "Tall SUV: high bonnet, black arch cladding, roof rails.", source: "own" },
  car_generic_crossover: { body: { roof: "flat", clearance: 0.18, cladding: 0.35, rails: true }, wheels: { rim: 17, style: "five" }, notes: "Compact crossover: hatchback body raised on black cladding with roof rails.", source: "own" },
  car_generic_coupe: { face: { lamp: "slim", grilleW: 0.42 }, body: { roof: "fastback", belt: 0.7, pillars: "black", crease: 0.5 }, rear: { lamp: "wrap", exhaust: "twin" }, wheels: { rim: 18, style: "ten", spokes: 10 }, notes: "Two-door coupe: low roof, long doors, fastback rear, twin exhaust.", source: "own" },
  car_generic_convertible: { face: { lamp: "slim" }, body: { top: "soft", belt: 0.7 }, rear: { lamp: "wrap", exhaust: "twin" }, wheels: { rim: 17, style: "five" }, notes: "Two-seat roadster with a soft top and a short boot.", source: "own" },
  car_generic_pickup: { face: { grilleW: 0.5, grilleChrome: true, bars: 2 }, body: { cab: "double", bed: "open", clearance: 0.22, cladding: 0.35, skid: "silver" }, rear: { lamp: "vertical" }, wheels: { rim: 17, tyre: "265/65", style: "ten", spokes: 10 }, notes: "Double-cab pickup: tall bonnet, open load bed, chrome grille.", source: "own" },
  car_generic_van: { face: { grilleW: 0.4, lamp: "wide" }, body: { slide: true, roof: "flat" }, rear: { lamp: "vertical" }, wheels: { rim: 16, tyre: "215/65", style: "steel", spokes: 5 }, notes: "Panel van: tall flat nose, sliding side door, vertical tail lamps, steel wheels.", source: "own" },
  car_generic_minivan: { body: { roof: "flat", slide: true, rails: true }, wheels: { rim: 16, style: "five" }, notes: "Five-door people carrier: tall, rounded, long glasshouse, sliding doors.", source: "own" },
  car_generic_microcar: { face: { grilleW: 0.3, lamp: "round", intake: "none" }, body: { roof: "flat", spoiler: false }, rear: { lamp: "round" }, wheels: { rim: 14, style: "steel", spokes: 5 }, notes: "City microcar: tiny, tall and boxy, round lamps, steel wheels.", source: "own" },
  car_generic_sports_car: { face: { lamp: "slim", grilleW: 0.5, intake: "split" }, body: { roof: "fastback", belt: 0.72, pillars: "black", spoiler: true, crease: 0.7 }, rear: { lamp: "bar", exhaust: "twin", bar: true }, wheels: { rim: 19, style: "ten", spokes: 10 }, notes: "Mid-engined style sports car: very low, wide intakes, light-bar tail, big wheels.", source: "own" },
  car_generic_electric_hatchback: { body: { roof: "flat", rr: 0.8 }, rear: { lamp: "bar", bar: true }, face: { drl: "bar" }, wheels: { rim: 18, style: "turbine" }, notes: "Electric hatchback: closed nose with a light bar, flat-faced aero wheels.", source: "own" },
  car_generic_electric_suv: { body: { roof: "flat", cladding: 0.3, top: "glass" }, rear: { lamp: "bar", bar: true }, face: { drl: "bar" }, wheels: { rim: 19, style: "turbine" }, notes: "Electric SUV: closed nose, full-width light bars, large aero wheels, glass roof.", source: "own" },
};
