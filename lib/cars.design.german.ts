import type { DesignRow } from "./cars.design.ts";

// German premium: BMW, Mini, Mercedes-Benz, Porsche, Smart. Our own descriptions of each generation's styling; no images or text are copied.
// BMW: twin kidney grille (size grows per generation, closed and framed on the EVs), Hofmeister kink, hexagonal / L-shaped lamp signatures, L-shaped tail lamps.
// Mini: round lamps with LED ring, wide hexagonal grille, high belt, short overhangs. Mercedes: star grille (two louvres; vertical-bar Panamericana on the AMG GT).
// Porsche: round lamps with four-point DRL, light-bar tails. Smart: Tridion cell, tiny snub body.
//
// sources:
//   bmw-f40 = https://en.wikipedia.org/wiki/BMW_1_Series_(F40)
//   bmw-g20 = https://en.wikipedia.org/wiki/BMW_3_Series_(G20)
//   bmw-g22 = https://en.wikipedia.org/wiki/BMW_4_Series_(G22)
//   bmw-g30 = https://en.wikipedia.org/wiki/BMW_5_Series_(G30)
//   bmw-i3 = https://en.wikipedia.org/wiki/BMW_i3
//   bmw-i4 = https://en.wikipedia.org/wiki/BMW_i4
//   bmw-ix = https://en.wikipedia.org/wiki/BMW_iX
//   bmw-f48 = https://en.wikipedia.org/wiki/BMW_X1_(F48)
//   bmw-g01 = https://en.wikipedia.org/wiki/BMW_X3_(G01)
//   bmw-g05 = https://en.wikipedia.org/wiki/BMW_X5_(G05)
//   bmw-g29 = https://en.wikipedia.org/wiki/BMW_Z4_(G29)
//   mini-f56 = https://en.wikipedia.org/wiki/Mini_Hatch
//   mb-w177 = https://en.wikipedia.org/wiki/Mercedes-Benz_A-Class_(W177)
//   mb-w206 = https://en.wikipedia.org/wiki/Mercedes-Benz_C-Class_(W206)
//   mb-w213 = https://en.wikipedia.org/wiki/Mercedes-Benz_E-Class_(W213)
//   mb-h247 = https://en.wikipedia.org/wiki/Mercedes-Benz_GLA-Class
//   mb-eqa = https://en.wikipedia.org/wiki/Mercedes-Benz_EQA
//   mb-x253 = https://en.wikipedia.org/wiki/Mercedes-Benz_GLC-Class
//   mb-w463a = https://en.wikipedia.org/wiki/Mercedes-Benz_G-Class
//   mb-c190 = https://en.wikipedia.org/wiki/Mercedes-AMG_GT
//   mb-w447 = https://en.wikipedia.org/wiki/Mercedes-Benz_Vito
//   mb-w907 = https://en.wikipedia.org/wiki/Mercedes-Benz_Sprinter
//   por-992 = https://en.wikipedia.org/wiki/Porsche_992
//   por-982 = https://en.wikipedia.org/wiki/Porsche_Boxster_(982)
//   por-taycan = https://en.wikipedia.org/wiki/Porsche_Taycan
//   por-macan = https://en.wikipedia.org/wiki/Porsche_Macan
//   por-cayenne = https://en.wikipedia.org/wiki/Porsche_Cayenne
//   smart-w453 = https://en.wikipedia.org/wiki/Smart_Fortwo
//   commons = https://commons.wikimedia.org (photos of each generation, viewed for verification only)

