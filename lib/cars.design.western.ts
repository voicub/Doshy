import type { DesignRow } from "./cars.design.ts";

// US / UK / Nordic brands: Ford, Volvo, Polestar, Tesla, Jeep, Land Rover, Chevrolet, Dodge.
// Each row describes the generation / facelift that the dimensions in lib/cars.data.ts match (see local://dims-western.md).
// sources:
//   commons = https://commons.wikimedia.org (photo titles listed at the end of this file)
//   ford-fiesta = https://en.wikipedia.org/wiki/Ford_Fiesta
//   ford-focus = https://en.wikipedia.org/wiki/Ford_Focus_(fourth_generation)
//   ford-puma = https://en.wikipedia.org/wiki/Ford_Puma_(crossover)
//   ford-kuga = https://en.wikipedia.org/wiki/Ford_Kuga
//   ford-tc = https://en.wikipedia.org/wiki/Ford_Transit_Custom
//   ford-ranger = https://en.wikipedia.org/wiki/Ford_Ranger_(T6)
//   ford-f150 = https://en.wikipedia.org/wiki/Ford_F-Series_(fourteenth_generation)
//   ford-mustang = https://en.wikipedia.org/wiki/Ford_Mustang_(sixth_generation)
//   ford-mache = https://en.wikipedia.org/wiki/Ford_Mustang_Mach-E
//   volvo-ex30 = https://en.wikipedia.org/wiki/Volvo_EX30
//   volvo-xc40 = https://en.wikipedia.org/wiki/Volvo_XC40
//   volvo-v60 = https://en.wikipedia.org/wiki/Volvo_V60
//   volvo-xc60 = https://en.wikipedia.org/wiki/Volvo_XC60
//   volvo-xc90 = https://en.wikipedia.org/wiki/Volvo_XC90
//   polestar-2 = https://en.wikipedia.org/wiki/Polestar_2
//   tesla-m3 = https://en.wikipedia.org/wiki/Tesla_Model_3
//   tesla-my = https://en.wikipedia.org/wiki/Tesla_Model_Y
//   tesla-ms = https://en.wikipedia.org/wiki/Tesla_Model_S
//   tesla-mx = https://en.wikipedia.org/wiki/Tesla_Model_X
//   tesla-ct = https://en.wikipedia.org/wiki/Tesla_Cybertruck
//   jeep-reneg = https://en.wikipedia.org/wiki/Jeep_Renegade_(BU)
//   jeep-wrang = https://en.wikipedia.org/wiki/Jeep_Wrangler_(JL)
//   lr-def = https://en.wikipedia.org/wiki/Land_Rover_Defender_(L663)
//   chevy-bolt = https://en.wikipedia.org/wiki/Chevrolet_Bolt
//   chevy-c8 = https://en.wikipedia.org/wiki/Chevrolet_Corvette_(C8)
//   dodge-chall = https://en.wikipedia.org/wiki/Dodge_Challenger_(LC)

