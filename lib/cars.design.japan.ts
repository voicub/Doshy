import type { DesignRow } from "./cars.design.ts";

// Japanese brands (A): Toyota, Honda, Mazda, Suzuki, Subaru. The generation of each row is fixed by the length / wheelbase in cars.data.ts.
// sources:
// toy-aygox = https://en.wikipedia.org/wiki/Toyota_Aygo_X
// toy-yaris = https://en.wikipedia.org/wiki/Toyota_Yaris_(XP210)
// toy-corolla = https://en.wikipedia.org/wiki/Toyota_Corolla_(E210)
// toy-prius = https://en.wikipedia.org/wiki/Toyota_Prius_(XW50)
// toy-camry = https://en.wikipedia.org/wiki/Toyota_Camry_(XV70)
// toy-chr = https://en.wikipedia.org/wiki/Toyota_C-HR
// toy-rav4 = https://en.wikipedia.org/wiki/Toyota_RAV4_(XA50)
// toy-hilux = https://en.wikipedia.org/wiki/Toyota_Hilux
// toy-lc300 = https://en.wikipedia.org/wiki/Toyota_Land_Cruiser_(J300)
// toy-alphard = https://en.wikipedia.org/wiki/Toyota_Alphard
// toy-gr86 = https://en.wikipedia.org/wiki/Toyota_GR86
// toy-supra = https://en.wikipedia.org/wiki/Toyota_Supra_(A90)
// hon-nbox = https://en.wikipedia.org/wiki/Honda_N-Box
// hon-e = https://en.wikipedia.org/wiki/Honda_e
// hon-jazz = https://en.wikipedia.org/wiki/Honda_Fit
// hon-civic = https://en.wikipedia.org/wiki/Honda_Civic_(tenth_generation)
// hon-hrv = https://en.wikipedia.org/wiki/Honda_HR-V
// hon-crv = https://en.wikipedia.org/wiki/Honda_CR-V_(fifth_generation)
// maz-2 = https://en.wikipedia.org/wiki/Mazda2
// maz-3 = https://en.wikipedia.org/wiki/Mazda3
// maz-cx30 = https://en.wikipedia.org/wiki/Mazda_CX-30
// maz-cx5 = https://en.wikipedia.org/wiki/Mazda_CX-5
// maz-mx5 = https://en.wikipedia.org/wiki/Mazda_MX-5
// suz-ignis = https://en.wikipedia.org/wiki/Suzuki_Ignis
// suz-swift = https://en.wikipedia.org/wiki/Suzuki_Swift
// suz-vitara = https://en.wikipedia.org/wiki/Suzuki_Vitara
// suz-scross = https://en.wikipedia.org/wiki/Suzuki_SX4_S-Cross
// suz-jimny = https://en.wikipedia.org/wiki/Suzuki_Jimny
// sub-forester = https://en.wikipedia.org/wiki/Subaru_Forester
// sub-outback = https://en.wikipedia.org/wiki/Subaru_Outback
// commons = https://commons.wikimedia.org (file titles in the `photos` list at the end of this file)

