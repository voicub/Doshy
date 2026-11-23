import type { DesignRow } from "./cars.design.ts";

// VAG group: Volkswagen (thin bar grille fused with the lamps, ID. series closed nose + light bar), Skoda (crystal grille, C-shaped crystal lamps, SKODA lettering on the tail),
// Seat (shield grille, triangular lamps, sharp shoulder crease), Audi (octagonal singleframe, LED DRL signatures, continuous tail bars on A6 / Q7 facelift / e-tron).
// Generations (from the catalogue lengths): Golf Mk8, Polo Mk6, up! (2016 facelift), Passat B8 (2019 facelift), T-Roc 1, Tiguan 2 (pre-2020), ID.3/ID.4/ID. Buzz, Caddy 5, Transporter T6.1,
// Fabia 4, Octavia 4, Superb 3 (pre-2019), Karoq, Kodiaq 1, Enyaq, Ibiza 5, Leon 4, A3 8Y, A4 B9 facelift, A6 C8, TT 8S, Q3 F3, Q5 FY, Q7 4M facelift, e-tron (2018).
// Pass 2: every row was compared with Commons photos (file titles at the end of this file).
//
// sources:
// commons = https://commons.wikimedia.org (file titles listed at the end of this file)
// vw-golf8 = https://en.wikipedia.org/wiki/Volkswagen_Golf_Mk8
// vw-polo6 = https://en.wikipedia.org/wiki/Volkswagen_Polo
// vw-up = https://en.wikipedia.org/wiki/Volkswagen_Up
// vw-passat = https://en.wikipedia.org/wiki/Volkswagen_Passat_(B8)
// vw-troc = https://en.wikipedia.org/wiki/Volkswagen_T-Roc
// vw-tiguan = https://en.wikipedia.org/wiki/Volkswagen_Tiguan
// vw-id3 = https://en.wikipedia.org/wiki/Volkswagen_ID.3
// vw-id4 = https://en.wikipedia.org/wiki/Volkswagen_ID.4
// vw-buzz = https://en.wikipedia.org/wiki/Volkswagen_ID._Buzz
// vw-caddy = https://en.wikipedia.org/wiki/Volkswagen_Caddy
// vw-t6 = https://en.wikipedia.org/wiki/Volkswagen_Transporter_(T6)
// sk-fabia = https://en.wikipedia.org/wiki/%C5%A0koda_Fabia
// sk-octavia = https://en.wikipedia.org/wiki/%C5%A0koda_Octavia
// sk-superb = https://en.wikipedia.org/wiki/%C5%A0koda_Superb
// sk-karoq = https://en.wikipedia.org/wiki/%C5%A0koda_Karoq
// sk-kodiaq = https://en.wikipedia.org/wiki/%C5%A0koda_Kodiaq
// sk-enyaq = https://en.wikipedia.org/wiki/%C5%A0koda_Enyaq
// se-ibiza = https://en.wikipedia.org/wiki/SEAT_Ibiza
// se-leon = https://en.wikipedia.org/wiki/SEAT_Le%C3%B3n
// au-a3 = https://en.wikipedia.org/wiki/Audi_A3
// au-a4 = https://en.wikipedia.org/wiki/Audi_A4
// au-a6 = https://en.wikipedia.org/wiki/Audi_A6
// au-tt = https://en.wikipedia.org/wiki/Audi_TT
// au-q3 = https://en.wikipedia.org/wiki/Audi_Q3
// au-q5 = https://en.wikipedia.org/wiki/Audi_Q5
// au-q7 = https://en.wikipedia.org/wiki/Audi_Q7
// au-etron = https://en.wikipedia.org/wiki/Audi_e-tron
// vw-brand = https://en.wikipedia.org/wiki/Volkswagen
// sk-brand = https://en.wikipedia.org/wiki/%C5%A0koda_Auto
// se-brand = https://en.wikipedia.org/wiki/SEAT
// au-brand = https://en.wikipedia.org/wiki/Audi