export const BRANDS: Record<string, DesignRow> = {
  BMW: {
    face: { grille: "slats", grilleW: 0.34, grilleChrome: true, lamp: "slim", drl: "c", intake: "split", fog: false, bars: 8, id: "bmw-kidney", sig: "hex-drl" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { mirror: "body", windowTrim: "chrome" },
    wheels: { rim: 18, style: "twin", spokes: 5 },
    source: "bmw-g20",
  },
  Mini: {
    face: { grille: "shield", grilleW: 0.4, grilleChrome: true, lamp: "round", drl: "strip", intake: "wide", fog: true, bars: 0, id: "mini-hex", sig: "led-ring" },
    rear: { lamp: "block", exhaust: "single" },
    body: { mirror: "body", windowTrim: "black" },
    wheels: { rim: 16, style: "twin", spokes: 5 },
    source: "mini-f56",
  },
  "Mercedes-Benz": {
    face: { grille: "slats", grilleW: 0.36, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: false, bars: 2, id: "mercedes-star-grille", sig: "eyebrow-led" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { mirror: "body", windowTrim: "chrome" },
    wheels: { rim: 18, style: "twin", spokes: 5 },
    source: "mb-w206",
  },
  Porsche: {
    face: { grille: "closed", grilleW: 0.35, grilleChrome: false, lamp: "round", drl: "c", intake: "split", fog: false, bars: 0, id: "porsche-round", sig: "four-point-drl" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { mirror: "body", windowTrim: "black" },
    wheels: { rim: 20, style: "twin", spokes: 5 },
    source: "por-992",
  },
  Smart: {
    face: { grille: "bar", grilleW: 0.45, grilleChrome: false, lamp: "wide", drl: "strip", intake: "none", fog: false, bars: 0, id: "smart-tridion", sig: "led-strip" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { mirror: "body", windowTrim: "none" },
    wheels: { rim: 15, style: "five", spokes: 5 },
    source: "smart-w453",
  },
};

export const ROWS: Record<string, DesignRow> = {
  // ---- BMW ----
  car_bmw_1_series: {
    face: { grilleW: 0.33, lamp: "angular", drl: "c", intake: "split", bars: 7, sig: "hex-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.03, tumble: 0.1, hood: 0.25, roof: "flat", clearance: 0.13, pillars: "body", windowTrim: "black", crease: 0.5, cladding: 0.1, spoiler: true, kick: false },
    wheels: { rim: 17, tyre: "225/45", style: "twin", spokes: 5 },
    notes: "Front-drive F40 hatch: short bonnet, tall upright cabin, small kidneys, slim hexagon-signature lamps, black-trimmed windows, slim wrap tail lamps and a shallow roof spoiler.",
    source: "bmw-f40,commons",
  },
  car_bmw_3_series: {
    face: { grilleW: 0.34, lamp: "slim", drl: "c", intake: "split", bars: 9, sig: "hex-drl" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.7, roofTaper: 0.06, tumble: 0.09, hood: 0.3, roof: "notchback", clearance: 0.13, pillars: "body", windowTrim: "black", crease: 0.8, cladding: 0.05, spoiler: false, kick: true },
    wheels: { rim: 18, tyre: "225/40", style: "twin", spokes: 5 },
    notes: "G20 sedan: long bonnet, cab-rearward stance, kidneys that join the bumper intake, razor-slim lamps, Hofmeister kink, sharp shoulder line, L-shaped tail lamps, twin tailpipes.",
    source: "bmw-g20,commons",
  },
  car_bmw_4_series_coupe: {
    face: { grilleW: 0.42, lamp: "slim", drl: "c", intake: "split", bars: 11, sig: "hex-drl" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.72, roofTaper: 0.09, tumble: 0.11, hood: 0.32, ws: 1.5, rr: 1.0, roof: "fastback", clearance: 0.12, pillars: "body", windowTrim: "none", crease: 0.85, cladding: 0, spoiler: true, kick: true },
    wheels: { rim: 18, tyre: "225/45", style: "twin", spokes: 5 },
    notes: "G22 coupe: enormous upright kidney pair with vertical bars, low wide stance, frameless doors, long bonnet, fastback roof with a lip spoiler, slim L-shaped tail lamps and twin pipes.",
    source: "bmw-g22,commons",
  },
  car_bmw_5_series: {
    face: { grilleW: 0.36, lamp: "slim", drl: "c", intake: "wide", bars: 9, sig: "hex-drl-pair" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.69, roofTaper: 0.05, tumble: 0.09, hood: 0.31, roof: "notchback", clearance: 0.13, pillars: "body", windowTrim: "chrome", crease: 0.6, cladding: 0, spoiler: false, kick: true },
    wheels: { rim: 18, tyre: "245/45", style: "twin", spokes: 5 },
    notes: "G30 executive sedan: wide chrome-rimmed kidneys joined to the bumper intake, narrow lamps with twin hex DRL tubes, long bonnet, chrome window frames, two exhaust tips.",
    source: "bmw-g30,commons",
  },
  car_bmw_i3: {
    face: { grille: "closed", grilleW: 0.3, grilleChrome: true, lamp: "angular", drl: "strip", intake: "none", bars: 0, sig: "u-shaped-drl" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.7, roofTaper: 0.02, tumble: 0.11, hood: 0.17, ws: 1.2, rr: 0.5, roof: "flat", clearance: 0.15, pillars: "black", windowTrim: "none", crease: 0.3, cladding: 0.2, spoiler: false, top: "contrast", accent: "#1c1c1c", kick: true, rails: false },
    wheels: { rim: 19, tyre: "155/70", style: "five", spokes: 5 },
    notes: "Tall narrow city EV: small blanked kidney with chrome frame, black bonnet and roof against the body colour, rear-hinged back doors without B pillar, black glass tailgate with lamps, thin multi-spoke wheels.",
    source: "bmw-i3,commons",
  },
  car_bmw_i4: {
    face: { grille: "closed", grilleW: 0.4, grilleChrome: false, lamp: "slim", drl: "c", intake: "split", bars: 0, sig: "hex-drl" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.7, roofTaper: 0.08, tumble: 0.1, hood: 0.31, ws: 1.5, rr: 1.0, roof: "fastback", clearance: 0.13, pillars: "body", windowTrim: "none", crease: 0.7, cladding: 0, spoiler: true, kick: true },
    wheels: { rim: 18, tyre: "225/55", style: "ten", spokes: 10 },
    notes: "Gran Coupe EV: huge closed kidney with a frame, black corner air vents, long low five-door fastback with hatch and lip spoiler, frameless doors, slim lamps, multi-spoke alloys, blue accent trim.",
    source: "bmw-i4,commons",
  },
  car_bmw_ix: {
    face: { grille: "mesh", grilleW: 0.5, grilleChrome: false, lamp: "slim", drl: "strip", intake: "split", bars: 0, sig: "thin-led-strip" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.7, roofTaper: 0.04, tumble: 0.1, hood: 0.28, ws: 1.1, rr: 0.7, roof: "flat", clearance: 0.2, pillars: "black", windowTrim: "none", crease: 0.5, cladding: 0.45, spoiler: true, top: "glass", kick: false, rails: false },
    wheels: { rim: 21, tyre: "255/45", style: "ten", spokes: 10 },
    notes: "Large EV SUV: very wide octagonal mesh kidney over razor-thin lamps, big black corner pods, frameless doors, blacked-out rear pillar, slim wrap tail lamps, wide black arches and multi-spoke alloys.",
    source: "bmw-ix,commons",
  },
  car_bmw_x1: {
    face: { grilleW: 0.35, lamp: "angular", drl: "c", intake: "split", fog: true, bars: 7, sig: "hex-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.04, tumble: 0.1, hood: 0.27, roof: "flat", clearance: 0.18, pillars: "body", windowTrim: "chrome", crease: 0.6, cladding: 0.4, spoiler: true, rails: true, kick: false },
    wheels: { rim: 18, tyre: "225/50", style: "ten", spokes: 10 },
    notes: "F48 compact crossover: upright tall body, two tall kidneys with thin bars, round fog lamps in a black bumper, black arch cladding, roof rails, rear spoiler and large L-shaped tail lamps on a near-vertical tailgate.",
    source: "bmw-f48,commons",
  },
  car_bmw_x3: {
    face: { grilleW: 0.37, lamp: "slim", drl: "c", intake: "wide", fog: true, bars: 8, sig: "hex-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.05, tumble: 0.1, hood: 0.3, ws: 1.15, roof: "flat", clearance: 0.2, pillars: "body", windowTrim: "chrome", crease: 0.7, cladding: 0.45, spoiler: true, rails: true, kick: false },
    wheels: { rim: 19, tyre: "245/45", style: "ten", spokes: 10 },
    notes: "G01 mid SUV: big tall kidneys, slim LED lamps with hex signature, vertical fog lamps in the bumper corners, strong shoulder line, black cladding, roof rails and large L-shaped tail lamps.",
    source: "bmw-g01,commons",
  },
  car_bmw_x5: {
    face: { grilleW: 0.44, lamp: "slim", drl: "c", intake: "wide", fog: true, bars: 7, sig: "split-drl" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.68, roofTaper: 0.05, tumble: 0.1, hood: 0.3, ws: 1.15, roof: "flat", clearance: 0.22, pillars: "body", windowTrim: "chrome", crease: 0.8, cladding: 0.35, spoiler: true, rails: true, kick: false },
    wheels: { rim: 20, tyre: "275/45", style: "twin", spokes: 5 },
    notes: "G05 large SUV: giant joined chrome-rimmed kidneys filling the front, narrow lamps, corner intake pods, strong haunches, slim wide tail lamps over big trapezoid twin tailpipes, roof spoiler.",
    source: "bmw-g05,commons",
  },
  car_bmw_z4: {
    face: { grille: "mesh", grilleW: 0.38, lamp: "slim", drl: "c", intake: "split", fog: false, bars: 0, sig: "hex-drl" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.72, roofTaper: 0.02, tumble: 0.1, hood: 0.38, ws: 1.5, rr: 0.4, roof: "notchback", clearance: 0.1, pillars: "body", windowTrim: "none", crease: 0.7, cladding: 0, spoiler: true, top: "soft", kick: false },
    wheels: { rim: 18, tyre: "255/40", style: "twin", spokes: 5 },
    notes: "G29 roadster: very long bonnet, cab pushed far back, black fabric roof, mesh kidneys flanked by large corner air intakes, short tail with ducktail lip, slim L tail lamps, trapezoid twin pipes.",
    source: "bmw-g29,commons",
  },

  // ---- Mini ----
  car_mini_cooper: {
    face: { grille: "shield", grilleW: 0.42, grilleChrome: true, lamp: "round", drl: "strip", intake: "wide", fog: true, bars: 0, sig: "led-ring" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.7, roofTaper: 0.02, tumble: 0.1, hood: 0.22, ws: 1.3, rr: 0.6, roof: "flat", clearance: 0.13, pillars: "body", windowTrim: "black", crease: 0.3, cladding: 0.35, spoiler: true, top: "body", kick: false },
    wheels: { rim: 16, tyre: "195/55", style: "twin", spokes: 5 },
    notes: "F56 three-door: big round LED-ring lamps and round fog lamps beside a wide black hexagonal grille, thick black arch trims, high beltline, upright rectangular tail lamps, roof spoiler.",
    source: "mini-f56,commons",
  },

  // ---- Mercedes-Benz ----
  car_mercedes_benz_a_class: {
    face: { grille: "mesh", grilleW: 0.38, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", bars: 0, sig: "eyebrow-led" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.68, roofTaper: 0.04, tumble: 0.1, hood: 0.26, roof: "flat", clearance: 0.13, pillars: "body", windowTrim: "chrome", crease: 0.6, cladding: 0, spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "225/45", style: "twin", spokes: 5 },
    notes: "W177 hatch: short nose with slit lamps, wide diamond-mesh grille with a big star, black corner air pods, beltline climbing to the rear, wide two-part tail lamps and a diffuser with trim tips.",
    source: "mb-w177,commons",
  },
  car_mercedes_benz_c_class: {
    face: { grilleW: 0.34, lamp: "slim", drl: "strip", intake: "wide", bars: 2, sig: "twin-led-tubes" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.7, roofTaper: 0.06, tumble: 0.09, hood: 0.3, roof: "notchback", clearance: 0.13, pillars: "body", windowTrim: "chrome", crease: 0.5, cladding: 0, spoiler: false, kick: false },
    wheels: { rim: 18, tyre: "225/45", style: "ten", spokes: 10 },
    notes: "W206 sedan: long bonnet, narrow angular lamps with twin LED tubes, wide star grille, clean flanks, wide two-part tail lamps over a chrome trim strip with integrated tips, multi-spoke wheels.",
    source: "mb-w206,commons",
  },
  car_mercedes_benz_e_class: {
    face: { grilleW: 0.34, lamp: "wide", drl: "strip", intake: "wide", bars: 3, sig: "twin-eye-led" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.69, roofTaper: 0.05, tumble: 0.09, hood: 0.3, roof: "notchback", clearance: 0.13, pillars: "body", windowTrim: "chrome", crease: 0.5, cladding: 0, spoiler: false, kick: false },
    wheels: { rim: 18, tyre: "245/45", style: "ten", spokes: 10 },
    notes: "W213 sedan before the facelift: twin-eye headlamps, chrome-framed slatted grille, long smooth flanks, chrome window frames and sill strip, wide two-part tail lamps, multi-spoke wheels.",
    source: "mb-w213,commons",
  },
  car_mercedes_benz_gla: {
    face: { grille: "mesh", grilleW: 0.38, lamp: "slim", drl: "strip", intake: "wide", bars: 0, sig: "eyebrow-led" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.68, roofTaper: 0.04, tumble: 0.1, hood: 0.27, roof: "flat", clearance: 0.18, pillars: "body", windowTrim: "chrome", crease: 0.6, cladding: 0.4, spoiler: true, rails: true, kick: true },
    wheels: { rim: 18, tyre: "235/50", style: "twin", spokes: 5 },
    notes: "H247 compact crossover: A-Class face on a taller body, wide diamond-mesh grille, slit lamps, silver roof rails, split red tail lamps reaching into the tailgate, black cladding, silver bumper trim.",
    source: "mb-h247,commons",
  },
  car_mercedes_benz_eqa: {
    face: { grille: "closed", grilleW: 0.42, grilleChrome: false, lamp: "slim", drl: "bar", intake: "split", bars: 0, sig: "full-width-led-bar" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: true },
    body: { belt: 0.68, roofTaper: 0.04, tumble: 0.1, hood: 0.26, roof: "flat", clearance: 0.18, pillars: "body", windowTrim: "chrome", crease: 0.55, cladding: 0.35, spoiler: true, rails: true, kick: true },
    wheels: { rim: 19, tyre: "235/45", style: "ten", spokes: 10 },
    notes: "Electric GLA twin: black panel front with a full-width LED strip joining the slim headlamps, silver lower bumper, silver roof rails, full-width red light bar across the tailgate, multi-spoke wheels.",
    source: "mb-eqa,commons",
  },
  car_mercedes_benz_glc: {
    face: { grilleW: 0.37, lamp: "angular", drl: "strip", intake: "wide", fog: false, bars: 2, sig: "led-brow" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.68, roofTaper: 0.04, tumble: 0.1, hood: 0.28, ws: 1.15, roof: "flat", clearance: 0.21, pillars: "body", windowTrim: "chrome", crease: 0.6, cladding: 0.3, spoiler: true, rails: true, kick: false, skid: "silver" },
    wheels: { rim: 19, tyre: "235/55", style: "twin", spokes: 5 },
    notes: "X253 mid SUV: two-louvre chrome star grille between angular lamps, rounded body with a shoulder crease, chrome window frames and rails, wide L-ish tail lamps over a chrome-edged bumper with twin tips.",
    source: "mb-x253,commons",
  },
  car_mercedes_benz_g_class: {
    face: { grilleW: 0.4, grilleChrome: true, lamp: "round", drl: "c", intake: "wide", fog: true, bars: 2, sig: "led-ring" },
    rear: { lamp: "block", exhaust: "twin" },
    body: { belt: 0.6, roofTaper: 0, tumble: 0.05, hood: 0.2, ws: 0.6, rr: 0.15, roof: "flat", clearance: 0.24, pillars: "body", windowTrim: "black", crease: 0.15, cladding: 0.3, spoiler: false, rails: false, kick: false, skid: "silver", mirror: "black" },
    wheels: { rim: 19, tyre: "275/50", style: "twin", spokes: 5 },
    notes: "W463A Geländewagen: upright box with a flat bonnet, round LED-ring headlamps, bolt-on arch flares, exposed door hinges, small tail lamps and a spare wheel in a cover on the side-hinged rear door.",
    source: "mb-w463a,commons",
  },
  "car_mercedes_benz_amg_gt": {
    face: { grille: "slats", grilleW: 0.38, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: false, bars: 15, sig: "panamericana-vertical-bars" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.72, roofTaper: 0.1, tumble: 0.13, hood: 0.4, ws: 1.6, rr: 0.9, roof: "fastback", clearance: 0.11, pillars: "body", windowTrim: "chrome", crease: 0.9, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 19, tyre: "265/35", style: "ten", spokes: 10 },
    notes: "C190 AMG GT: Panamericana grille of vertical chrome bars low in the nose, extremely long bonnet, cabin pushed back, huge rear haunches, thin wrap tail lamps, chrome tailpipes, black 10-spoke wheels.",
    source: "mb-c190,commons",
  },
  car_mercedes_benz_vito: {
    face: { grilleW: 0.38, lamp: "angular", drl: "strip", intake: "wide", fog: true, bars: 2, sig: "led-brow" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.6, roofTaper: 0, tumble: 0.05, hood: 0.2, ws: 0.8, rr: 0.1, roof: "flat", clearance: 0.17, pillars: "body", windowTrim: "black", crease: 0.3, cladding: 0.1, spoiler: false, rails: false, kick: false, slide: true },
    wheels: { rim: 16, tyre: "205/65", style: "steel", spokes: 5 },
    notes: "W447 mid van: bonneted cab with steep screen, flat roof, slatted star grille with a split lower intake, sliding side door, single tailgate with tall vertical tail lamps.",
    source: "mb-w447,commons",
  },
  car_mercedes_benz_sprinter: {
    face: { grilleW: 0.4, grilleChrome: false, lamp: "angular", drl: "strip", intake: "wide", fog: false, bars: 2, sig: "led-brow" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.6, roofTaper: 0, tumble: 0.05, hood: 0.17, ws: 0.7, rr: 0.05, roof: "flat", clearance: 0.2, pillars: "body", windowTrim: "black", crease: 0.2, cladding: 0.3, spoiler: false, rails: false, kick: false, slide: true },
    wheels: { rim: 16, tyre: "235/65", style: "steel", spokes: 5 },
    notes: "W907 large van: very tall box body with a short blunt nose, black slatted grille with a big star, dark lower body and bumper band, sliding side door, tall barn rear doors with slim vertical tail lamps.",
    source: "mb-w907,commons",
  },

  // ---- Porsche ----
  car_porsche_911: {
    face: { grille: "closed", grilleW: 0.35, lamp: "round", drl: "c", intake: "split", fog: false, bars: 0, sig: "four-point-drl" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { belt: 0.7, roofTaper: 0.1, tumble: 0.14, hood: 0.24, ws: 1.4, rr: 0.8, roof: "fastback", clearance: 0.1, pillars: "body", windowTrim: "black", crease: 0.8, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 20, tyre: "245/35", style: "ten", spokes: 10 },
    notes: "992 Carrera: low round lamps with four-point DRL, single wide lower intake, short sloping bonnet, fastback roof, slatted engine lid, thin full-width tail light bar, rectangular twin tips, ducktail.",
    source: "por-992,commons",
  },
  car_porsche_718_boxster: {
    face: { grille: "closed", grilleW: 0.35, lamp: "round", drl: "c", intake: "split", fog: false, bars: 0, sig: "four-point-drl" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { belt: 0.72, roofTaper: 0.05, tumble: 0.15, hood: 0.26, ws: 1.5, rr: 0.4, roof: "fastback", clearance: 0.11, pillars: "body", windowTrim: "black", crease: 0.85, cladding: 0, spoiler: true, top: "soft", kick: false },
    wheels: { rim: 19, tyre: "235/40", style: "ten", spokes: 10 },
    notes: "718 roadster: round lamps over wide lower intakes, side intakes ahead of the rear wheels, black fabric roof, rear lip spoiler, slim tail lamp strip, round twin tips, black multi-spoke wheels.",
    source: "por-982,commons",
  },
  car_porsche_taycan: {
    face: { grille: "closed", grilleW: 0.4, lamp: "round", drl: "c", intake: "split", fog: false, bars: 0, sig: "four-point-drl" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.7, roofTaper: 0.09, tumble: 0.12, hood: 0.27, ws: 1.5, rr: 0.9, roof: "fastback", clearance: 0.12, pillars: "body", windowTrim: "black", crease: 0.7, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 19, tyre: "225/55", style: "ten", spokes: 10 },
    notes: "Electric four-door coupe: low front wings with slim four-point lamps, flat frunk lid, silver side strip, sloping roof to a sculpted ducktail, continuous rear light strip, multi-spoke wheels.",
    source: "por-taycan,commons",
  },
  car_porsche_macan: {
    face: { grille: "closed", grilleW: 0.4, lamp: "round", drl: "c", intake: "wide", fog: false, bars: 0, sig: "four-point-drl" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { belt: 0.7, roofTaper: 0.08, tumble: 0.12, hood: 0.28, ws: 1.3, rr: 0.7, roof: "fastback", clearance: 0.2, pillars: "body", windowTrim: "black", crease: 0.7, cladding: 0.25, spoiler: true, rails: false, kick: false },
    wheels: { rim: 20, tyre: "235/45", style: "ten", spokes: 10 },
    notes: "Compact Porsche SUV after the 2019 facelift: oval-round lamps, black mesh lower intake and side pods, strongly sloping roof, rear haunches, big roof spoiler, slim light strip, twin tips, 20-inch alloys.",
    source: "por-macan,commons",
  },
  car_porsche_cayenne: {
    face: { grille: "closed", grilleW: 0.42, lamp: "round", drl: "c", intake: "wide", fog: false, bars: 0, sig: "four-point-drl" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { belt: 0.68, roofTaper: 0.07, tumble: 0.1, hood: 0.29, ws: 1.2, rr: 0.8, roof: "flat", clearance: 0.21, pillars: "body", windowTrim: "black", crease: 0.7, cladding: 0.25, spoiler: true, rails: false, kick: false },
    wheels: { rim: 19, tyre: "255/55", style: "twin", spokes: 5 },
    notes: "E3 large SUV (hybrid): bulged round lamps with four-point DRL, big central intake, sloping tailgate with an extending spoiler, full-width light bar, wide rear haunches, twin tips.",
    source: "por-cayenne",
  },

  // ---- Smart ----
  car_smart_fortwo: {
    face: { grille: "mesh", grilleW: 0.5, grilleChrome: false, lamp: "round", drl: "none", intake: "none", fog: false, bars: 0, sig: "round-lamps" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.62, roofTaper: 0, tumble: 0.1, hood: 0.12, ws: 0.9, rr: 0.1, roof: "flat", clearance: 0.12, pillars: "black", windowTrim: "none", crease: 0.2, cladding: 0.2, spoiler: false, rails: false, kick: false, top: "contrast", accent: "#1c1c1c" },
    wheels: { rim: 15, tyre: "165/60", style: "steel", spokes: 5 },
    notes: "W453 two-seater: tiny stubby nose with a wide black mesh grille and round lamps, tall cabin, near-vertical tail, black Tridion cell and roof against the body colour, round corner tail lamps, steel wheel covers.",
    source: "smart-w453,commons",
  },
};