export const BRANDS: Record<string, DesignRow> = {
  // Toyota "Keen Look": slim lamps with a thin DRL, a small upper bar and a big trapezoid lower grille ("hammerhead" nose).
  Toyota: {
    face: { grille: "shield", grilleW: 0.46, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", fog: false, id: "toyota-keen-look", sig: "hammerhead" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "ten", spokes: 10 },
    source: "toy-yaris",
  },
  // Honda "solid wing" face: a thick bar (chrome on most) running through the grille into the lamps, honeycomb lower intake.
  Honda: {
    face: { grille: "bar", grilleW: 0.44, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: false, id: "honda-solid-wing", sig: "wing-bar" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 16, style: "ten", spokes: 10 },
    source: "hon-civic",
  },
  // Mazda KODO: pentagon grille with a chrome wing sweeping into slim lamps, long bonnet, cab set back, clean unbroken flanks.
  Mazda: {
    face: { grille: "shield", grilleW: 0.46, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: false, id: "mazda-kodo", sig: "grille-wing" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body", crease: 0.2 },
    wheels: { rim: 18, style: "five", spokes: 5 },
    source: "maz-3",
  },
  // Suzuki: simple friendly faces with a small hexagonal grille and plain bumpers, upright proportions, round or square lamps.
  Suzuki: {
    face: { grille: "shield", grilleW: 0.4, grilleChrome: false, lamp: "wide", drl: "none", intake: "wide", fog: false, id: "suzuki-simple" },
    rear: { lamp: "block", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 16, style: "five", spokes: 5 },
    source: "suz-swift",
  },
  // Subaru: hexagon grille with a chrome rim, hawk-eye lamps with a C-shaped LED signature, hexagon fog lamps, black arch cladding.
  Subaru: {
    face: { grille: "shield", grilleW: 0.48, grilleChrome: true, lamp: "angular", drl: "c", intake: "wide", fog: true, id: "subaru-hexagon", sig: "c-shaped-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body", cladding: 0.5, skid: "black" },
    wheels: { rim: 17, style: "five", spokes: 5 },
    source: "sub-forester",
  },
};

export const ROWS: Record<string, DesignRow> = {
  // ---- Toyota ----
  // Aygo X (2022): 3.70 m crossover-styled city car.
  car_toyota_aygo: {
    face: { grille: "mesh", grilleW: 0.46, lamp: "slim", drl: "strip", intake: "none", fog: false, bars: 0, sig: "one-piece-slim-lamp" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.68, hood: 0.2, ws: 1.3, rr: 0.3, roof: "flat", clearance: 0.17, pillars: "body", crease: 0.5, cladding: 0.6, rails: false, spoiler: true, kick: true, skid: "black" },
    wheels: { rim: 17, style: "twin", spokes: 5 },
    notes: "Chunky mini-crossover: slim one-piece lamps with built-in DRL, black mesh lower grille, thick black arch cladding, near-upright black glass tailgate flanked by tall vertical tail lamps.",
    source: "toy-aygox,commons",
  },
  // Yaris Mk4 (XP210, 2020): GA-B platform, wide and low with strong rear haunches.
  car_toyota_yaris: {
    face: { grille: "mesh", grilleW: 0.55, lamp: "slim", drl: "strip", intake: "none", sig: "slim-hammer" },
    rear: { lamp: "wrap", exhaust: "single", bar: true },
    body: { belt: 0.68, roofTaper: 0.05, hood: 0.22, ws: 1.25, rr: 0.9, roof: "flat", clearance: 0.14, crease: 0.7, cladding: 0.1, spoiler: true, kick: true },
    wheels: { rim: 16, tyre: "195/50", style: "ten", spokes: 10 },
    notes: "Wide low hatch: slim angled lamps, one wide black trapezoid grille, strongly flared rear haunches, a gloss-black bar tying slim tail lamps together under a roof spoiler.",
    source: "toy-yaris,commons",
  },
  // Corolla hatchback (E210, 2019): 4.37 m, GA-C platform.
  car_toyota_corolla: {
    face: { grille: "mesh", grilleW: 0.52, lamp: "slim", drl: "strip", intake: "split", sig: "hammerhead" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.68, roofTaper: 0.07, hood: 0.27, ws: 1.25, rr: 1.0, roof: "fastback", clearance: 0.13, crease: 0.7, cladding: 0.1, spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "225/45", style: "twin", spokes: 5 },
    notes: "Low, wide hatch: slim hooked lamps, wide black mesh lower grille with corner vents, sculpted flanks, sloping tail with slim wrap lamps, roof spoiler and a black diffuser bumper.",
    source: "toy-corolla,commons",
  },
  // Prius Mk4 (XW50, 2016-2022).
  car_toyota_prius: {
    face: { grille: "bar", grilleW: 0.38, lamp: "angular", drl: "c", intake: "wide", sig: "prius-vertical-c" },
    rear: { lamp: "vertical", exhaust: "hidden" },
    body: { belt: 0.7, roofTaper: 0.1, tumble: 0.1, hood: 0.22, ws: 1.5, rr: 1.0, roof: "fastback", clearance: 0.13, pillars: "body", crease: 0.8, cladding: 0, spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "215/45", style: "twin", spokes: 5 },
    notes: "Kammback hatch: peaked roof with a split rear window under a spoiler, razor lamps with vertical C-shaped lights low in the bumper, tall angular tail lamps climbing the tailgate edge.",
    source: "toy-prius,commons",
  },
  // Camry (XV70, 2018): TNGA sedan, 4.885 m.
  car_toyota_camry: {
    face: { grille: "slats", grilleW: 0.56, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, bars: 8, sig: "wide-trapezoid-slats" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.7, roofTaper: 0.07, hood: 0.3, ws: 1.35, rr: 1.0, roof: "notchback", clearance: 0.13, windowTrim: "black", crease: 0.6, cladding: 0, spoiler: true },
    wheels: { rim: 17, tyre: "215/55", style: "ten", spokes: 10 },
    notes: "Large sedan: very wide chrome-framed trapezoid grille with fine horizontal slats under a slim upper bar, sharp slim lamps, long bonnet, low roof and a short boot lip spoiler.",
    source: "toy-camry,commons",
  },
  // C-HR first generation (2016-2023): diamond theme.
  car_toyota_c_hr: {
    face: { grille: "mesh", grilleW: 0.4, lamp: "slim", drl: "strip", intake: "wide", fog: false, sig: "diamond" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.71, roofTaper: 0.08, tumble: 0.12, hood: 0.24, ws: 1.2, rr: 1.4, roof: "fastback", clearance: 0.16, pillars: "black", crease: 0.9, cladding: 0.45, spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "215/60", style: "twin", spokes: 5 },
    notes: "Diamond-themed coupe crossover: sculpted creased flanks, black C pillar hiding the rear door handles, flared rear haunches, wedge tail lamps under a wing spoiler, black lower bumper vents.",
    source: "toy-chr,commons",
  },
  // RAV4 (XA50, 2018): octagon theme.
  car_toyota_rav4: {
    face: { grille: "mesh", grilleW: 0.54, lamp: "angular", drl: "strip", intake: "wide", fog: true, bars: 0, sig: "octagon" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, hood: 0.28, ws: 1.15, rr: 0.7, roof: "flat", clearance: 0.19, windowTrim: "black", crease: 0.7, cladding: 0.6, rails: true, spoiler: true, skid: "silver" },
    wheels: { rim: 18, tyre: "235/60", style: "twin", spokes: 5 },
    notes: "Rugged angular SUV: wide black mesh grille, squared-off arches with heavy black cladding, black lower bumper with fog pods, roof rails and a boxy tail with slim wrap lamps.",
    source: "toy-rav4,commons",
  },
  // Hilux (AN120, 2016-): double cab, 5.33 m.
  car_toyota_hilux: {
    face: { grille: "slats", grilleW: 0.5, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, bars: 2, sig: "chrome-bars-over-black-grille" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.62, hood: 0.27, ws: 1.0, roof: "flat", clearance: 0.22, windowTrim: "black", crease: 0.6, cladding: 0.35, rails: false, cab: "double", bed: "open", skid: "silver", mirror: "body" },
    wheels: { rim: 17, tyre: "265/65", style: "five", spokes: 5 },
    notes: "Double-cab pickup: two chrome bars over a black lower grille, slim LED lamps, chrome fog bezels, flared arches, side steps, tall vertical tail lamps and a chrome rear step bumper.",
    source: "toy-hilux,commons",
  },
  // Land Cruiser 300 (2021-): 4.985 m, 2.85 wheelbase.
  car_toyota_land_cruiser: {
    face: { grille: "slats", grilleW: 0.46, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, bars: 6, sig: "stacked-chrome-bars" },
    rear: { lamp: "block", exhaust: "hidden" },
    body: { belt: 0.64, hood: 0.28, ws: 1.1, rr: 0.5, roof: "flat", clearance: 0.23, pillars: "body", windowTrim: "black", crease: 0.4, cladding: 0.35, rails: true, spoiler: true, kick: false, skid: "silver" },
    wheels: { rim: 18, tyre: "265/65", style: "ten", spokes: 10 },
    notes: "Full-size 4x4: upright square-shouldered body, stack of chrome bars between slim horizontal lamps, side steps, roof rails and slim horizontal tail lamps either side of a flat tailgate.",
    source: "toy-lc300,commons",
  },
  // Alphard (AH30, 2017 facelift onwards): 4.945 m.
  car_toyota_alphard: {
    face: { grille: "mesh", grilleW: 0.5, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: false, bars: 0, sig: "huge-vertical-chrome-grille" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.62, hood: 0.18, ws: 0.9, rr: 0.5, roof: "flat", clearance: 0.16, windowTrim: "black", crease: 0.4, cladding: 0, spoiler: true, slide: true, mirror: "body" },
    wheels: { rim: 17, tyre: "225/60", style: "twin", spokes: 5 },
    notes: "Luxury minivan: tall chrome vertical-bar grille with a large badge, slim triple-LED lamps, tall flat sides with powered sliding doors, tinted rear glass under a spoiler, tail lamps climbing the corners.",
    source: "toy-alphard,commons",
  },
  // GR86 (ZN8, 2021-).
  car_toyota_gr86: {
    face: { grille: "mesh", grilleW: 0.52, lamp: "slim", drl: "strip", intake: "wide", sig: "straight-drl" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.7, roofTaper: 0.06, tumble: 0.12, hood: 0.3, ws: 1.35, rr: 1.3, roof: "fastback", clearance: 0.13, windowTrim: "black", crease: 0.6, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 17, tyre: "215/45", style: "twin", spokes: 5 },
    notes: "Compact rear-drive coupe: very low nose and roof, wide black mesh lower grille, slim lamps, bulging arches, rounded fastback with a small ducktail and slim wrap tail lamps above twin pipes.",
    source: "toy-gr86,commons",
  },
  // Supra A90 (2019-): 4.379 m, 2.47 wheelbase.
  car_toyota_supra: {
    face: { grille: "mesh", grilleW: 0.38, lamp: "slim", drl: "strip", intake: "split", sig: "slit-lamp-corner-vents" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.72, roofTaper: 0.04, tumble: 0.14, hood: 0.34, ws: 1.4, rr: 1.4, roof: "fastback", clearance: 0.11, windowTrim: "black", crease: 0.9, cladding: 0, spoiler: true, kick: false, skid: "black" },
    wheels: { rim: 19, tyre: "255/35", style: "five", spokes: 5 },
    notes: "Short-wheelbase GT: long bonnet, tiny double-bubble cabin set back, huge corner intakes with a small mesh opening, slit lamps, tall hips and an integrated ducktail over wide tail lamps.",
    source: "toy-supra,commons",
  },

  // ---- Honda ----
  // N-Box (JF3/4, 2017-2023): 3.395 m kei.
  car_honda_n_box: {
    face: { grille: "mesh", grilleW: 0.36, grilleChrome: true, lamp: "wide", drl: "strip", intake: "none", fog: false, sig: "square-lamp-chrome-bar" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.64, roofTaper: 0, tumble: 0.05, hood: 0.1, ws: 1.0, rr: 0.4, roof: "flat", clearance: 0.15, pillars: "body", crease: 0.3, cladding: 0, spoiler: true, slide: true, kick: false },
    wheels: { rim: 15, tyre: "165/55", style: "ten", spokes: 10 },
    notes: "Tall boxy kei car: nearly vertical windscreen and tailgate, flat roof with a rear roof spoiler, very short bonnet, sliding rear doors, tall slim tail lamps at the corners.",
    source: "hon-nbox,commons",
  },
  // Honda e (2020-2023): 3.894 m.
  car_honda_e: {
    face: { lamp: "round", drl: "strip", intake: "none", fog: false, sig: "round-ring-drl" },
    rear: { lamp: "round", exhaust: "hidden" },
    body: { belt: 0.66, roofTaper: 0.03, hood: 0.2, ws: 1.2, rr: 0.9, roof: "flat", clearance: 0.14, pillars: "black", crease: 0.1, cladding: 0, spoiler: false, top: "contrast", accent: "#1a1b1d", mirror: "black" },
    wheels: { rim: 17, tyre: "205/45", style: "ten", spokes: 10 },
    notes: "Retro EV: round LED lamps joined by a smooth glossy black front panel, charge flap on the bonnet, flush door handles, camera pods instead of mirrors, black roof and pillars, rounded tail.",
    source: "hon-e,commons",
  },
  // Jazz IV (2020-): 4.044 m, e:HEV.
  car_honda_jazz: {
    face: { grille: "bar", grilleW: 0.4, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", sig: "slim-bar" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.64, roofTaper: 0.03, hood: 0.2, ws: 1.0, rr: 0.8, roof: "flat", clearance: 0.15, crease: 0.2, cladding: 0, spoiler: false, kick: false },
    wheels: { rim: 16, tyre: "185/55", style: "twin", spokes: 5 },
    notes: "One-box supermini: very short bonnet, thin A pillars and a big windscreen, tall roof, smooth clean flanks, body-colour front with a slim black bar, tall tail lamps at the corners.",
    source: "hon-jazz,commons",
  },
  // Civic hatchback 10th gen (2017-2021): 4.518 m.
  car_honda_civic: {
    face: { grille: "bar", grilleW: 0.46, grilleChrome: false, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "wing-bar-honeycomb" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.68, roofTaper: 0.1, tumble: 0.1, hood: 0.27, ws: 1.35, rr: 1.5, roof: "fastback", clearance: 0.12, pillars: "body", crease: 0.8, cladding: 0, spoiler: true, kick: true, skid: "black" },
    wheels: { rim: 17, tyre: "215/50", style: "ten", spokes: 10 },
    notes: "Low, wide fastback hatch: thin grille bar into angular lamps, big lower intake with corner vents, sharp flank creases, roof-end wing spoiler, large C-shaped tail lamps and slotted twin outlets in a black diffuser.",
    source: "hon-civic,commons",
  },
  // HR-V (2015-2021): 4.294 m.
  car_honda_hr_v: {
    face: { grille: "bar", grilleW: 0.44, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, bars: 2, sig: "chrome-wing" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.7, roofTaper: 0.07, hood: 0.24, ws: 1.2, rr: 0.9, roof: "fastback", clearance: 0.17, pillars: "body", crease: 0.7, cladding: 0.5, rails: false, spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "215/55", style: "twin", spokes: 5 },
    notes: "Coupe-like compact crossover: sloping roof, hidden rear door handles, high rising beltline, chrome wing over a slim grille, black arch and sill cladding, tall wrapped tail lamps and a roof spoiler.",
    source: "hon-hrv,commons",
  },
  // CR-V V (2018-): 4.6 m.
  car_honda_cr_v: {
    face: { grille: "slats", grilleW: 0.5, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, bars: 3, sig: "chrome-wing-bars" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.66, hood: 0.27, ws: 1.2, rr: 0.7, roof: "flat", clearance: 0.2, windowTrim: "chrome", crease: 0.6, cladding: 0.5, rails: true, spoiler: true, kick: false, skid: "silver" },
    wheels: { rim: 18, tyre: "235/60", style: "twin", spokes: 5 },
    notes: "Large family SUV: chrome-barred grille into angular LED lamps, chrome window frames, black sill cladding, roof rails, tall vertical tail lamps climbing the pillars and a silver rear skid.",
    source: "hon-crv,commons",
  },

  // ---- Mazda ----
  // Mazda2 (DJ, 2015-): 4.06 m.
  car_mazda_2: {
    face: { grille: "mesh", grilleW: 0.44, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, sig: "grille-wing" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.05, hood: 0.25, ws: 1.2, rr: 0.9, roof: "flat", clearance: 0.14, crease: 0.4, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 16, tyre: "185/60", style: "twin", spokes: 5 },
    notes: "Small KODO hatch: black pentagon grille with a thin chrome wing, slim lamps and round fog lamps, creased shoulder rising to a short tail, rounded wrap tail lamps and a single pipe.",
    source: "maz-2,commons",
  },
  // Mazda3 (BP, 2019-) hatch: 4.46 m.
  car_mazda_3: {
    face: { grille: "mesh", grilleW: 0.5, grilleChrome: false, lamp: "slim", drl: "strip", intake: "none", sig: "wingless-pentagon" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.7, roofTaper: 0.09, tumble: 0.12, hood: 0.3, ws: 1.45, rr: 1.6, roof: "fastback", clearance: 0.13, pillars: "body", crease: 0.1, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 18, tyre: "215/45", style: "ten", spokes: 10 },
    notes: "Sculptural hatch: huge black mesh pentagon grille with no wing, slim lamps, very long bonnet, thick C pillar and small rear window under a gloss-black wing, round-ringed tail lamps, no shoulder crease.",
    source: "maz-3,commons",
  },
  // CX-30 (2019-): 4.395 m.
  car_mazda_cx_30: {
    face: { grille: "mesh", grilleW: 0.46, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", sig: "mesh-pentagon" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.7, roofTaper: 0.06, tumble: 0.1, hood: 0.28, ws: 1.3, rr: 1.0, roof: "fastback", clearance: 0.175, pillars: "body", crease: 0.1, cladding: 0.85, rails: false, spoiler: true, kick: false },
    wheels: { rim: 18, tyre: "215/55", style: "twin", spokes: 5 },
    notes: "Coupe-style crossover: black mesh pentagon grille, smooth unbroken flanks, thick black cladding on arches, sills and bumpers, sloping roof, slim hooked tail lamps and a bold dark rear bumper.",
    source: "maz-cx30,commons",
  },
  // CX-5 (KF, 2017-): 4.55 m, 2.2 diesel.
  car_mazda_cx_5: {
    face: { grille: "mesh", grilleW: 0.5, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, sig: "grille-wing" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.68, roofTaper: 0.04, hood: 0.29, ws: 1.25, rr: 0.9, roof: "flat", clearance: 0.21, windowTrim: "chrome", crease: 0.3, cladding: 0.4, rails: true, spoiler: true, kick: false },
    wheels: { rim: 19, tyre: "225/55", style: "twin", spokes: 5 },
    notes: "Mid SUV: big black mesh pentagon grille with chrome wing, slim lamps, long bonnet, clean sculpted flanks, chrome window line, silver roof rails and slim wrap tail lamps above chrome pipes.",
    source: "maz-cx5,commons",
  },
  // MX-5 (ND, 2015-): 3.915 m.
  car_mazda_mx_5: {
    face: { grille: "mesh", grilleW: 0.4, lamp: "slim", drl: "none", intake: "wide", sig: "low-grin" },
    rear: { lamp: "round", exhaust: "twin" },
    body: { belt: 0.74, roofTaper: 0, tumble: 0.08, hood: 0.38, ws: 1.5, rr: 1.2, roof: "fastback", clearance: 0.12, crease: 0.7, cladding: 0, spoiler: false, top: "soft", mirror: "body" },
    wheels: { rim: 17, tyre: "205/45", style: "ten", spokes: 10 },
    notes: "Compact roadster: very long bonnet, cabin pushed far back, slim lamps over a low wide black grin, high belt with twin humps behind the seats, short deck, fabric top, thin multi-spoke wheels.",
    source: "maz-mx5,commons",
  },

  // ---- Suzuki ----
  // Ignis (2016-): 3.70 m.
  car_suzuki_ignis: {
    face: { grille: "slats", grilleW: 0.46, grilleChrome: true, lamp: "round", drl: "c", intake: "wide", fog: true, bars: 5, sig: "ring-drl-slat-grille" },
    rear: { lamp: "vertical", exhaust: "hidden" },
    body: { belt: 0.66, roofTaper: 0.02, hood: 0.18, ws: 1.1, rr: 0.4, roof: "flat", clearance: 0.18, crease: 0.3, cladding: 0.45, rails: true, spoiler: false, kick: true },
    wheels: { rim: 16, tyre: "175/60", style: "five", spokes: 5 },
    notes: "Tiny upright crossover: short bonnet, round lamps with a ring DRL over a fine-slatted chrome-edged grille, black arch cladding, roof rails, heavy C pillar and tall stacked tail lamps on a near-vertical tailgate.",
    source: "suz-ignis,commons",
  },
  // Swift (2017-): 3.84 m.
  car_suzuki_swift: {
    face: { grille: "mesh", grilleW: 0.46, lamp: "wide", drl: "strip", intake: "wide", fog: true, sig: "hex-mesh-grille" },
    rear: { lamp: "block", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.06, hood: 0.23, ws: 1.2, rr: 1.0, roof: "flat", clearance: 0.13, pillars: "black", crease: 0.5, cladding: 0.1, spoiler: true, kick: true },
    wheels: { rim: 16, tyre: "185/55", style: "twin", spokes: 5 },
    notes: "Sporty supermini: wide hexagon mesh grille, round fog lamps in black bezels, blacked-out rear pillar with the rear door handle hidden in it, flared arches and wide wrap-edge tail lamps.",
    source: "suz-swift,commons",
  },
  // Vitara (LY, 2015-): 4.175 m.
  car_suzuki_vitara: {
    face: { grille: "slats", grilleW: 0.42, grilleChrome: true, lamp: "wide", drl: "strip", intake: "wide", fog: true, bars: 3, sig: "chrome-slats" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.03, hood: 0.25, ws: 1.2, rr: 0.7, roof: "flat", clearance: 0.185, windowTrim: "chrome", crease: 0.5, cladding: 0.5, rails: true, spoiler: true, kick: false, skid: "silver" },
    wheels: { rim: 17, tyre: "215/55", style: "twin", spokes: 5 },
    notes: "Compact SUV: three chrome slats across a black grille, LED strip under the lamps, squared arches with black cladding, roof rails and roof spoiler, wedge tail lamps and silver skid plates.",
    source: "suz-vitara,commons",
  },
  // S-Cross (2022-): 4.30 m.
  car_suzuki_s_cross: {
    face: { grille: "mesh", grilleW: 0.5, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, bars: 0, sig: "chrome-framed-honeycomb" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.03, hood: 0.27, ws: 1.2, rr: 0.8, roof: "flat", clearance: 0.18, windowTrim: "chrome", crease: 0.5, cladding: 0.55, rails: false, spoiler: true, kick: false, skid: "silver" },
    wheels: { rim: 17, tyre: "215/55", style: "ten", spokes: 10 },
    notes: "Family crossover: chunky chrome-framed hexagon honeycomb grille, slim LED lamps, round fog lamps, thick black arch cladding, silver skid plates and slim LED tail lamps on a near-upright tail.",
    source: "suz-scross,commons",
  },
  // Jimny (JB74, 2018-): 3.645 m.
  car_suzuki_jimny: {
    face: { grille: "slats", grilleW: 0.36, grilleChrome: false, lamp: "round", drl: "none", intake: "none", fog: false, bars: 5, sig: "five-slot" },
    rear: { lamp: "block", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0, tumble: 0.05, hood: 0.17, ws: 1.5, rr: 0.4, roof: "flat", clearance: 0.21, pillars: "body", crease: 0.6, cladding: 0.5, rails: false, spoiler: false, kick: false, skid: "black", mirror: "black" },
    wheels: { rim: 15, tyre: "195/80", style: "five", spokes: 5 },
    notes: "Mini G-wagen: dead flat slab sides, upright glass, short snub bonnet, five-slot black grille between round lamps, big black arch flares, black bumpers and a side-hinged tailgate.",
    source: "suz-jimny,commons",
  },

  // ---- Subaru ----
  // Forester (SK, 2018-): 4.625 m.
  car_subaru_forester: {
    face: { grille: "mesh", grilleW: 0.48, drl: "c", fog: true, sig: "c-shaped-hawk-eye" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.64, roofTaper: 0.03, hood: 0.27, ws: 1.15, rr: 0.4, roof: "flat", clearance: 0.22, windowTrim: "black", crease: 0.4, cladding: 0.55, rails: true, spoiler: true, kick: false, skid: "black" },
    wheels: { rim: 17, tyre: "225/60", style: "five", spokes: 5 },
    notes: "Tall-glass SUV: low beltline with big windows, upright tailgate with roof spoiler, black hexagon grille with C-shaped lamps and black fog pods, black arch cladding, roof rails, tall hooked tail lamps.",
    source: "sub-forester,commons",
  },
  // Outback (BT, 2020-): 4.86 m.
  car_subaru_outback: {
    face: { grille: "slats", grilleW: 0.5, drl: "c", fog: true, bars: 2, sig: "c-shaped-hex" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.66, roofTaper: 0.02, hood: 0.27, ws: 1.2, rr: 0.8, roof: "flat", clearance: 0.213, windowTrim: "black", crease: 0.4, cladding: 0.8, rails: true, spoiler: true, kick: false, skid: "silver" },
    wheels: { rim: 18, tyre: "225/60", style: "twin", spokes: 5 },
    notes: "Raised estate: long flat roof with integrated rails, heavy black cladding on arches and sills, hexagon chrome-barred grille with C-shaped lamps, silver skid plates and wrap tail lamps under a roof spoiler.",
    source: "sub-outback,commons",
  },
};

// photos (Wikimedia Commons file titles viewed; images are not copied):
// car_toyota_aygo: 2022 Toyota Aygo X Edge 1.0 VVT-i (Front).jpg | 2022 Toyota Aygo X Edge 1.0 VVT-i (Rear).jpg
// car_toyota_yaris: 2020-2024 Toyota Yaris Hybrid.jpg | 2020-2024 Toyota Yaris rear.jpg | Toyota Yaris 2020 (XP210, Japan) rear view.jpg
// car_toyota_corolla: 2019 Toyota Corolla Hybrid Hatchback.jpg | Toyota Corolla Hybrid (E210) Leonberg 2019 IMG 0125.jpg | Toyota Corolla Hatchback Hybrid (rear).jpg | 2019 Toyota Corolla rear.jpg
// car_toyota_prius: Toyota Prius (IV) – Frontansicht, 19. September 2015, Frankfurt.jpg | Toyota Prius (IV) – Heckansicht, 19. September 2015, Frankfurt.jpg
// car_toyota_camry: Toyota Camry (XV70) IMG 9081.jpg | TOYOTA CAMRY (XV70) China.jpg
// car_toyota_c_hr: 2018 Toyota C-HR (NGX10R) 2WD hatchback (2018-07-19) 01.jpg | 2018 Toyota C-HR rear (2) 4.27.18.jpg | 2018 Toyota C-HR (NGX10R) 2WD hatchback (2018-07-19) 02.jpg
// car_toyota_rav4: Toyota RAV4 2019 (XA50) CUV Quarter Front.jpg | Toyota RAV4 2019 (XA50) CUV Quarter Back.jpg
// car_toyota_hilux: Toyota hilux 2017 japan.jpg | Toyota hilux 2017 japan rear.jpg
// car_toyota_land_cruiser: 2021 Toyota Land Cruiser 300 (Russia) front view.jpg | 2021 Toyota Land Cruiser 300 (Russia) rear view.png
// car_toyota_alphard: 2018-2023 Toyota Alphard X.jpg | 2018-2023 Toyota Alphard X rear.jpg
// car_toyota_gr86: Toyota GR86 SZ.jpg | Toyota GR86 SZ rear.jpg
// car_toyota_supra: Dülmen, Auto Bertels, Toyota GR Supra -- 2021 -- 9539.jpg
// car_honda_n_box: 2018 Honda N-Box (2nd generation).jpg | 2018 Honda N-Box (2nd generation) back.jpg
// car_honda_e: Honda e IMG 3732.jpg | Honda e IMG 3750.jpg
// car_honda_jazz: Honda Jazz eHEV (2021) (52179916696).jpg | Honda Jazz e HEV (2021) (52094779903).jpg
// car_honda_civic: Honda Civic 1.0 VTEC Turbo Elegance (X) – f 22112020.jpg | Honda Civic 1.0 VTEC Turbo Elegance (X) – h 22112020.jpg
// car_honda_hr_v: Honda HR-V - przód (MSP16).jpg | Honda HR-V - tył (MSP16).jpg
// car_honda_cr_v: 2019 Honda CR-V 1.5 Turbo Prestige RW1 (20210821).jpg | Honda CR-V Hybrid Genf 2019 1Y7A5809.jpg
// car_mazda_2: 2015 Mazda2 (DJ) Genki hatchback (2018-08-27) 01.jpg | 2015 Mazda2 (DJ) Genki hatchback (2018-08-27) 02.jpg
// car_mazda_3: 2019 Mazda3 Hatchback 2.0 BP (20191219) 01.jpg | Mazda3 (BP) Leonberg 2019 IMG 0093.jpg
// car_mazda_cx_30: Mazda CX-30 (DM) Washington DC Metro Area, USA (1).jpg | Mazda CX-30 (DM) in Slovakia 2020.jpg
// car_mazda_cx_5: 2018 Mazda CX-5 (KF) GT AWD wagon (2018-09-28) 01.jpg | 2018 Mazda CX-5 (KF) GT AWD wagon (2018-09-28) 02.jpg
// car_mazda_mx_5: Mazda MX-5 (ND) 1X7A2479.jpg | Mazda MX-5 (ND) 1X7A7471.jpg | Mazda MX-5 ND Wien 26 July 2020 JM (1).jpg | Mazda MX-5 Miata (ND, roadster).jpg
// car_suzuki_ignis: Suzuki Ignis, Frankfurt (1Y7A3572).jpg | Suzuki Ignis 1.2 GLX 2017 (31401651740).jpg | Suzuki Ignis 1.2 GLX 2017 (52790913107).jpg | Suzuki Ignis 1.2 GL 2017 (52561400286).jpg
// car_suzuki_swift: 2018 Suzuki Swift SZ5 Boosterjet SHVS 1.0 Front.jpg | 2018 Suzuki Swift SZ5 Boosterjet SHVS 1.0 Rear.jpg
// car_suzuki_vitara: Suzuki Vitara 1.6 Comfort+ (IV) – Frontansicht, 8. August 2015, Düsseldorf.jpg | Suzuki Vitara 1.6 Comfort+ (IV) – Heckansicht, 8. August 2015, Düsseldorf.jpg
// car_suzuki_s_cross: 2022 Suzuki SX4 S-Cross AllGrip Hybrid 01.jpg | 2022 Suzuki SX4 S-Cross AllGrip Hybrid (rear).jpg
// car_suzuki_jimny: Suzuki Jimny 2018 (01).jpg | Suzuki Jimny 2018 (02).jpg
// car_subaru_forester: 2019 Subaru Forester Sport AWD front NYIAS 2019.jpg | 2019 Subaru Forester Sport AWD rear NYIAS 2019.jpg
// car_subaru_outback: 2021 Subaru Outback Limited, front 3.17.21.jpg | 2021 Subaru Outback Limited, rear 3.17.21.jpg
// no rear photo viewed for: car_toyota_supra, car_honda_e, car_suzuki_jimny.