export const BRANDS: Record<string, DesignRow> = {
  Volkswagen: {
    face: { grille: "bar", grilleW: 0.5, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: false, bars: 1, id: "vw-bar", sig: "grille-bar-into-lamps" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, windowTrim: "chrome", mirror: "body" },
    wheels: { rim: 16, style: "five", spokes: 5 },
    source: "vw-brand",
  },
  Skoda: {
    face: { grille: "shield", grilleW: 0.44, grilleChrome: true, lamp: "angular", drl: "c", intake: "wide", fog: false, bars: 0, id: "skoda-crystal", sig: "crystal-c" },
    rear: { lamp: "block", exhaust: "single" },
    body: { belt: 0.66, windowTrim: "chrome", mirror: "body" },
    wheels: { rim: 17, style: "ten", spokes: 10 },
    source: "sk-brand",
  },
  Seat: {
    face: { grille: "shield", grilleW: 0.42, grilleChrome: false, lamp: "angular", drl: "c", intake: "wide", fog: false, bars: 0, id: "seat-shield", sig: "triangular-led" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, crease: 0.8, mirror: "body" },
    wheels: { rim: 16, style: "twin", spokes: 5 },
    source: "se-brand",
  },
  Audi: {
    face: { grille: "shield", grilleW: 0.5, grilleChrome: true, lamp: "angular", drl: "strip", intake: "split", fog: false, bars: 0, id: "audi-singleframe", sig: "led-strip-drl" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.66, crease: 0.8, windowTrim: "chrome", mirror: "body" },
    wheels: { rim: 18, style: "twin", spokes: 5 },
    source: "au-brand",
  },
};