export const BRANDS: Record<string, DesignRow> = {
  // trapezoid grille, angular lamps, plain wrap lamps at the back
  Ford: {
    face: { grille: "shield", grilleW: 0.42, grilleChrome: false, lamp: "angular", drl: "strip", intake: "wide", fog: false, bars: 0, id: "ford-trapezoid", sig: "led-strip" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "five", spokes: 5 },
    source: "ford-fiesta",
  },
  // Thor's-hammer DRL, iron-mark diagonal across the grille, tall C-shaped tail lamps running up the rear pillar
  Volvo: {
    face: { grille: "slats", grilleW: 0.38, grilleChrome: true, lamp: "slim", drl: "c", intake: "wide", fog: false, bars: 6, id: "volvo-iron-mark", sig: "thors-hammer" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.68, windowTrim: "chrome", mirror: "body" },
    wheels: { rim: 19, style: "twin", spokes: 5 },
    source: "volvo-xc60",
  },
  // closed "smart zone" nose, hammer DRL, single tail bar, frameless mirrors
  Polestar: {
    face: { grille: "closed", grilleW: 0.4, lamp: "slim", drl: "c", intake: "none", id: "polestar-smart-zone", sig: "thors-hammer" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { mirror: "body", windowTrim: "black" },
    wheels: { rim: 19, style: "twin", spokes: 5 },
    source: "polestar-2",
  },
  // smooth closed nose, flush door handles-era minimalism, glass roof, aero wheel covers
  Tesla: {
    face: { grille: "closed", grilleW: 0.3, lamp: "slim", drl: "none", intake: "none", id: "tesla-closed-nose" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { top: "glass", windowTrim: "black", crease: 0.3, mirror: "body" },
    wheels: { rim: 19, style: "turbine", spokes: 5 },
    source: "tesla-m3",
  },
  // seven vertical slots flanked by round lamps, trapezoidal wheel arches, boxy body
  Jeep: {
    face: { grille: "slats", grilleW: 0.4, grilleChrome: false, lamp: "round", drl: "none", intake: "none", fog: true, bars: 7, id: "jeep-seven-slot", sig: "round-lamps" },
    rear: { lamp: "block", exhaust: "single" },
    body: { skid: "black", mirror: "black", cladding: 0.5 },
    wheels: { rim: 17, style: "five", spokes: 5 },
    source: "jeep-wrang",
  },
  // upright boxy Defender: round LED lamps either side of a narrow grille bar, tall rear lamps, big squared wheel arches
  "Land Rover": {
    face: { grille: "bar", grilleW: 0.32, grilleChrome: false, lamp: "round", drl: "strip", intake: "none", fog: false, id: "land-rover-defender", sig: "round-led" },
    rear: { lamp: "vertical", exhaust: "hidden" },
    body: { skid: "silver", mirror: "black", cladding: 0.3 },
    wheels: { rim: 20, style: "five", spokes: 5 },
    source: "lr-def",
  },
  Chevrolet: {
    face: { grille: "mesh", grilleW: 0.4, lamp: "angular", drl: "strip", intake: "wide", id: "chevrolet-split-grille", sig: "led-strip" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "five", spokes: 5 },
    source: "chevy-bolt",
  },
  // wide muscle-car mouth, long bonnet, ring-shaped lamps
  Dodge: {
    face: { grille: "mesh", grilleW: 0.5, grilleChrome: false, lamp: "round", drl: "strip", intake: "wide", id: "dodge-muscle-mouth", sig: "halo-rings" },
    rear: { lamp: "round", exhaust: "twin" },
    body: { mirror: "body" },
    wheels: { rim: 20, style: "five", spokes: 5 },
    source: "dodge-chall",
  },
};

export const ROWS: Record<string, DesignRow> = {
  // ---------------- Ford ----------------
  // Mk8 Fiesta (2017-): 4.04 m, short and tall hatch
  car_ford_fiesta: {
    face: { grille: "shield", grilleW: 0.46, grilleChrome: false, lamp: "slim", drl: "none", intake: "split", fog: false, bars: 0, sig: "slim-swept" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.66, roofTaper: 0.05, tumble: 0.1, hood: 0.25, ws: 1.25, rr: 0.7, roof: "flat", clearance: 0.13, windowTrim: "black", crease: 0.5, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 16, tyre: "195/50", style: "twin", spokes: 5 },
    notes: "Small hatch: low wide black trapezoid grille, slim swept lamps, small corner intakes, roof spoiler and horizontal wrap tail lamps reaching the quarters, five twin-spoke wheels.",
    source: "ford-fiesta,commons",
  },
  // Mk4 Focus (2018-): 4.378 m
  car_ford_focus: {
    face: { grille: "shield", grilleW: 0.5, grilleChrome: false, lamp: "slim", drl: "strip", intake: "split", fog: false, bars: 0, sig: "honeycomb-trapezoid" },
    rear: { lamp: "wrap", exhaust: "twin", bar: false },
    body: { belt: 0.67, roofTaper: 0.07, tumble: 0.09, hood: 0.28, ws: 1.35, rr: 0.9, roof: "fastback", clearance: 0.13, windowTrim: "black", crease: 0.5, cladding: 0, spoiler: true, kick: true },
    wheels: { rim: 18, tyre: "225/40", style: "twin", spokes: 5 },
    notes: "Low sleek hatch: broad honeycomb trapezoid grille with corner intakes, slim lamps, sloping roof under a big spoiler, wide horizontal wrap tail lamps and twin tailpipes.",
    source: "ford-focus,commons",
  },
  // Puma crossover (2019-): 4.207 m
  car_ford_puma: {
    face: { grille: "shield", grilleW: 0.44, grilleChrome: false, lamp: "angular", drl: "strip", intake: "wide", fog: true, bars: 0, sig: "led-strip" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.68, roofTaper: 0.07, tumble: 0.1, hood: 0.27, ws: 1.2, rr: 0.9, roof: "fastback", clearance: 0.17, windowTrim: "chrome", crease: 0.7, cladding: 0.5, rails: false, spoiler: true, kick: true, top: "body", skid: "silver" },
    wheels: { rim: 17, tyre: "215/55", style: "ten", spokes: 10 },
    notes: "Small crossover: black mesh trapezoid grille, round fog lamps, bulging bonnet and haunches, thick black arch cladding, silver bumper skid, sloping roof into a lip spoiler, C-shaped tail lamps.",
    source: "ford-puma,commons",
  },
  // Kuga III (2019-): 4.614 m
  car_ford_kuga: {
    face: { grille: "slats", grilleW: 0.5, grilleChrome: true, lamp: "angular", drl: "strip", intake: "split", fog: true, bars: 6, sig: "chrome-slats" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.67, roofTaper: 0.06, tumble: 0.1, hood: 0.27, ws: 1.2, rr: 0.8, roof: "flat", clearance: 0.2, windowTrim: "chrome", crease: 0.6, cladding: 0.4, rails: true, spoiler: true, kick: true },
    wheels: { rim: 18, tyre: "235/50", style: "twin", spokes: 5 },
    notes: "Mid SUV: wide trapezoid grille with chrome slats, slim swept lamps with round fogs below, chrome window line, silver roof rails, tapering roof with spoiler, dark sill cladding.",
    source: "ford-kuga,commons",
  },
  // Transit Custom (2012-2023): 4.973 m L1
  car_ford_transit_custom: {
    face: { grille: "slats", grilleW: 0.5, grilleChrome: true, lamp: "angular", drl: "none", intake: "wide", fog: true, bars: 6, sig: "chrome-hex-slats" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.62, hood: 0.18, ws: 0.9, rr: 0.3, roof: "flat", roofTaper: 0, tumble: 0.06, clearance: 0.18, windowTrim: "none", crease: 0.5, cladding: 0.15, slide: true, spoiler: false, mirror: "black", skid: "black" },
    wheels: { rim: 16, tyre: "215/65", style: "five", spokes: 5 },
    notes: "Mid-size panel van: wide chrome-framed slat grille, swept lamps with fogs below, short sloping nose and steep windscreen, one sliding side door, tall vertical tail lamps on twin rear doors.",
    source: "ford-tc,commons",
  },
  // Ranger T6 (2012-2022): 5.355 m double cab
  car_ford_ranger: {
    face: { grille: "slats", grilleW: 0.5, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, bars: 2, sig: "led-strip" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.62, hood: 0.27, ws: 1.0, rr: 0.1, roof: "flat", roofTaper: 0, clearance: 0.23, windowTrim: "chrome", crease: 0.6, cladding: 0.15, rails: true, cab: "double", bed: "open", mirror: "black", skid: "silver" },
    wheels: { rim: 18, tyre: "265/60", style: "twin", spokes: 5 },
    notes: "Double-cab pickup: wide black grille with chrome upper bar, angular lamps and fog lamps, silver roof rails and side steps, open bed, two tall vertical tail lamps on a bumper step.",
    source: "ford-ranger,commons",
  },
  // F-150 (2021-): 5.9 m crew cab
  car_ford_f_150: {
    face: { grille: "slats", grilleW: 0.55, grilleChrome: false, lamp: "angular", drl: "c", intake: "wide", fog: false, bars: 3, sig: "c-clamp" },
    rear: { lamp: "vertical", exhaust: "single", bar: false },
    body: { belt: 0.64, hood: 0.24, ws: 1.0, rr: 0.1, roof: "flat", roofTaper: 0, tumble: 0.06, clearance: 0.24, windowTrim: "none", crease: 0.5, cladding: 0.3, rails: false, cab: "double", bed: "open", mirror: "black", skid: "black" },
    wheels: { rim: 20, tyre: "275/60", style: "five", spokes: 5 },
    notes: "Full-size pickup: wide black grille with three bars, slab bonnet and flat sides, black bumpers, big arches, tall vertical tail lamps on a deep flat tailgate, side-exit exhaust.",
    source: "ford-f150,commons",
  },
  // Mustang S550 (2015-2023): 4.784 m, shark-nose fastback
  car_ford_mustang: {
    face: { grille: "mesh", grilleW: 0.45, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", fog: false, bars: 0, sig: "shark-nose" },
    rear: { lamp: "vertical", exhaust: "twin", bar: false },
    body: { belt: 0.72, roofTaper: 0.08, tumble: 0.12, hood: 0.34, ws: 1.5, rr: 0.5, roof: "fastback", clearance: 0.11, windowTrim: "black", crease: 0.8, cladding: 0, spoiler: true, kick: true, mirror: "body" },
    wheels: { rim: 19, tyre: "255/40", style: "twin", spokes: 5 },
    notes: "Long bonnet with power dome, short deck, fastback roof; low wide mesh mouth and slim lamps with a lower splitter, three vertical bars in each tail lamp, quad exhaust, black 19 inch twin-spoke wheels.",
    source: "ford-mustang,commons",
  },
  // Mach-E (2020-): EU spec 4.713 m
  car_ford_mustang_mach_e: {
    face: { grille: "closed", grilleW: 0.3, lamp: "slim", drl: "strip", intake: "none", fog: false, bars: 0, sig: "shark-nose" },
    rear: { lamp: "block", exhaust: "hidden", bar: false },
    body: { belt: 0.68, roofTaper: 0.07, tumble: 0.1, hood: 0.25, ws: 1.35, rr: 0.8, roof: "fastback", clearance: 0.18, windowTrim: "black", crease: 0.6, cladding: 0.4, spoiler: true, kick: true, top: "glass", mirror: "body" },
    wheels: { rim: 19, tyre: "225/55", style: "twin", spokes: 5 },
    notes: "Electric crossover: closed black nose framed by a body-colour shark-nose, slim lamps, black arch and sill cladding, dark glass roof into a lip spoiler, ribbed tri-bar tail lamps.",
    source: "ford-mache,commons",
  },

  // ---------------- Volvo ----------------
  // EX30 (2023-): 4.233 m
  car_volvo_ex30: {
    face: { grille: "closed", grilleW: 0.3, lamp: "slim", drl: "c", intake: "none", fog: false, sig: "pixel-hammer" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.68, roofTaper: 0.05, tumble: 0.1, hood: 0.24, ws: 1.2, rr: 0.7, roof: "flat", clearance: 0.17, windowTrim: "black", crease: 0.4, cladding: 0.4, rails: false, kick: true, mirror: "body" },
    wheels: { rim: 19, tyre: "235/45", style: "turbine", spokes: 5 },
    notes: "Compact electric SUV: smooth body-colour nose with a closed panel and small hammer lamps, dark lower bumper, soft rounded shoulders, grey sill cladding, aero-bladed 19 inch wheels.",
    source: "volvo-ex30,commons",
  },
  // XC40 (2017-): 4.425 m
  car_volvo_xc40: {
    face: { grilleW: 0.38, bars: 6, intake: "wide", fog: true, sig: "thors-hammer" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.7, roofTaper: 0.03, tumble: 0.1, hood: 0.25, ws: 1.15, rr: 0.5, roof: "flat", clearance: 0.21, windowTrim: "black", crease: 0.6, cladding: 0.5, rails: true, spoiler: true, kick: true, top: "contrast", accent: "#1a1a1a", mirror: "body" },
    wheels: { rim: 18, tyre: "235/55", style: "twin", spokes: 5 },
    notes: "Chunky compact SUV: black grille with the diagonal bar, hammer lamps with square fogs, thick black arch and sill cladding, high beltline kicking at the C pillar, optional contrast roof.",
    source: "volvo-xc40,commons",
  },
  // V60 II (2018-): 4.761 m
  car_volvo_v60: {
    face: { grilleW: 0.42, grilleChrome: true, bars: 8, intake: "wide", fog: true, sig: "thors-hammer" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.7, roofTaper: 0.04, tumble: 0.08, hood: 0.3, ws: 1.5, rr: 0.8, roof: "flat", clearance: 0.14, windowTrim: "chrome", crease: 0.5, cladding: 0, rails: true, spoiler: true, kick: false, mirror: "body" },
    wheels: { rim: 19, tyre: "235/40", style: "twin", spokes: 5 },
    notes: "Low long estate: wide chrome vertical-bar grille with the diagonal mark, hammer lamps and chrome-ringed fogs, long bonnet, shallow glasshouse, silver roof rails, tall C-shaped tail lamps.",
    source: "volvo-v60,commons",
  },
  // XC60 II (2017-): 4.688 m
  car_volvo_xc60: {
    face: { grilleW: 0.4, bars: 8, intake: "wide", fog: true, sig: "thors-hammer" },
    rear: { lamp: "vertical", exhaust: "twin" },
    body: { belt: 0.68, roofTaper: 0.04, tumble: 0.1, hood: 0.27, ws: 1.2, rr: 0.5, roof: "flat", clearance: 0.21, windowTrim: "chrome", crease: 0.6, cladding: 0.3, rails: true, spoiler: true, kick: true, mirror: "body" },
    wheels: { rim: 20, tyre: "255/45", style: "twin", spokes: 5 },
    notes: "Mid SUV: wide dark grille with the diagonal bar, hammer lamps, shoulder line rising to the rear, tall C-shaped tail lamps climbing the pillars, roof spoiler and twin rectangular tailpipes.",
    source: "volvo-xc60,commons",
  },
  // XC90 II (2015-): 4.953 m
  car_volvo_xc90: {
    face: { grilleW: 0.42, bars: 8, intake: "wide", sig: "thors-hammer" },
    rear: { lamp: "vertical", exhaust: "twin" },
    body: { belt: 0.66, roofTaper: 0.03, tumble: 0.09, hood: 0.27, ws: 1.1, rr: 0.4, roof: "flat", clearance: 0.24, windowTrim: "chrome", crease: 0.5, cladding: 0.3, rails: true, spoiler: true, kick: false, mirror: "body" },
    wheels: { rim: 21, tyre: "275/40", style: "ten", spokes: 10 },
    notes: "Large seven-seat SUV: tall wide grille with the diagonal mark, hammer lamps, long flat-sided glasshouse with silver rails, side vent behind the front wheel, big multi-spoke wheels.",
    source: "volvo-xc90,commons",
  },

  // ---------------- Polestar ----------------
  // Polestar 2 (2020-): 4.606 m fastback
  car_polestar_2: {
    face: { grille: "closed", grilleW: 0.35, lamp: "slim", drl: "c", intake: "none", fog: false, sig: "thors-hammer" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.7, roofTaper: 0.08, tumble: 0.1, hood: 0.27, ws: 1.35, rr: 0.9, roof: "fastback", clearance: 0.15, windowTrim: "black", crease: 0.4, cladding: 0, spoiler: true, kick: false, top: "glass", mirror: "body" },
    wheels: { rim: 19, tyre: "245/40", style: "twin", spokes: 5 },
    notes: "Fastback hatch: dark closed smart-zone panel in place of a grille, hammer lamps, frameless doors, dark glass roof, one tail bar across the lip spoiler, 19 inch twin-spoke wheels.",
    source: "polestar-2,commons",
  },

  // ---------------- Tesla ----------------
  // Model 3 (2017-2023): 4.694 m
  car_tesla_model_3: {
    face: { intake: "wide" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.68, roofTaper: 0.09, tumble: 0.1, hood: 0.22, ws: 1.5, rr: 0.9, roof: "fastback", clearance: 0.14, windowTrim: "black", crease: 0.4, cladding: 0, spoiler: false, kick: false, top: "glass", mirror: "body" },
    wheels: { rim: 18, tyre: "235/45", style: "turbine", spokes: 5 },
    notes: "Sleek saloon: short smooth nose with a narrow lower vent, slim lamps, glass roof flowing into the boot lid, black window frames, boomerang tail lamps, wheels with aero covers.",
    source: "tesla-m3,commons",
  },
  // Model Y (2020-): 4.751 m
  car_tesla_model_y: {
    face: { intake: "wide" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.67, roofTaper: 0.07, tumble: 0.1, hood: 0.22, ws: 1.4, rr: 0.8, roof: "fastback", clearance: 0.17, windowTrim: "black", crease: 0.4, cladding: 0.1, spoiler: true, kick: false, top: "glass", mirror: "body" },
    wheels: { rim: 19, tyre: "255/45", style: "turbine", spokes: 5 },
    notes: "Tall liftback crossover: smooth closed nose with a slim lower vent, long glass roof tapering to a small lip spoiler, black window frames and lower trim, slim tail lamps, flat black aero wheels.",
    source: "tesla-my,commons",
  },
  // Model S (2012-2021 liftback): 4.979 m
  car_tesla_model_s: {
    face: { intake: "wide", fog: true },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.7, roofTaper: 0.08, tumble: 0.1, hood: 0.24, ws: 1.5, rr: 0.9, roof: "fastback", clearance: 0.14, windowTrim: "chrome", crease: 0.4, cladding: 0, spoiler: false, kick: false, top: "glass", mirror: "body" },
    wheels: { rim: 19, tyre: "245/45", style: "turbine", spokes: 5 },
    notes: "Large low liftback: closed nose with a lower slot holding fog lamps, chrome window surround, glass roof running to a tapering hatch, wide wrap tail lamps, silver multi-spoke wheels.",
    source: "tesla-ms,commons",
  },
  // Model X (2015-): 5.036 m
  car_tesla_model_x: {
    face: { intake: "wide", fog: true },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.64, roofTaper: 0.06, tumble: 0.1, hood: 0.2, ws: 1.8, rr: 0.8, roof: "fastback", clearance: 0.17, windowTrim: "chrome", crease: 0.3, cladding: 0.1, spoiler: true, kick: false, top: "glass", mirror: "body" },
    wheels: { rim: 20, tyre: "255/45", style: "twin", spokes: 5 },
    notes: "Large SUV: rounded teardrop body, windscreen running far back over the front seats, chrome window line, glass roof, narrow slot with fogs in the nose, falcon-wing rear doors.",
    source: "tesla-mx,commons",
  },
  // Cybertruck (2023-): 5.683 m
  car_tesla_cybertruck: {
    face: { grille: "closed", grilleW: 0.3, lamp: "slim", drl: "bar", intake: "wide", fog: false, sig: "light-bar" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.66, roofTaper: 0.12, tumble: 0.05, hood: 0.3, ws: 1.7, rr: 0.4, roof: "fastback", clearance: 0.25, windowTrim: "none", crease: 1, cladding: 0.4, spoiler: false, kick: false, cab: "double", bed: "cover", top: "glass", mirror: "black", skid: "black" },
    wheels: { rim: 20, tyre: "275/60", style: "ten", spokes: 8 },
    notes: "Flat stainless panels and sharp angles: one straight roof line from the short sloping nose to the tail, full-width light bar, black bumper and wide black arch flares, covered bed.",
    source: "tesla-ct,commons",
  },

  // ---------------- Jeep ----------------
  // Renegade (2014-): 4.236 m
  car_jeep_renegade: {
    face: { grille: "slats", grilleW: 0.4, grilleChrome: true, lamp: "round", drl: "none", intake: "none", fog: true, bars: 7, sig: "round-lamps" },
    rear: { lamp: "block", exhaust: "single", bar: false },
    body: { belt: 0.67, roofTaper: 0.01, tumble: 0.08, hood: 0.22, ws: 1.25, rr: 0.2, roof: "flat", clearance: 0.18, windowTrim: "black", crease: 0.4, cladding: 0.6, rails: true, spoiler: false, kick: false, pillars: "body", mirror: "black", skid: "black" },
    wheels: { rim: 17, tyre: "215/60", style: "twin", spokes: 5 },
    notes: "Squared-off baby Jeep: seven-slot grille between round lamps, round fog lamps in a black bumper, trapezoid arches with thick cladding, black roof rails, upright tailgate with X-marked tail lamps.",
    source: "jeep-reneg,commons",
  },
  // Wrangler JL Unlimited (2018-): 4.882 m four-door
  car_jeep_wrangler: {
    face: { grille: "slats", grilleW: 0.4, lamp: "round", drl: "strip", intake: "none", fog: true, bars: 7, sig: "round-led-ring" },
    rear: { lamp: "block", exhaust: "single", bar: false },
    body: { belt: 0.65, roofTaper: 0, tumble: 0.05, hood: 0.22, ws: 0.5, rr: 0.1, roof: "flat", clearance: 0.25, windowTrim: "none", crease: 0.2, cladding: 0.6, rails: false, spoiler: false, kick: false, pillars: "body", top: "body", mirror: "black", skid: "black" },
    wheels: { rim: 17, tyre: "255/75", style: "five", spokes: 5 },
    notes: "Slab-sided off-roader: upright flat windscreen, seven-slot grille between round lamps, black fender flares with exposed hinges, steel bumper with fogs, hard top, spare wheel on the tailgate.",
    source: "jeep-wrang,commons",
  },

  // ---------------- Land Rover ----------------
  // Defender 90 (2020-): 4.323 m, three-door
  car_land_rover_defender_90: {
    face: { intake: "wide", sig: "round-led" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.66, roofTaper: 0, tumble: 0.05, hood: 0.22, ws: 0.7, rr: 0.1, roof: "flat", clearance: 0.23, windowTrim: "none", crease: 0.3, cladding: 0.3, rails: true, spoiler: false, kick: false, pillars: "body", mirror: "black" },
    wheels: { rim: 20, tyre: "255/60", style: "five", spokes: 5 },
    notes: "Short three-door Defender: blunt upright nose with a narrow grille bar and round lamps, silver bumper skid, tall boxy shape with alpine-light roof windows, side-hinged tailgate with the spare wheel.",
    source: "lr-def,commons",
  },
  // Defender 110 (2020-): 5.018 m, five-door
  car_land_rover_defender_110: {
    face: { intake: "wide", sig: "round-led" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.66, roofTaper: 0, tumble: 0.05, hood: 0.2, ws: 0.7, rr: 0.1, roof: "flat", clearance: 0.23, windowTrim: "none", crease: 0.3, cladding: 0.3, rails: true, spoiler: false, kick: false, pillars: "body", mirror: "black" },
    wheels: { rim: 20, tyre: "255/60", style: "five", spokes: 5 },
    notes: "Long five-door Defender: slab sides, narrow grille bar between round lamps, silver bumper skid, side vent, long flat roof with alpine-light windows, big five-spoke wheels, tall rear lamps.",
    source: "lr-def,commons",
  },

  // ---------------- Chevrolet ----------------
  // Bolt EV (2017-2021): 4.166 m
  car_chevrolet_bolt_ev: {
    face: { grille: "closed", grilleW: 0.35, lamp: "angular", drl: "strip", intake: "wide", fog: false, sig: "led-strip" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.64, roofTaper: 0.04, tumble: 0.1, hood: 0.2, ws: 1.0, rr: 0.7, roof: "flat", clearance: 0.15, windowTrim: "none", crease: 0.3, cladding: 0, spoiler: true, kick: true, pillars: "black", mirror: "body" },
    wheels: { rim: 17, tyre: "215/50", style: "twin", spokes: 5 },
    notes: "Tall five-door electric hatch: short blunt nose, closed upper panel with a mesh lower intake, swept slim lamps, dark rear pillar, roof spoiler, 17 inch twin-spoke wheels.",
    source: "chevy-bolt,commons",
  },
  // Corvette C8 (2020-): 4.63 m, mid-engine
  car_chevrolet_corvette: {
    face: { grille: "mesh", grilleW: 0.4, lamp: "angular", drl: "strip", intake: "split", fog: false, sig: "led-eyebrow" },
    rear: { lamp: "block", exhaust: "twin", bar: false },
    body: { belt: 0.72, roofTaper: 0.1, tumble: 0.12, hood: 0.22, ws: 2.0, rr: 0.5, roof: "fastback", clearance: 0.11, windowTrim: "black", crease: 0.8, cladding: 0, spoiler: true, kick: true, mirror: "black" },
    wheels: { rim: 19, tyre: "245/35", style: "twin", spokes: 5 },
    notes: "Mid-engine supercar: very low sharply sloped nose with a mesh centre mouth and two side intake pods, slim swept lamps, big side intake behind the doors, high rear deck, quad exhaust.",
    source: "chevy-c8,commons",
  },

  // ---------------- Dodge ----------------
  // Challenger (LC, 2008-2023): 5.022 m
  car_dodge_challenger: {
    face: { grille: "mesh", grilleW: 0.5, lamp: "round", drl: "strip", intake: "wide", fog: false, sig: "quad-halo" },
    rear: { lamp: "round", exhaust: "twin", bar: false },
    body: { belt: 0.72, roofTaper: 0.03, tumble: 0.08, hood: 0.36, ws: 1.5, rr: 0.5, roof: "notchback", clearance: 0.12, windowTrim: "black", crease: 0.8, cladding: 0, spoiler: true, kick: false, mirror: "body" },
    wheels: { rim: 20, tyre: "245/45", style: "ten", spokes: 10 },
    notes: "Retro two-door muscle coupe: long flat bonnet, wide black mesh mouth between pairs of round lamps, flat roof and short deck with a lip, ring-shaped tail lamps, twin exhaust.",
    source: "dodge-chall,commons",
  },
};

// photos (Commons file titles viewed for the visual check):
// car_ford_fiesta: 2018 Ford Fiesta Style 1.1 Front.jpg; 2018 Ford Fiesta Style 1.1 Rear.jpg
// car_ford_focus: 2019 Ford Focus ST-Line EcoBoost (front).jpg; 2019 Ford Focus ST-Line EcoBoost (rear).jpg
// car_ford_puma: 2020 Ford Puma Titanium EcoBoost Hybrid 1.0 Front.jpg; 2020 Ford Puma Titanium EcoBoost Hybrid 1.0 Rear.jpg
// car_ford_kuga: 2020 Ford Kuga Titanium First Edition EcoBlue 1.5.jpg
// car_ford_transit_custom: 2018 Ford Transit Custom 280 Limited facelift 2.0 Front.jpg; 2018 Ford Transit Custom 280 Limited facelift 2.0 Rear.jpg
// car_ford_ranger: 2020 Ford Ranger Wildtrak second facelift front.jpg; 2020 Ford Ranger Wildtrak second facelift rear.jpg
// car_ford_f_150: 2021 Ford F-150 SuperCrew, front 4.28.21.jpg; 2021 Ford F-150 SuperCrew, rear 4.28.21.jpg
// car_ford_mustang: 2019 Ford Mustang GT 5.0 facelift.jpg
// car_ford_mustang_mach_e: 2021 Ford Mustang Mach-E Standard Range Front.jpg; 2021 Ford Mustang Mach-E Standard Range Rear.jpg
// car_volvo_ex30: Volvo EX30 IMG 8923.jpg
// car_volvo_xc40: 2019 Volvo XC40 T5 Momentum in Bright Silver Metallic, front left, 2025-09-22.jpg
// car_volvo_v60: 2018 Volvo V60 Inscription PRO D4 Automatic 2.0.jpg
// car_volvo_xc60: 2018 Volvo XC60 R-Design D5 P-Pulse 2.0 Front.jpg; 2018 Volvo XC60 R-Design D5 P-Pulse 2.0 Rear.jpg
// car_volvo_xc90: Volvo XC90 T8 AWD Plug-in Hybrid Plus (II, 2. Facelift) – f 03102025.jpg
// car_polestar_2: Polestar 2 – f 02042021.jpg
// car_tesla_model_3: Tesla Model 3 (2023) Autofrühling Ulm IMG 9282.jpg
// car_tesla_model_y: 2024 Tesla Model Y RWD front.jpg; 2024 Tesla Model Y RWD rear.jpg
// car_tesla_model_s: Tesla Model S (Facelift ab 04-2016) (cropped).jpg
// car_tesla_model_x: 2017 Tesla Model X 100D Front.jpg; 2017 Tesla Model X 100D Rear.jpg
// car_tesla_cybertruck: 2024 Tesla Cybertruck Foundation Series, front left (Greenwich).jpg
// car_jeep_renegade: Jeep Renegade 1.6 MultiJet 2WD Longitude – Frontansicht, 9. November 2014, Düsseldorf.jpg
// car_jeep_wrangler: Jeep Wrangler Unlimited (JL) PHEV IMG 5808.jpg
// car_land_rover_defender_90: (no 90 photo; the 110 photo below shows the same face)
// car_land_rover_defender_110: Land Rover Defender 110 D40 SE L663 Pangea Green (1) (cropped).jpg
// car_chevrolet_bolt_ev: 2022 Chevrolet Bolt EV 2LT, NYC official fleet 1.2.23.jpg
// car_chevrolet_corvette: Chevrolet Corvette C8 IAA 2021 1X7A0156.jpg
// car_dodge_challenger: Dodge Challenger SRT8 (2015) Hirschaid-20220709-RM-120221 (cropped).jpg
