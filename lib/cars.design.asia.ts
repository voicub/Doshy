import type { DesignRow } from "./cars.design.ts";

// Nissan / Hyundai / Kia / BYD / MG / Mahindra / Tata / Lada.
// Generation each catalogue row means (from length / wheelbase): Micra K14, Juke F16, Qashqai J12, X-Trail T32 facelift, Leaf ZE1, Navara D23, GT-R R35 (2017+ face),
// i10 IA, i20 BC3, i30 PD, Kona OS facelift (2021), Creta SU2i, Tucson NX4, Ioniq 5, Picanto JA, Ceed CD, Stonic YB, Niro DE (1st gen), Sportage QL facelift, EV6,
// Atto 3, MG4 EH32, Thar 2020 (AX/LX), Nexon first generation, Niva Legend (VAZ-2121).
//
// sources:
// nis-micra = https://en.wikipedia.org/wiki/Nissan_Micra
// nis-juke = https://en.wikipedia.org/wiki/Nissan_Juke
// nis-qash = https://en.wikipedia.org/wiki/Nissan_Qashqai
// nis-xtr = https://en.wikipedia.org/wiki/Nissan_X-Trail
// nis-leaf = https://en.wikipedia.org/wiki/Nissan_Leaf
// nis-nav = https://en.wikipedia.org/wiki/Nissan_Navara
// nis-gtr = https://en.wikipedia.org/wiki/Nissan_GT-R
// hyu-i10 = https://en.wikipedia.org/wiki/Hyundai_i10
// hyu-i20 = https://en.wikipedia.org/wiki/Hyundai_i20
// hyu-i30 = https://en.wikipedia.org/wiki/Hyundai_i30
// hyu-kona = https://en.wikipedia.org/wiki/Hyundai_Kona
// hyu-creta = https://en.wikipedia.org/wiki/Hyundai_Creta
// hyu-tuc = https://en.wikipedia.org/wiki/Hyundai_Tucson
// hyu-io5 = https://en.wikipedia.org/wiki/Hyundai_Ioniq_5
// kia-pic = https://en.wikipedia.org/wiki/Kia_Picanto
// kia-ceed = https://en.wikipedia.org/wiki/Kia_Ceed
// kia-sto = https://en.wikipedia.org/wiki/Kia_Stonic
// kia-niro = https://en.wikipedia.org/wiki/Kia_Niro
// kia-spo = https://en.wikipedia.org/wiki/Kia_Sportage
// kia-ev6 = https://en.wikipedia.org/wiki/Kia_EV6
// byd-a3 = https://en.wikipedia.org/wiki/BYD_Atto_3
// mg-4 = https://en.wikipedia.org/wiki/MG4_EV
// mah-thar = https://en.wikipedia.org/wiki/Mahindra_Thar
// tata-nex = https://en.wikipedia.org/wiki/Tata_Nexon
// lada-niva = https://en.wikipedia.org/wiki/Lada_Niva
// commons = https://commons.wikimedia.org (photos of the matching generation viewed in pass 2; nothing copied)