export const ROWS: Record<string, DesignRow> = {
  // ---- Volkswagen ----
  car_volkswagen_golf: {
    face: { grilleW: 0.52, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", sig: "bar-into-slim-lamps" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.05, tumble: 0.1, hood: 0.27, roof: "flat", crease: 0.55, cladding: 0, spoiler: true, pillars: "body", windowTrim: "black" },
    wheels: { rim: 17, tyre: "225/45", style: "ten", spokes: 10 },
    notes: "Mk8 Golf: slim lamps with a thin black bar between them, wide low intake with a horizontal blade, steep tailgate with slim wrap tail lamps and a centred badge, multi-spoke alloys, one small pipe trim.",
    source: "vw-golf8,commons",
  },
  car_volkswagen_golf_variant: {
    face: { grilleW: 0.52, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", sig: "bar-into-slim-lamps" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.66, roofTaper: 0.02, tumble: 0.1, hood: 0.25, roof: "flat", rr: 0.5, crease: 0.55, rails: true, spoiler: true, windowTrim: "chrome" },
    wheels: { rim: 17, tyre: "225/45", style: "ten", spokes: 10 },
    notes: "Golf Mk8 Variant: flat roof with silver rails and a small spoiler, thin chrome window line, steep tailgate with slim tail lamps, same slim-lamp face as the hatch, multi-spoke alloys.",
    source: "vw-golf8,commons",
  },
  car_volkswagen_polo: {
    face: { grilleW: 0.5, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", bars: 1, sig: "chrome-line-through-lamps" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.67, roofTaper: 0.04, tumble: 0.1, hood: 0.25, roof: "flat", crease: 0.6, spoiler: true, windowTrim: "black" },
    wheels: { rim: 16, tyre: "195/55", style: "ten", spokes: 10 },
    notes: "Polo Mk6: slim lamps joined by a thin chrome-lined grille bar, big black lower intake, short steep tail with a roof spoiler, slim wrap tail lamps over a dark diffuser, multi-spoke wheels.",
    source: "vw-polo6,commons",
  },
  car_volkswagen_up: {
    face: { grille: "bar", grilleW: 0.4, grilleChrome: false, lamp: "round", drl: "none", intake: "wide", fog: true, bars: 0, sig: "round-lamps-small-grille" },
    rear: { lamp: "block", exhaust: "hidden" },
    body: { belt: 0.69, roofTaper: 0.02, tumble: 0.12, hood: 0.2, ws: 1.35, rr: 0.4, roof: "flat", crease: 0.3, spoiler: false, windowTrim: "none", cladding: 0 },
    wheels: { rim: 15, style: "five", spokes: 5 },
    notes: "up!: tiny tall hatch, round-cornered lamps, a small bar grille over a wide black-framed intake with round fog lamps, big glass tailgate, tall glasshouse on small wheels.",
    source: "vw-up,commons",
  },
  car_volkswagen_passat: {
    face: { grilleW: 0.55, grilleChrome: true, lamp: "angular", drl: "bar", intake: "wide", bars: 1, sig: "led-strip-joins-matrix-lamps" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.64, roofTaper: 0.06, tumble: 0.08, hood: 0.3, ws: 1.2, rr: 1.4, roof: "notchback", crease: 0.6, windowTrim: "chrome" },
    wheels: { rim: 18, tyre: "235/45", style: "twin", spokes: 5 },
    notes: "Passat B8 saloon (2019): thin double chrome line across the nose joining slim matrix lamps, chrome window frame and sill strip, notchback boot, twin pipe trims, five twin-spoke wheels.",
    source: "vw-passat,commons",
  },
  car_volkswagen_passat_variant: {
    face: { grilleW: 0.55, grilleChrome: true, lamp: "angular", drl: "bar", intake: "wide", bars: 1, sig: "led-strip-joins-matrix-lamps" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.64, roofTaper: 0.02, tumble: 0.08, hood: 0.28, ws: 1.2, rr: 0.5, roof: "flat", crease: 0.6, rails: true, spoiler: true, windowTrim: "chrome" },
    wheels: { rim: 17, tyre: "215/55", style: "ten", spokes: 10 },
    notes: "Passat B8 Variant (facelift): black roof rails and a small spoiler on a long flat roof, thin chrome window line, slim lamps over a chrome-lined grille, two-part wrap tail lamps, multi-spoke alloys.",
    source: "vw-passat,commons",
  },
  car_volkswagen_t_roc: {
    face: { grilleW: 0.46, grilleChrome: true, lamp: "slim", drl: "strip", intake: "split", fog: true, bars: 2, sig: "high-drl-low-main-lamp" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.07, tumble: 0.1, hood: 0.25, ws: 1.15, rr: 1.0, roof: "flat", clearance: 0.17, crease: 0.7, cladding: 0.4, rails: true, spoiler: true, kick: true, skid: "silver" },
    wheels: { rim: 17, tyre: "215/55", style: "ten", spokes: 10 },
    notes: "T-Roc: chunky crossover, chrome-lined wide grille under slim LED lamps, split lower intake with corner pods, grey arch cladding, rails, steep tailgate with slim lamps and a roof spoiler.",
    source: "vw-troc,commons",
  },
  car_volkswagen_tiguan: {
    face: { grilleW: 0.55, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", bars: 2, sig: "chrome-twin-bar-grille" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.68, roofTaper: 0.03, tumble: 0.1, hood: 0.27, ws: 1.15, rr: 0.5, roof: "flat", clearance: 0.2, crease: 0.7, cladding: 0.35, rails: true, spoiler: true, windowTrim: "chrome", skid: "silver" },
    wheels: { rim: 18, tyre: "235/55", style: "twin", spokes: 5 },
    notes: "Tiguan 2: upright SUV, chrome sill and window lines, silver roof rails with a big spoiler, wide chrome-barred grille, horizontal two-part wrap tail lamps, twin-spoke alloys.",
    source: "vw-tiguan,commons",
  },
  car_volkswagen_id_3: {
    face: { lamp: "slim", drl: "strip", intake: "wide", sig: "id-light-band-hex-drl" },
    rear: { lamp: "block", exhaust: "hidden", bar: false },
    body: { belt: 0.65, roofTaper: 0.07, tumble: 0.1, hood: 0.2, ws: 1.25, rr: 0.9, roof: "flat", crease: 0.45, spoiler: true, windowTrim: "black", pillars: "body" },
    wheels: { rim: 18, tyre: "215/50", style: "turbine", spokes: 5 },
    notes: "ID.3: cab-forward hatch with a short bonnet, closed nose with slim lamps and a thin chrome strip, black lower intake slot, small boomerang tail lamps under a dark upper hatch, aero-disc wheels.",
    source: "vw-id3,commons",
  },
  car_volkswagen_id_4: {
    face: { lamp: "slim", drl: "strip", intake: "wide", sig: "id-light-band" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.67, roofTaper: 0.08, tumble: 0.1, hood: 0.22, ws: 1.15, rr: 1.0, roof: "flat", clearance: 0.18, crease: 0.5, cladding: 0.3, rails: false, spoiler: true, kick: true },
    wheels: { rim: 19, tyre: "235/50", style: "turbine", spokes: 5 },
    notes: "ID.4: closed nose with slim lamps and a thin chrome strip, honeycomb lower intake with side pods, falling roof, slim tail lamps joined by a red light line across the tailgate, aero-spoke wheels.",
    source: "vw-id4,commons",
  },
  car_volkswagen_id_buzz: {
    face: { lamp: "slim", drl: "bar", intake: "wide", fog: false, sig: "v-nose-light-bar" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.62, roofTaper: 0, tumble: 0.06, hood: 0.1, ws: 0.8, rr: 0.3, roof: "flat", clearance: 0.19, crease: 0.35, slide: true, top: "contrast", accent: "#f2eee6", pillars: "body", windowTrim: "chrome" },
    wheels: { rim: 19, tyre: "235/55", style: "turbine", spokes: 5 },
    notes: "ID. Buzz: tall retro van, two-tone paint split at the beltline, V-shaped nose with an oversized badge and a thin light bar between slim lamps, big black honeycomb bumper, light bar across the tail.",
    source: "vw-buzz,commons",
  },
  car_volkswagen_caddy: {
    face: { grilleW: 0.5, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", bars: 1, sig: "bar-into-lamps" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.62, roofTaper: 0, tumble: 0.06, hood: 0.2, ws: 1.0, rr: 0.2, roof: "flat", clearance: 0.17, crease: 0.4, slide: true, spoiler: false, rails: true },
    wheels: { rim: 16, tyre: "205/60", style: "ten", spokes: 10 },
    notes: "Caddy 5: boxy small van, slim lamps over a thin dark chrome-lined grille and mesh bumper, black roof rails, sliding side door, tall slim vertical tail lamps on a near-flat tailgate.",
    source: "vw-caddy,commons",
  },
  car_volkswagen_transporter: {
    face: { grille: "bar", grilleW: 0.5, grilleChrome: true, lamp: "wide", drl: "strip", intake: "wide", bars: 2, sig: "large-grille-trapezoid-lower-intake" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.6, roofTaper: 0, tumble: 0.05, hood: 0.16, ws: 0.9, rr: 0.15, roof: "flat", clearance: 0.19, crease: 0.4, slide: true, spoiler: false },
    wheels: { rim: 16, tyre: "205/65", style: "twin", spokes: 5 },
    notes: "Transporter T6.1: flat nose with a big dark grille carrying chrome bars, large angular lamps, steep windscreen, sliding side door, tall slim vertical tail lamps on a near-flat tailgate.",
    source: "vw-t6,commons",
  },

  // ---- Skoda ----
  car_skoda_fabia: {
    face: { grilleW: 0.45, lamp: "slim", drl: "strip", intake: "wide", fog: true, sig: "slim-crystal-lamps" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.05, tumble: 0.1, hood: 0.25, roof: "flat", crease: 0.6, spoiler: true, windowTrim: "black" },
    wheels: { rim: 16, tyre: "195/55", style: "ten", spokes: 10 },
    notes: "Fabia 4: wide black shield grille with vertical bars between slim lamps, small corner fog lamps, roof spoiler, C-shaped tail lamps with spaced SKODA letters, aero-spoke alloys.",
    source: "sk-fabia,commons",
  },
  car_skoda_octavia: {
    face: { grilleW: 0.52, lamp: "slim", drl: "strip", intake: "wide", sig: "split-lamps-upper-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.65, roofTaper: 0.08, tumble: 0.08, hood: 0.3, ws: 1.2, rr: 1.5, roof: "fastback", crease: 0.7, spoiler: true, windowTrim: "chrome" },
    wheels: { rim: 17, tyre: "225/45", style: "ten", spokes: 10 },
    notes: "Octavia 4 Liftback: large black shield grille, slim split lamps, long bonnet, sloping liftback with a boot-lid-like rear deck, slim C-shaped tail lamps, spaced SKODA letters, multi-spoke wheels.",
    source: "sk-octavia,commons",
  },
  car_skoda_octavia_combi: {
    face: { grilleW: 0.52, lamp: "slim", drl: "strip", intake: "wide", sig: "split-lamps-upper-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.65, roofTaper: 0.02, tumble: 0.08, hood: 0.28, ws: 1.2, rr: 0.5, roof: "flat", crease: 0.7, rails: false, spoiler: true, windowTrim: "chrome" },
    wheels: { rim: 17, tyre: "225/45", style: "ten", spokes: 10 },
    notes: "Octavia 4 Combi: long flat roof with roof spoiler and high stop lamp, thin chrome window line, steep tailgate with SKODA lettering and slim C-shaped lamps wrapping the quarter, multi-spoke wheels.",
    source: "sk-octavia,commons",
  },
  car_skoda_superb: {
    face: { grilleW: 0.5, lamp: "angular", drl: "c", intake: "wide", fog: true, bars: 0, sig: "crystal-c-lamps" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.64, roofTaper: 0.07, tumble: 0.08, hood: 0.3, ws: 1.2, rr: 1.6, roof: "fastback", crease: 0.8, spoiler: false, windowTrim: "chrome", cladding: 0 },
    wheels: { rim: 18, tyre: "235/45", style: "twin", spokes: 5 },
    notes: "Superb 3 Liftback: chrome-framed shield grille, sharp C-shaped crystal tail lamps, deep crease along the flank, chrome window frame, long boot-lid-like hatch, spaced SKODA letters, one visible pipe.",
    source: "sk-superb,commons",
  },
  car_skoda_karoq: {
    face: { grilleW: 0.44, lamp: "angular", drl: "c", intake: "wide", fog: true, sig: "crystal-c-lamps" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.68, roofTaper: 0.03, tumble: 0.1, hood: 0.26, ws: 1.15, rr: 0.5, roof: "flat", clearance: 0.18, crease: 0.7, cladding: 0.35, rails: true, spoiler: true, skid: "silver" },
    wheels: { rim: 17, tyre: "215/55", style: "ten", spokes: 10 },
    notes: "Karoq: black shield grille with vertical slats, slim split lamps, black sill and arch plastic, roof rails, upright tailgate with slim wrap tail lamps and SKODA lettering, large aero-style alloys.",
    source: "sk-karoq,commons",
  },
  car_skoda_kodiaq: {
    face: { grilleW: 0.46, lamp: "angular", drl: "c", intake: "wide", fog: true, sig: "crystal-c-lamps" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.67, roofTaper: 0.02, tumble: 0.1, hood: 0.28, ws: 1.1, rr: 0.4, roof: "flat", clearance: 0.2, crease: 0.8, cladding: 0.35, rails: true, spoiler: true, windowTrim: "chrome", skid: "silver" },
    wheels: { rim: 18, tyre: "235/55", style: "ten", spokes: 10 },
    notes: "Kodiaq: big upright SUV, tall black grille with vertical bars between slim lamps, strong sill and arch lines, roof rails, steep tailgate with slim C-shaped tail lamps and SKODA letters, multi-spoke alloys.",
    source: "sk-kodiaq,commons",
  },
  car_skoda_enyaq_iv: {
    face: { grille: "shield", grilleW: 0.46, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", bars: 0, sig: "crystal-face-lit-grille" },
    rear: { lamp: "wrap", exhaust: "hidden", bar: false },
    body: { belt: 0.67, roofTaper: 0.06, tumble: 0.1, hood: 0.24, ws: 1.15, rr: 1.1, roof: "flat", clearance: 0.17, crease: 0.55, cladding: 0.3, spoiler: true, windowTrim: "chrome" },
    wheels: { rim: 19, tyre: "235/55", style: "turbine", spokes: 5 },
    notes: "Enyaq iV: closed chrome-framed black grille, slim lamps, small lower mesh intake, black sill and bumper plastic, softly falling roof, slim C-shaped tail lamps, SKODA letters, aero-disc wheels.",
    source: "sk-enyaq,commons",
  },

  // ---- Seat ----
  car_seat_ibiza: {
    face: { grilleW: 0.42, lamp: "angular", drl: "c", intake: "wide", fog: true, sig: "triangular-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { belt: 0.66, roofTaper: 0.05, tumble: 0.1, hood: 0.25, roof: "flat", crease: 0.9, spoiler: true, windowTrim: "black" },
    wheels: { rim: 16, tyre: "195/55", style: "twin", spokes: 5 },
    notes: "Ibiza 5: black shield grille with a thin chrome line under a raised badge, sharp triangular lamps, round fog lamps, strong shoulder crease, slim wrap tail lamps, twin-spoke alloys.",
    source: "se-ibiza,commons",
  },
  car_seat_leon: {
    face: { grilleW: 0.46, lamp: "slim", drl: "strip", intake: "wide", sig: "slim-triangle-led" },
    rear: { lamp: "bar", exhaust: "single", bar: true },
    body: { belt: 0.65, roofTaper: 0.07, tumble: 0.08, hood: 0.27, roof: "flat", crease: 0.9, spoiler: true, windowTrim: "black" },
    wheels: { rim: 17, tyre: "225/45", style: "twin", spokes: 5 },
    notes: "Leon 4: slim triangular lamps, sharp shoulder crease, roof spoiler over a steep rear glass, and a full-width red LED line across the tail linking both lamps, LEON lettering under the badge.",
    source: "se-leon,commons",
  },

  // ---- Audi ----
  car_audi_a3: {
    face: { grille: "mesh", grilleW: 0.5, lamp: "slim", drl: "strip", intake: "split", sig: "segmented-led-drl" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.66, roofTaper: 0.06, tumble: 0.08, hood: 0.27, roof: "flat", crease: 0.9, spoiler: true, windowTrim: "black" },
    wheels: { rim: 17, tyre: "225/45", style: "ten", spokes: 10 },
    notes: "A3 8Y: honeycomb singleframe with a thin chrome frame, slim sharp lamps, chrome-edged corner pods, strong rear shoulder, slim wrap tail lamps with a red strip under them, multi-spoke wheels.",
    source: "au-a3,commons",
  },
  car_audi_a4: {
    face: { grille: "mesh", grilleW: 0.52, lamp: "slim", drl: "strip", intake: "split", sig: "led-strip-lamps" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.65, roofTaper: 0.06, tumble: 0.08, hood: 0.3, ws: 1.2, rr: 1.3, roof: "notchback", crease: 0.85, windowTrim: "chrome" },
    wheels: { rim: 17, tyre: "225/50", style: "twin", spokes: 5 },
    notes: "A4 B9 facelift: wide honeycomb singleframe, slim LED lamps, chrome-edged corner intakes, notchback with a short boot-lid lip, slim wrap tail lamps, chrome-trimmed diffuser with twin pipes, twin-spoke alloys.",
    source: "au-a4,commons",
  },
  car_audi_a6: {
    face: { grille: "shield", grilleW: 0.55, lamp: "slim", drl: "strip", intake: "split", bars: 6, sig: "matrix-led-hex-drl" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { belt: 0.65, roofTaper: 0.08, tumble: 0.08, hood: 0.3, ws: 1.2, rr: 1.4, roof: "fastback", crease: 1.0, windowTrim: "chrome", cladding: 0 },
    wheels: { rim: 18, tyre: "245/45", style: "twin", spokes: 5 },
    notes: "A6 C8: wide singleframe with horizontal chrome bars, slim sharp lamps, chrome-edged corner pods, low coupe-like roof with a thin chrome window frame, light bar across the boot lid, twin-spoke alloys.",
    source: "au-a6,commons",
  },
  car_audi_tt: {
    face: { grille: "mesh", grilleW: 0.56, lamp: "slim", drl: "strip", intake: "split", sig: "slim-led-blades" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.72, roofTaper: 0.08, tumble: 0.1, hood: 0.33, ws: 1.5, rr: 1.4, roof: "fastback", crease: 0.9, spoiler: true, windowTrim: "none", pillars: "body" },
    wheels: { rim: 18, tyre: "245/45", style: "twin", spokes: 5 },
    notes: "TT 8S: very low wide honeycomb singleframe, slim blade lamps, small corner intakes, high waistline over a tight glasshouse, hatch with a small lip spoiler, trapezoid tail lamps, twin round pipes.",
    source: "au-tt,commons",
  },
  car_audi_q3: {
    face: { grilleW: 0.5, lamp: "angular", drl: "strip", intake: "wide", sig: "led-strip-lamps" },
    rear: { lamp: "wrap", exhaust: "hidden" },
    body: { belt: 0.68, roofTaper: 0.04, tumble: 0.1, hood: 0.26, ws: 1.15, rr: 0.7, roof: "flat", clearance: 0.19, crease: 0.8, cladding: 0.5, rails: true, spoiler: true, skid: "silver" },
    wheels: { rim: 18, tyre: "235/50", style: "twin", spokes: 5 },
    notes: "Q3 F3: tall octagonal singleframe with vertical slats, angular lamps, big grey arch and sill cladding, black roof rails, roof spoiler, slim wrap tail lamps with a notched top edge, twin-spoke alloys.",
    source: "au-q3,commons",
  },
  car_audi_q5: {
    face: { grilleW: 0.52, lamp: "slim", drl: "strip", intake: "wide", sig: "led-strip-lamps" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { belt: 0.67, roofTaper: 0.04, tumble: 0.1, hood: 0.28, ws: 1.15, rr: 0.7, roof: "flat", clearance: 0.2, crease: 0.85, cladding: 0.3, rails: true, spoiler: true, skid: "silver" },
    wheels: { rim: 19, tyre: "235/55", style: "twin", spokes: 5 },
    notes: "Q5 FY: tall octagonal singleframe with thick vertical chrome slats, slim LED lamps, chrome-edged corner intakes, chrome sill strip, silver rails, slim wrap tail lamps, twin-spoke alloys.",
    source: "au-q5,commons",
  },
  car_audi_q7: {
    face: { grilleW: 0.56, grilleChrome: true, lamp: "angular", drl: "strip", intake: "split", bars: 0, sig: "tall-singleframe-led" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { belt: 0.67, roofTaper: 0.03, tumble: 0.1, hood: 0.3, ws: 1.05, rr: 0.5, roof: "flat", clearance: 0.22, crease: 0.8, cladding: 0.35, rails: true, spoiler: true, skid: "silver" },
    wheels: { rim: 19, tyre: "255/55", style: "twin", spokes: 5 },
    notes: "Q7 facelift: very tall octagonal singleframe with vertical chrome bars, slim LED lamps, chrome sill and window line, silver rails, thin chrome line between the tail lamps, dark lower rear bumper with twin trims.",
    source: "au-q7,commons",
  },
  car_audi_e_tron: {
    face: { grille: "shield", grilleW: 0.52, grilleChrome: true, lamp: "angular", drl: "strip", intake: "none", bars: 0, sig: "closed-octagon-matrix-led" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.68, roofTaper: 0.07, tumble: 0.1, hood: 0.28, ws: 1.15, rr: 0.8, roof: "flat", clearance: 0.2, crease: 0.9, cladding: 0.45, rails: true, spoiler: true, windowTrim: "chrome", skid: "silver" },
    wheels: { rim: 20, tyre: "255/50", style: "ten", spokes: 10 },
    notes: "e-tron: wide octagonal singleframe with a fine grid and grey frame, slim LED lamps, chrome-edged corner intakes, wide arch cladding, silver rails, chrome sill strip, multi-spoke wheels, tail light bar.",
    source: "au-etron,commons",
  },
};

// photos (Wikimedia Commons file titles viewed for pass 2; titles only):
// car_volkswagen_golf: File:2020 Volkswagen Golf Style 1.5 Front.jpg, File:2020 Volkswagen Golf Style 1.5 Rear.jpg
// car_volkswagen_golf_variant: File:Volkswagen Golf VIII Variant 2.0 TDI (2023) (53462414489).jpg, File:Volkswagen GOLF VARIANT TDI Elegance (3DA-CJ20V) rear.jpg
// car_volkswagen_polo: File:2024 Volkswagen Polo Life front.jpg, File:Volkswagen Polo VI (2021) IMG 5322.jpg
// car_volkswagen_up: File:Volkswagen up! white.jpg, File:Volkswagen up! White (rear quarter).jpg
// car_volkswagen_passat: File:Volkswagen Passat B8 (2019) IMG 2432.jpg, File:Volkswagen Passat B8 (2019) IMG 2431.jpg
// car_volkswagen_passat_variant: File:VW Passat Variant (B8, Facelift) – f 25042026.jpg, File:VW Passat Variant (B8, Facelift) – h 25042026.jpg
// car_volkswagen_t_roc: File:Volkswagen T-Roc (2021) 1X7A0330.jpg, File:Volkswagen T-Roc (2021) 1X7A0333.jpg
// car_volkswagen_tiguan: File:Volkswagen Tiguan II 2.0 TDI en Valencia.jpg, File:Volkswagen Tiguan II 03 China 2017-04-06.jpg
// car_volkswagen_id_3: File:Volkswagen ID.3 (2023) IMG 7973.jpg, File:Volkswagen ID.3 (2023) Automesse Ludwigsburg 2023 1X7A0002.jpg
// car_volkswagen_id_4: File:Volkswagen ID.4 GTX 1X7A0301.jpg, File:Volkswagen ID.4 20240224 (rear).jpg
// car_volkswagen_id_buzz: File:Volkswagen ID. Buzz Cargo 1X7A7460.jpg, File:Volkswagen ID. Buzz Cargo IMG 2248.jpg
// car_volkswagen_caddy: File:Volkswagen Caddy V Maxi California 1X7A0245.jpg, File:Volkswagen Caddy V Maxi 1X7A6364.jpg
// car_volkswagen_transporter: File:2019 Volkswagen Transporter GT (front).jpg, File:2019 Volkswagen Transporter GT (rear).jpg
// car_skoda_fabia: File:Skoda Fabia IV - front.jpg, File:Škoda Fabia IV 1X7A7108 (cropped).jpg
// car_skoda_octavia: File:2024 Skoda Octavia 110TSI Select front.jpg, File:2024 Skoda Octavia 110TSI Select rear.jpg
// car_skoda_octavia_combi: File:Škoda Octavia IV Combi (2019 - 2022) (52053010208).jpg, File:Škoda Octavia IV Combi Facelift Automesse Ludwigsburg 2024 IMG 1649.jpg
// car_skoda_superb: File:Skoda Superb 162TSI, 2018 rear.jpg
// car_skoda_karoq: File:Skoda Karoq Facelift 1X7A0318.jpg, File:Skoda Karoq Facelift 1X7A0329.jpg
// car_skoda_kodiaq: File:White Škoda Kodiaq three-quarter front view.jpg, File:Skoda Kodiaq Facelift 1X7A6163.jpg
// car_skoda_enyaq_iv: File:Skoda Enyaq iV 80 (front).jpg, File:Skoda Enyaq iV 80 (rear).jpg
// car_seat_ibiza: File:Seat Ibiza FR business intense (2018) front view.jpg, File:Seat Ibiza FR 2018 rear view.jpg
// car_seat_leon: File:Seat León IV 1.0 TSI (2021) (52012660542).jpg, File:Seat León IV 1.0 TSI (2021) (52019112357).jpg
// car_audi_a3: File:Audi A3 Sportback 30 TFSI advanced (3AA-GYDLA) front.jpg, File:Audi A3 Sportback 30 TFSI advanced (3AA-GYDLA) rear.jpg
// car_audi_a4: File:2020 Audi A4 S Line 35 TDi S-A facelift 2.0 Front.jpg, File:2020 Audi A4 S Line 35 TDi S-A 2.0 facelift Rear.jpg
// car_audi_a6: File:2018 Audi A6 Sport 40 TDi S-A 2.0.jpg, File:2018 Audi A6 Sport 40 TDi S-A 2.0 (1).jpg
// car_audi_tt: File:Audi TT Coupe (8S) front.JPG, File:Audi TT Coupé 2.0 TFSI (8S) rear.JPG
// car_audi_q3: File:Audi Q3 F3 DSC 7494.jpg, File:Audi Q3 F3 DSC 7496.jpg
// car_audi_q5: File:Audi Q5 FY 50 TFSI e Facelift IMG 5284.jpg, File:2017 Audi Q5 (FY) rear (silver) 1.jpg
// car_audi_q7: File:2020 Audi Q7 (facelift), front 10.15.20.jpg, File:2020 Audi Q7 (facelift), rear 10.15.20.jpg
// car_audi_e_tron: File:Audi e-tron 55 quattro front.jpg