export const BRANDS: Record<string, DesignRow> = {
  // V-motion: chrome-framed V-shaped grille that spreads into the lamp area, boomerang-shaped LED daytime lamps, floating-roof option.
  Nissan: {
    face: { grille: "shield", grilleW: 0.42, grilleChrome: true, lamp: "angular", drl: "c", intake: "wide", fog: false, bars: 0, id: "nissan-v-motion", sig: "boomerang" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "ten", spokes: 10 },
    source: "nis-micra",
  },
  // Hyundai: cascading / big-opening grille, slim lamps with strip DRL, wide lower intake, sharp shoulder creases ("Sensuous Sportiness").
  Hyundai: {
    face: { grille: "shield", grilleW: 0.44, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", fog: false, bars: 0, id: "hyundai-cascading", sig: "led-strip" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "ten", spokes: 10 },
    source: "hyu-i30",
  },
  // Kia: "tiger nose" grille, a narrow shield joined to the slim lamps, wide lower intake, ice-cube style fog lamps.
  Kia: {
    face: { grille: "shield", grilleW: 0.4, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", fog: true, bars: 0, id: "kia-tiger-nose", sig: "tiger-nose" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "ten", spokes: 10 },
    source: "kia-ceed",
  },
  // BYD Ocean / Dynasty face on the Atto 3: slim swept lamps, a dark nose with a wide lower intake, full-width tail bar.
  BYD: {
    face: { grille: "closed", grilleW: 0.4, lamp: "slim", drl: "strip", intake: "wide", fog: false, id: "byd-ocean", sig: "swept-strip" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { mirror: "body" },
    wheels: { rim: 18, style: "ten", spokes: 10 },
    source: "byd-a3",
  },
  // MG: angular lamps, big black lower intake, sporty sharp creases; MG4 is a battery hatch.
  MG: {
    face: { grille: "closed", grilleW: 0.4, lamp: "angular", drl: "strip", intake: "wide", fog: false, id: "mg-sharp", sig: "sharp-strip" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "twin", spokes: 5 },
    source: "mg-4",
  },
  // Mahindra Thar: seven vertical grille slots between two round lamps, flat bonnet, fender flares, upright windscreen.
  Mahindra: {
    face: { grille: "slats", grilleW: 0.36, grilleChrome: false, lamp: "round", drl: "none", intake: "none", fog: false, bars: 7, id: "mahindra-seven-slot", sig: "seven-slot" },
    rear: { lamp: "block", exhaust: "single" },
    body: { mirror: "black" },
    wheels: { rim: 18, style: "ten", spokes: 10 },
    source: "mah-thar",
  },
  // Tata "Impact Design": a slim DRL strip running into the grille, main lamps stacked below it, "Humanity line" grille.
  Tata: {
    face: { grille: "shield", grilleW: 0.34, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", fog: true, bars: 0, id: "tata-impact", sig: "humanity-line" },
    rear: { lamp: "block", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 16, style: "ten", spokes: 10 },
    source: "tata-nex",
  },
  // Lada: 1970s Soviet boxy styling, round lamps, plain flat grille, steel bumpers.
  Lada: {
    face: { grille: "slats", grilleW: 0.36, grilleChrome: true, lamp: "round", drl: "none", intake: "none", fog: false, bars: 2, id: "lada-niva", sig: "round-lamps" },
    rear: { lamp: "block", exhaust: "single" },
    body: { mirror: "black" },
    wheels: { rim: 16, style: "steel", spokes: 5 },
    source: "lada-niva",
  },
};

export const ROWS: Record<string, DesignRow> = {
  // ---- Nissan ----
  car_nissan_micra: {
    face: { grilleW: 0.4, grilleChrome: true, lamp: "angular", drl: "c", intake: "wide", fog: true, sig: "boomerang-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.06, tumble: 0.12, hood: 0.27, roof: "flat", crease: 0.8, cladding: 0, top: "contrast", accent: "#1c1c1c", pillars: "black", kick: true, mirror: "black" },
    wheels: { rim: 17, tyre: "205/45", style: "ten", spokes: 10 },
    notes: "K14 Micra: slim black grille in a chrome V frame, slim angular lamps with boomerang DRL, small fog pods, black sill trim, black C-pillar, big boomerang tail lamps wrapping into the quarters.",
    source: "nis-micra,commons",
  },
  car_nissan_juke: {
    face: { grille: "shield", grilleW: 0.4, grilleChrome: true, lamp: "round", drl: "c", intake: "wide", fog: false, sig: "boomerang-drl-over-round-lamps" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.7, roofTaper: 0.08, hood: 0.26, roof: "fastback", clearance: 0.18, crease: 0.7, cladding: 0.7, top: "body", kick: true, spoiler: true, rails: false },
    wheels: { rim: 17, tyre: "215/60", style: "ten", spokes: 10 },
    notes: "F16 Juke: sloping coupe-crossover roof, slim DRL strip running into a V grille, round main lamps low in the bumper, thick black arch cladding, slim boomerang tail lamps and a roof spoiler.",
    source: "nis-juke,commons",
  },
  car_nissan_qashqai: {
    face: { grilleW: 0.4, grilleChrome: true, lamp: "slim", drl: "c", intake: "wide", fog: false, sig: "boomerang-drl-matrix" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.67, roofTaper: 0.05, hood: 0.27, roof: "flat", clearance: 0.2, windowTrim: "chrome", crease: 0.6, cladding: 0.35, rails: true, top: "contrast", accent: "#1c1c1c", kick: true, spoiler: true, skid: "silver" },
    wheels: { rim: 19, tyre: "225/55", style: "twin", spokes: 5 },
    notes: "J12 Qashqai: large black mesh grille in a chrome V frame, slim boomerang lamps, silver window line and rails, black roof option, slim wrap tail lamps, silver rear skid, large twin-spoke wheels.",
    source: "nis-qash,commons",
  },
  car_nissan_x_trail: {
    face: { grilleW: 0.46, grilleChrome: true, lamp: "angular", drl: "c", intake: "wide", fog: true, sig: "boomerang-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.03, hood: 0.25, roof: "flat", clearance: 0.21, windowTrim: "chrome", crease: 0.5, cladding: 0.4, rails: true, spoiler: true, skid: "silver" },
    wheels: { rim: 18, tyre: "225/60", style: "twin", spokes: 5 },
    notes: "T32 X-Trail facelift: boxy SUV, chrome V-motion grille, boomerang lamps, black arch cladding, silver roof rails and rear skid, boomerang tail lamps sweeping into the quarter, twin-spoke alloys.",
    source: "nis-xtr,commons",
  },
  car_nissan_leaf: {
    face: { grille: "closed", grilleW: 0.3, grilleChrome: true, lamp: "angular", drl: "c", intake: "none", fog: true, sig: "closed-v-motion-boomerang" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.67, roofTaper: 0.04, hood: 0.27, roof: "flat", clearance: 0.15, crease: 0.4, cladding: 0, top: "contrast", accent: "#1c2a6b", pillars: "black", spoiler: true },
    wheels: { rim: 17, tyre: "215/50", style: "twin", spokes: 5 },
    notes: "ZE1 Leaf: closed V-motion nose with a charge port flap on the bonnet front, angular lamps, two-tone roof with black pillars, boomerang tail lamps and a roof spoiler.",
    source: "nis-leaf,commons",
  },
  car_nissan_navara: {
    face: { grilleW: 0.46, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "boomerang-drl" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.63, hood: 0.27, ws: 1.0, roof: "flat", clearance: 0.23, windowTrim: "black", crease: 0.6, cladding: 0.3, cab: "double", bed: "open", rails: true, mirror: "chrome" },
    wheels: { rim: 18, tyre: "255/60", style: "twin", spokes: 5 },
    notes: "D23 Navara: double cab with chrome V-motion grille, wide angular lamps, chrome fog surrounds, side steps and a chrome step bumper, tall vertical tail lamps, open bed and roof rails.",
    source: "nis-nav,commons",
  },
  car_nissan_gt_r: {
    face: { grille: "shield", grilleW: 0.46, grilleChrome: true, lamp: "angular", drl: "c", intake: "wide", fog: false, sig: "v-motion-slim-frame" },
    rear: { lamp: "round", exhaust: "twin" },
    body: { belt: 0.7, roofTaper: 0.06, tumble: 0.11, hood: 0.34, roof: "notchback", clearance: 0.11, crease: 0.9, cladding: 0, spoiler: true, mirror: "body" },
    wheels: { rim: 20, tyre: "255/40", style: "ten", spokes: 10 },
    notes: "R35 GT-R: wide low coupe, black grille in a slim V-motion chrome frame, big lower intake, bonnet vents, four round tail lamps, four exhaust tips, fixed rear wing, multi-spoke 20-inch wheels.",
    source: "nis-gtr,commons",
  },

  // ---- Hyundai ----
  car_hyundai_i10: {
    face: { grilleW: 0.42, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", fog: true, sig: "hex-grille-led-strip" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, hood: 0.25, roof: "flat", crease: 0.4, cladding: 0, spoiler: true, pillars: "black" },
    wheels: { rim: 15, tyre: "185/55", style: "twin", spokes: 5 },
    notes: "IA i10: very short upright city hatch, wide black hex-mesh grille over a big lower intake with round fog pods, slim lamps, roof spoiler, big boomerang tail lamps and dark C-pillar.",
    source: "hyu-i10,commons",
  },
  car_hyundai_i20: {
    face: { grilleW: 0.46, lamp: "slim", drl: "c", intake: "wide", fog: false, sig: "z-strip-slim-lamps" },
    rear: { lamp: "bar", exhaust: "single", bar: true },
    body: { belt: 0.68, roofTaper: 0.05, hood: 0.26, roof: "flat", crease: 0.8, cladding: 0, spoiler: true, kick: true, top: "contrast", accent: "#1c1c1c" },
    wheels: { rim: 17, tyre: "205/45", style: "ten", spokes: 10 },
    notes: "BC3 i20: sharp-edged supermini, wide grille with slim swept lamps, strong crease behind the front wheel, dark roof and spoiler, thin red light bar linking the tail lamps across the tailgate.",
    source: "hyu-i20,commons",
  },
  car_hyundai_i30: {
    face: { grilleW: 0.4, grilleChrome: true, lamp: "slim", drl: "strip", intake: "split", fog: true, sig: "cascading-grille" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.04, hood: 0.28, roof: "flat", crease: 0.5, cladding: 0, spoiler: true },
    wheels: { rim: 16, tyre: "205/55", style: "twin", spokes: 5 },
    notes: "PD i30: low hatch, wide black cascading grille with chrome frame, slim angular lamps, vertical fog pods at the bumper corners, roof spoiler, two-part wrap tail lamps, twin-spoke alloys.",
    source: "hyu-i30,commons",
  },
  car_hyundai_kona: {
    face: { grille: "shield", grilleW: 0.4, grilleChrome: false, lamp: "angular", drl: "strip", intake: "wide", fog: false, sig: "split-lamps-led-strip" },
    rear: { lamp: "bar", exhaust: "hidden" },
    body: { belt: 0.7, hood: 0.26, roof: "flat", clearance: 0.17, crease: 0.6, cladding: 0.8, spoiler: true, top: "body", rails: true, skid: "silver" },
    wheels: { rim: 18, tyre: "235/45", style: "ten", spokes: 10 },
    notes: "2021 Kona facelift: slim LED strip on the bonnet edge above separate main lamps, black mesh grille in thick dark cladding, silver skid plates, black roof rails, slim horizontal tail lamp across the hatch.",
    source: "hyu-kona,commons",
  },
  car_hyundai_creta: {
    face: { grille: "shield", grilleW: 0.4, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, bars: 5, sig: "split-lamps-chrome-grille" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.04, hood: 0.25, roof: "flat", clearance: 0.19, windowTrim: "black", crease: 0.5, cladding: 0.4, rails: true, spoiler: true, skid: "silver" },
    wheels: { rim: 17, tyre: "215/60", style: "ten", spokes: 10 },
    notes: "SU2i Creta: tall square crossover, chrome-slat grille under slim DRL strips stacked above the main lamps, fog lamps in the lower bumper, silver skid, roof rails, geometric multi-spoke alloys.",
    source: "hyu-creta,commons",
  },
  car_hyundai_tucson: {
    face: { grille: "mesh", grilleW: 0.5, grilleChrome: true, lamp: "angular", drl: "c", intake: "split", fog: false, sig: "parametric-hidden-drl" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.69, roofTaper: 0.06, hood: 0.27, ws: 1.15, roof: "flat", clearance: 0.19, windowTrim: "black", crease: 0.95, cladding: 0.3, rails: false, spoiler: true, kick: true },
    wheels: { rim: 19, tyre: "235/55", style: "ten", spokes: 10 },
    notes: "NX4 Tucson: parametric dark-chrome grille hides the lamps in its edges, sharp shoulder creases, black triangular C-pillar, horizontal tail light bar across the tailgate, geometric-spoke wheels.",
    source: "hyu-tuc,commons",
  },
  car_hyundai_ioniq_5: {
    face: { grille: "closed", grilleW: 0.3, lamp: "angular", drl: "bar", intake: "wide", fog: false, id: "hyundai-pixel", sig: "pixel-lamps" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.69, roofTaper: 0.03, hood: 0.2, ws: 1.1, rr: 0.7, roof: "flat", clearance: 0.17, crease: 0.9, cladding: 0, spoiler: true, kick: true, top: "body" },
    wheels: { rim: 19, tyre: "235/55", style: "turbine", spokes: 10 },
    notes: "Ioniq 5: boxy hatch with a clamshell bonnet, dark front band with pixel lamp clusters at the corners, silver lower trim, one continuous full-width pixel tail lamp bar, silver rear bumper.",
    source: "hyu-io5,commons",
  },

  // ---- Kia ----
  car_kia_picanto: {
    face: { grilleW: 0.3, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "tiger-nose-mini" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.66, hood: 0.24, roof: "flat", crease: 0.5, cladding: 0.3, spoiler: true },
    wheels: { rim: 16, tyre: "195/45", style: "twin", spokes: 5 },
    notes: "JA Picanto: tiny tall hatch, narrow chrome-edged tiger nose between swept angular lamps, small round fog pods, tall boomerang tail lamps up the tailgate edge and a roof spoiler.",
    source: "kia-pic,commons",
  },
  car_kia_ceed: {
    face: { grilleW: 0.3, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "tiger-nose-vertical-fog" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.05, hood: 0.28, roof: "flat", crease: 0.4, cladding: 0, windowTrim: "chrome", spoiler: true },
    wheels: { rim: 17, tyre: "225/45", style: "twin", spokes: 5 },
    notes: "CD Ceed: low hatch, narrow black-mesh tiger nose with chrome frame, slim angular lamps, vertical fog pods over a wide lower intake, chrome window line, slim roof spoiler, two-part horizontal tail lamps.",
    source: "kia-ceed,commons",
  },
  car_kia_stonic: {
    face: { grilleW: 0.3, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "tiger-nose-vertical-fog" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.68, hood: 0.25, roof: "flat", clearance: 0.18, crease: 0.4, cladding: 0.6, top: "body", rails: true, spoiler: true, skid: "silver" },
    wheels: { rim: 17, tyre: "205/55", style: "twin", spokes: 5 },
    notes: "YB Stonic: narrow chrome-framed tiger nose, angular lamps, vertical fog pods in a dark lower bumper, thick dark cladding, silver rear skid, silver roof rails and a roof spoiler with a brake lamp.",
    source: "kia-sto,commons",
  },
  car_kia_niro: {
    face: { grilleW: 0.3, grilleChrome: false, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "tiger-nose-ice-cubes" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.67, roofTaper: 0.04, hood: 0.26, roof: "flat", clearance: 0.17, windowTrim: "black", crease: 0.3, cladding: 0.5, rails: true, spoiler: true },
    wheels: { rim: 16, tyre: "205/60", style: "twin", spokes: 5 },
    notes: "DE Niro (first generation): small black-mesh tiger nose, angular lamps, black arch and sill cladding, silver roof rails, boomerang tail lamps under a roof spoiler, twin-spoke alloys.",
    source: "kia-niro,commons",
  },
  car_kia_sportage: {
    face: { grilleW: 0.4, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "tiger-nose-ice-cubes" },
    rear: { lamp: "bar", exhaust: "single", bar: true },
    body: { belt: 0.67, roofTaper: 0.03, hood: 0.27, roof: "flat", clearance: 0.18, windowTrim: "black", crease: 0.5, cladding: 0.4, rails: true, spoiler: true, skid: "black" },
    wheels: { rim: 18, tyre: "235/55", style: "twin", spokes: 5 },
    notes: "QL Sportage facelift: black-mesh tiger-nose grille with a chrome bar into the bumper, angular lamps, ice-cube fog pods in black corners, silver roof rails, tail lamps joined by a slim red bar.",
    source: "kia-spo,commons",
  },
  car_kia_ev6: {
    face: { grille: "closed", grilleW: 0.35, lamp: "slim", drl: "strip", intake: "wide", fog: false, id: "kia-digital-tiger", sig: "heartbeat-drl" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.7, roofTaper: 0.1, hood: 0.22, ws: 1.1, rr: 1.2, roof: "fastback", clearance: 0.16, crease: 0.8, cladding: 0, spoiler: true, kick: true, windowTrim: "chrome" },
    wheels: { rim: 19, tyre: "235/55", style: "twin", spokes: 5 },
    notes: "EV6: closed nose with a thin tiger-nose strip, slim lamps and wide lower intake, chrome sill and window lines, fastback tail with a roof spoiler and a full-width tail light bar, twin-spoke wheels.",
    source: "kia-ev6,commons",
  },

  // ---- Elsewhere ----
  car_byd_atto_3: {
    face: { grille: "closed", grilleW: 0.4, lamp: "slim", drl: "strip", intake: "wide", fog: false, sig: "swept-strip-chrome-lip" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.7, roofTaper: 0.04, hood: 0.25, roof: "flat", clearance: 0.17, crease: 0.55, cladding: 0.4, rails: false, spoiler: true, top: "body", pillars: "black", skid: "silver" },
    wheels: { rim: 18, tyre: "235/50", style: "twin", spokes: 5 },
    notes: "Atto 3: closed nose with slim swept lamps over a wide black lower intake, silver sill strip, black rear pillar panel, tail lamps linked by a light bar over a roof spoiler, sharp-spoke aero wheels.",
    source: "byd-a3,commons",
  },
  car_mg_mg4: {
    face: { grille: "closed", grilleW: 0.4, lamp: "slim", drl: "strip", intake: "wide", fog: false, sig: "slim-angular-lamps" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.7, roofTaper: 0.07, tumble: 0.1, hood: 0.25, ws: 1.2, rr: 0.8, roof: "flat", clearance: 0.14, crease: 0.9, cladding: 0, top: "body", pillars: "black", spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "215/50", style: "twin", spokes: 5 },
    notes: "MG4: low hatch with closed nose, slim angular lamps and big black lower intake with side vents, sharp flank creases, split roof spoiler, slim tail lamp strip, black diffuser-style rear bumper.",
    source: "mg-4,commons",
  },
  car_mahindra_thar: {
    face: { grilleW: 0.3, lamp: "round", drl: "strip", intake: "none", fog: true, bars: 7, sig: "seven-slot" },
    rear: { lamp: "block", exhaust: "single" },
    body: { belt: 0.62, hood: 0.22, ws: 0.8, rr: 0.4, roof: "flat", clearance: 0.22, crease: 0.2, cladding: 0.8, top: "contrast", accent: "#1c1c1c", spoiler: false, rails: false, mirror: "black", skid: "black" },
    wheels: { rim: 18, tyre: "255/65", style: "twin", spokes: 5 },
    notes: "2020 Thar: boxy off-roader, upright windscreen, seven-slot black grille between round lamps, thick black arch flares and bumpers, black hard top, rear-mounted spare wheel, small vertical tail lamps.",
    source: "mah-thar,commons",
  },
  car_tata_nexon: {
    face: { grille: "bar", grilleW: 0.3, grilleChrome: false, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "slim-drl-over-stacked-lamps" },
    rear: { lamp: "block", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.06, hood: 0.24, roof: "flat", clearance: 0.21, crease: 0.5, cladding: 0.5, top: "contrast", accent: "#f2f2f2", rails: true, spoiler: true, kick: true, skid: "silver" },
    wheels: { rim: 16, tyre: "215/60", style: "twin", spokes: 5 },
    notes: "Nexon (first generation): slim DRL strip above the main lamps, thin dark grille bar between them, hex-patterned lower intake with a separate fog pod, contrast roof, silver rails and skid plate.",
    source: "tata-nex,commons",
  },
  car_lada_niva_legend: {
    face: { grille: "slats", grilleW: 0.3, grilleChrome: false, lamp: "round", drl: "none", intake: "none", fog: false, bars: 4, sig: "round-lamps-black-grille" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.6, hood: 0.2, ws: 0.75, rr: 0.4, roof: "flat", clearance: 0.22, windowTrim: "black", crease: 0.15, cladding: 0, rails: false, spoiler: false, top: "body", mirror: "black" },
    wheels: { rim: 16, tyre: "185/75", style: "five", spokes: 5 },
    notes: "Niva Legend: boxy three-door, black bar grille flanked by a round headlamp and square amber indicator block, steel-look bumpers, vertical flat tailgate with tall rectangular tail lamps, rear-mounted tow bar.",
    source: "lada-niva,commons",
  },
};
