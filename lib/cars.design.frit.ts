import type { DesignRow } from "./cars.design.ts";

// French / Italian / Opel group: Renault, Dacia, Peugeot, Citroen, Opel, Fiat, Alfa Romeo.
// Renault: C-shaped daytime lamps in angular headlamps, big diamond mid-grille. Dacia: Y-shaped lamp signature. Peugeot: upright lion grille (dark
// mesh), "fang" DRL blades under the lamps, three-claw tail lamps joined by a black bar. Citroen: split lamps (thin chevron-wing DRL high, main lamp
// low), Airbump door pods. Opel: Vizor black front panel and "Compass" proportions. Fiat: round retro lamps (500), squircle shapes (Panda). Alfa
// Romeo: scudetto grille between trilobo-shaped lower intakes.
//
// sources:
// ren = https://en.wikipedia.org/wiki/Renault
// ren-twingo = https://en.wikipedia.org/wiki/Renault_Twingo
// ren-clio = https://en.wikipedia.org/wiki/Renault_Clio
// ren-megane = https://en.wikipedia.org/wiki/Renault_M%C3%A9gane
// ren-megane-etech = https://en.wikipedia.org/wiki/Renault_M%C3%A9gane_E-Tech
// ren-captur = https://en.wikipedia.org/wiki/Renault_Captur
// ren-zoe = https://en.wikipedia.org/wiki/Renault_Zoe
// ren-trafic = https://en.wikipedia.org/wiki/Renault_Trafic
// dac = https://en.wikipedia.org/wiki/Dacia_(carmaker)
// dac-duster = https://en.wikipedia.org/wiki/Dacia_Duster
// dac-sandero = https://en.wikipedia.org/wiki/Dacia_Sandero
// dac-logan = https://en.wikipedia.org/wiki/Dacia_Logan
// dac-spring = https://en.wikipedia.org/wiki/Dacia_Spring
// peu = https://en.wikipedia.org/wiki/Peugeot
// peu-208 = https://en.wikipedia.org/wiki/Peugeot_208
// peu-308 = https://en.wikipedia.org/wiki/Peugeot_308
// peu-2008 = https://en.wikipedia.org/wiki/Peugeot_2008
// peu-3008 = https://en.wikipedia.org/wiki/Peugeot_3008
// peu-5008 = https://en.wikipedia.org/wiki/Peugeot_5008
// cit = https://en.wikipedia.org/wiki/Citro%C3%ABn
// cit-ami = https://en.wikipedia.org/wiki/Citro%C3%ABn_Ami_(electric_vehicle)
// cit-c3 = https://en.wikipedia.org/wiki/Citro%C3%ABn_C3
// cit-c4 = https://en.wikipedia.org/wiki/Citro%C3%ABn_C4
// cit-c5x = https://en.wikipedia.org/wiki/Citro%C3%ABn_C5_Aircross
// cit-berlingo = https://en.wikipedia.org/wiki/Citro%C3%ABn_Berlingo
// opel = https://en.wikipedia.org/wiki/Opel
// opel-corsa = https://en.wikipedia.org/wiki/Opel_Corsa
// opel-astra = https://en.wikipedia.org/wiki/Opel_Astra
// opel-mokka = https://en.wikipedia.org/wiki/Opel_Mokka
// fiat = https://en.wikipedia.org/wiki/Fiat_Automobiles
// fiat-500 = https://en.wikipedia.org/wiki/Fiat_500_(2007)
// fiat-500e = https://en.wikipedia.org/wiki/Fiat_500e
// fiat-panda = https://en.wikipedia.org/wiki/Fiat_Panda
// fiat-tipo = https://en.wikipedia.org/wiki/Fiat_Tipo_(2015)
// fiat-ducato = https://en.wikipedia.org/wiki/Fiat_Ducato
// alfa = https://en.wikipedia.org/wiki/Alfa_Romeo
// alfa-giulia = https://en.wikipedia.org/wiki/Alfa_Romeo_Giulia_(952)
// alfa-stelvio = https://en.wikipedia.org/wiki/Alfa_Romeo_Stelvio
// commons = https://commons.wikimedia.org (file titles in the `// photos:` list at the end of this file)

export const BRANDS: Record<string, DesignRow> = {
  Renault: {
    face: { grille: "shield", grilleW: 0.4, grilleChrome: false, lamp: "angular", drl: "c", intake: "wide", fog: false, bars: 0, id: "renault-c-shape", sig: "c-shape-drl" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 16, style: "five", spokes: 5 },
    source: "ren",
  },
  Dacia: {
    face: { grille: "slats", grilleW: 0.4, grilleChrome: false, lamp: "angular", drl: "c", intake: "wide", fog: false, bars: 3, id: "dacia-y-signature", sig: "y-shaped-lamp" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body", skid: "silver" },
    wheels: { rim: 16, style: "five", spokes: 5 },
    source: "dac",
  },
  Peugeot: {
    face: { grille: "mesh", grilleW: 0.42, grilleChrome: false, lamp: "slim", drl: "c", intake: "wide", fog: false, bars: 0, id: "peugeot-lion-fang", sig: "fang" },
    rear: { lamp: "bar", exhaust: "single", bar: true },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "twin", spokes: 5 },
    source: "peu",
  },
  Citroen: {
    face: { grille: "bar", grilleW: 0.36, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: false, bars: 0, id: "citroen-split-chevron", sig: "split-lamps-chevron-wings" },
    rear: { lamp: "block", exhaust: "hidden" },
    body: { mirror: "body" },
    wheels: { rim: 16, style: "five", spokes: 5 },
    source: "cit",
  },
  Opel: {
    face: { grille: "bar", grilleW: 0.5, grilleChrome: false, lamp: "slim", drl: "strip", intake: "wide", fog: false, bars: 0, id: "opel-vizor", sig: "vizor-black-panel" },
    rear: { lamp: "wrap", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 17, style: "twin", spokes: 5 },
    source: "opel",
  },
  Fiat: {
    face: { grille: "bar", grilleW: 0.36, grilleChrome: true, lamp: "round", drl: "none", intake: "wide", fog: false, bars: 0, id: "fiat-round-retro", sig: "round-lamps" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { mirror: "body" },
    wheels: { rim: 15, style: "five", spokes: 5 },
    source: "fiat",
  },
  "Alfa Romeo": {
    face: { grille: "shield", grilleW: 0.3, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: false, bars: 0, id: "alfa-scudetto-trilobo", sig: "scudetto-trilobo" },
    rear: { lamp: "wrap", exhaust: "twin" },
    body: { mirror: "body" },
    wheels: { rim: 18, style: "five", spokes: 5 },
    source: "alfa",
  },
};

export const ROWS: Record<string, DesignRow> = {
  // ---- Renault ----
  // Twingo III (2014-): rear-engined city car, so there is no radiator grille, only a narrow lower slot; short nose, tall cabin, big hatch glass.
  car_renault_twingo: {
    face: { grille: "bar", grilleW: 0.32, lamp: "round", drl: "strip", intake: "wide", sig: "round-lamp-led-strip" },
    rear: { lamp: "block", exhaust: "single", bar: false },
    body: { belt: 0.66, roofTaper: 0.02, tumble: 0.1, hood: 0.2, ws: 1.35, rr: 0.5, roof: "flat", clearance: 0.13, crease: 0.4, cladding: 0.2, spoiler: false, kick: false },
    wheels: { rim: 15, tyre: "185/55", style: "five", spokes: 5 },
    notes: "Tiny rear-engined five-door: short snub nose with round lamps and a narrow lower slot, tall rounded cabin, black door-sill strip, big black hatch glass, small tail lamps in the high rear corners.",
    source: "ren-twingo,commons",
  },
  // Clio V (2019-): sharper than the IV, C-shaped LEDs in swept lamps, wide black lower intake with corner vents.
  car_renault_clio: {
    face: { grille: "bar", grilleW: 0.4, lamp: "slim", drl: "c", intake: "wide", sig: "c-shape-led" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.66, roofTaper: 0.04, tumble: 0.09, hood: 0.27, ws: 1.2, rr: 0.75, roof: "flat", clearance: 0.14, windowTrim: "black", crease: 0.6, cladding: 0.05, spoiler: true, kick: false },
    wheels: { rim: 16, tyre: "205/55", style: "twin", spokes: 5 },
    notes: "Compact hatch: swept lamps with C-shaped LEDs, diamond on a body-colour bar above a wide black mesh intake, black corner vents, thin chrome sill strip, black window frames, wrap tail lamps.",
    source: "ren-clio,commons",
  },
  // Megane IV five-door (2015-2020 face seen): chrome-slatted grille, fogs low in the bumper, lamps joined by a bar at the back.
  car_renault_megane: {
    face: { grille: "slats", grilleW: 0.42, grilleChrome: true, lamp: "angular", drl: "c", intake: "wide", fog: true, bars: 4, sig: "c-shape-led" },
    rear: { lamp: "bar", exhaust: "single", bar: true },
    body: { belt: 0.67, roofTaper: 0.06, tumble: 0.08, hood: 0.28, ws: 1.25, rr: 0.8, roof: "flat", clearance: 0.13, windowTrim: "chrome", crease: 0.75, cladding: 0.05, spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "225/45", style: "twin", spokes: 5 },
    notes: "Low wide hatch: big diamond over a chrome-fin grille, C-shaped DRL, fog lamps in the lower corners, strong rear haunches, C-shaped tail lamps joined by a thin bar, small roof spoiler.",
    source: "ren-megane,commons",
  },
  // Megane E-Tech (2022-): electric hatch with crossover stance; the bonnet front is a dark bar with a lower mesh insert.
  car_renault_megane_e_tech: {
    face: { grille: "closed", grilleW: 0.4, lamp: "slim", drl: "c", intake: "wide", sig: "c-shape-led-slim" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.68, roofTaper: 0.08, tumble: 0.1, hood: 0.24, ws: 1.1, rr: 1.1, roof: "fastback", clearance: 0.17, pillars: "black", windowTrim: "black", crease: 0.6, cladding: 0.5, spoiler: true, kick: true, skid: "black" },
    wheels: { rim: 20, tyre: "215/45", style: "turbine", spokes: 5 },
    notes: "Electric crossover-hatch: slim lamps with a thin DRL line above a dark bar and lower mesh insert, heavy black arch and sill cladding, sloping rear with spoiler, thin lamp strip across the tail, big aero wheels.",
    source: "ren-megane-etech,commons",
  },
  // Captur II (2019-): bigger than the first, Clio V face; two-tone roof (black here) and no rails on the cars seen.
  car_renault_captur: {
    face: { grille: "shield", grilleW: 0.4, lamp: "angular", drl: "c", intake: "wide", sig: "c-shape-led" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.68, roofTaper: 0.05, tumble: 0.1, hood: 0.25, ws: 1.15, rr: 0.7, roof: "flat", clearance: 0.17, windowTrim: "black", crease: 0.6, cladding: 0.45, rails: false, spoiler: true, top: "contrast", accent: "#2a2a2a", kick: false, skid: "silver" },
    wheels: { rim: 17, tyre: "215/55", style: "twin", spokes: 5 },
    notes: "Small crossover: black contrast roof with spoiler, black arch and sill cladding, silver diffuser and a visible exhaust tip at the rear, C-shaped LED lamps, slim horizontal tail lamps.",
    source: "ren-captur,commons",
  },
  // Zoe (2012-, Phase 2 seen): rounded electric supermini; the charging socket sits behind the big diamond on the nose.
  car_renault_zoe: {
    face: { grille: "closed", grilleW: 0.3, lamp: "wide", drl: "strip", intake: "wide", sig: "led-strip-round-nose" },
    rear: { lamp: "round", exhaust: "hidden", bar: false },
    body: { belt: 0.68, roofTaper: 0.03, tumble: 0.11, hood: 0.22, ws: 1.2, rr: 0.65, roof: "flat", clearance: 0.12, windowTrim: "black", crease: 0.5, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 16, tyre: "195/55", style: "ten", spokes: 10 },
    notes: "Rounded electric five-door: bulging bonnet, big diamond on a smooth nose above a small black lower grille, slim wide lamps, rear door handles hidden in the pillar, rounded lamps high on a stubby tail.",
    source: "ren-zoe,commons",
  },
  // Trafic III (2014-): cab-forward van; long wheelbase panel van, tall roof.
  car_renault_trafic: {
    face: { grille: "slats", grilleW: 0.4, lamp: "angular", drl: "c", intake: "wide", fog: true, bars: 2, sig: "c-shape-led" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.62, roofTaper: 0, tumble: 0.05, hood: 0.15, ws: 1.5, rr: 0.1, roof: "flat", clearance: 0.17, crease: 0.35, cladding: 0.3, slide: true, kick: false, mirror: "black", skid: "black" },
    wheels: { rim: 16, tyre: "215/65", style: "steel", spokes: 5 },
    notes: "Cab-forward panel van: almost no bonnet, steeply raked windscreen, diamond on a grille of chrome slats, black bumpers, tall flat roof, upright rear with slim corner tail lamps and twin barn doors.",
    source: "ren-trafic,commons",
  },

  // ---- Dacia ----
  // Duster II (2018-2023, 2021 facelift seen): the table dimensions are the 4WD of that generation.
  car_dacia_duster: {
    face: { grille: "slats", grilleW: 0.42, lamp: "angular", drl: "c", intake: "wide", fog: true, bars: 3, sig: "y-shaped-led" },
    rear: { lamp: "vertical", exhaust: "single", bar: false },
    body: { belt: 0.68, roofTaper: 0.03, tumble: 0.08, hood: 0.28, ws: 1.15, rr: 0.45, roof: "flat", clearance: 0.21, windowTrim: "black", crease: 0.55, cladding: 0.55, rails: true, spoiler: true, kick: false, skid: "silver" },
    wheels: { rim: 17, tyre: "215/60", style: "twin", spokes: 5 },
    notes: "Boxy budget SUV: high bonnet, trapezoid slatted grille around the badge, Y-shaped LED lamps, round fogs in a black bumper with a big silver skid plate, silver roof bars, heavy black arch cladding.",
    source: "dac-duster,commons",
  },
  // Sandero III (2020-): bigger and wider than before; Y-shaped lamps, slatted hex grille.
  car_dacia_sandero: {
    face: { grille: "slats", grilleW: 0.4, lamp: "angular", drl: "c", intake: "wide", fog: true, bars: 3, sig: "y-shaped-led" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.67, roofTaper: 0.04, tumble: 0.09, hood: 0.26, ws: 1.2, rr: 0.7, roof: "flat", clearance: 0.14, crease: 0.55, cladding: 0.1, spoiler: true, kick: false, skid: "none" },
    wheels: { rim: 16, tyre: "195/55", style: "five", spokes: 5 },
    notes: "Plain supermini with a wide stance for its length: slatted hex grille between swept Y-signature lamps, round fogs low in a black lower intake, sharp shoulder crease, short slim tail lamps, tall boxy tail.",
    source: "dac-sandero,commons",
  },
  // Logan III (2020-): the Sandero's face on a four-door notchback.
  car_dacia_logan: {
    face: { grille: "slats", grilleW: 0.4, lamp: "angular", drl: "c", intake: "wide", fog: true, bars: 3, sig: "y-shaped-led" },
    rear: { lamp: "block", exhaust: "single", bar: false },
    body: { belt: 0.66, roofTaper: 0.05, tumble: 0.09, hood: 0.27, ws: 1.2, rr: 0.5, roof: "notchback", clearance: 0.14, crease: 0.5, cladding: 0.05, spoiler: false, kick: false, skid: "none" },
    wheels: { rim: 16, tyre: "195/55", style: "five", spokes: 5 },
    notes: "Four-door budget saloon: Sandero front, roof running into a short upright notchback boot, plain flanks, short horizontal tail lamps at the corners.",
    source: "dac-logan,commons",
  },
  // Spring (2021-): tiny electric crossover; the nose keeps a slatted grille-look panel and tall DRL over a low lamp.
  car_dacia_spring: {
    face: { grille: "slats", grilleW: 0.34, lamp: "slim", drl: "strip", intake: "wide", bars: 3, sig: "y-shaped-led" },
    rear: { lamp: "block", exhaust: "hidden", bar: false },
    body: { belt: 0.68, roofTaper: 0.02, tumble: 0.1, hood: 0.18, ws: 1.2, rr: 0.5, roof: "flat", clearance: 0.15, windowTrim: "black", crease: 0.4, cladding: 0.6, rails: true, spoiler: false, kick: false, skid: "silver" },
    wheels: { rim: 14, tyre: "165/70", style: "steel", spokes: 5 },
    notes: "Mini electric crossover: very short nose, upright tall body, heavy black arch cladding and door-lower trim, black roof rails, black bumper skid plates, slim lamps over a low lamp, small block tail lamps.",
    source: "dac-spring,commons",
  },

  // ---- Peugeot ----
  // 208 II (2019-): low and wide; checkered black grille, fang DRL blades, black-glass tailgate.
  car_peugeot_208: {
    face: { grille: "mesh", grilleW: 0.4, lamp: "slim", drl: "c", intake: "wide", sig: "fang" },
    rear: { lamp: "bar", exhaust: "single", bar: true },
    body: { belt: 0.66, roofTaper: 0.04, tumble: 0.1, hood: 0.27, ws: 1.2, rr: 0.7, roof: "flat", clearance: 0.13, pillars: "body", windowTrim: "black", crease: 0.7, cladding: 0.05, spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "205/45", style: "twin", spokes: 5 },
    notes: "Low sporty supermini: lion on a body-framed black mesh grille, slim lamps with a vertical fang blade at each bumper corner, roof spoiler over a black tailgate glass, black bar linking three-claw tail lamps.",
    source: "peu-208,commons",
  },
  // e-208: same body, black roof and arch trims on the GT seen, mesh-look closed front.
  car_peugeot_e_208: {
    face: { grille: "mesh", grilleW: 0.4, lamp: "slim", drl: "c", intake: "none", sig: "fang" },
    rear: { lamp: "bar", exhaust: "hidden", bar: true },
    body: { belt: 0.66, roofTaper: 0.04, tumble: 0.1, hood: 0.27, ws: 1.2, rr: 0.7, roof: "flat", clearance: 0.13, pillars: "body", windowTrim: "black", crease: 0.7, cladding: 0.15, spoiler: true, top: "contrast", accent: "#161616", kick: true },
    wheels: { rim: 17, tyre: "205/45", style: "twin", spokes: 5 },
    notes: "Electric 208: closed mesh-look nose with the lion, fang blades, black roof and thin black arch trims on the GT, black rear bar with the name between claw lamps, no exhaust, black lower rear bumper.",
    source: "peu-208,commons",
  },
  // 308 III (2021-): lower and wider than the 308 II, frameless dark grille.
  car_peugeot_308: {
    face: { grille: "mesh", grilleW: 0.44, lamp: "slim", drl: "c", intake: "wide", sig: "fang" },
    rear: { lamp: "bar", exhaust: "single", bar: true },
    body: { belt: 0.66, roofTaper: 0.06, tumble: 0.08, hood: 0.28, ws: 1.25, rr: 0.85, roof: "flat", clearance: 0.12, pillars: "body", windowTrim: "black", crease: 0.7, cladding: 0, spoiler: true, kick: true },
    wheels: { rim: 18, style: "twin", spokes: 5 },
    notes: "Low wide hatch: big dark mesh grille with a shield lion badge, slim lamps with vertical fang blades and a lower corner vent, tapering roofline, twin-spoke diamond-cut wheels, three-claw tail lamps on a bar.",
    source: "peu-308,commons",
  },
  // 2008 II (2019-): the 208 face on a crossover; black roof and rails on the car seen.
  car_peugeot_2008: {
    face: { grille: "mesh", grilleW: 0.42, lamp: "slim", drl: "c", intake: "wide", sig: "fang" },
    rear: { lamp: "bar", exhaust: "single", bar: true },
    body: { belt: 0.68, roofTaper: 0.05, tumble: 0.1, hood: 0.26, ws: 1.15, rr: 0.7, roof: "flat", clearance: 0.2, pillars: "black", windowTrim: "black", crease: 0.65, cladding: 0.5, rails: true, spoiler: true, top: "contrast", accent: "#161616", kick: true, skid: "silver" },
    wheels: { rim: 17, tyre: "215/55", style: "twin", spokes: 5 },
    notes: "Small crossover: black roof with rails, heavy black arch cladding and sill trim, black honeycomb grille with fang DRL blades, silver skids, chrome exhaust tip, dark bar over claw tail lamps.",
    source: "peu-2008,commons",
  },
  // 3008 II (2016-2020 face seen): SUV with a coupe-like cabin; chrome-edged grille and window surround.
  car_peugeot_3008: {
    face: { grille: "mesh", grilleW: 0.44, grilleChrome: true, lamp: "slim", drl: "c", intake: "wide", sig: "fang" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { belt: 0.69, roofTaper: 0.06, tumble: 0.09, hood: 0.28, ws: 1.2, rr: 0.65, roof: "flat", clearance: 0.19, pillars: "black", windowTrim: "chrome", crease: 0.7, cladding: 0.4, rails: true, spoiler: true, top: "body", kick: true, skid: "silver" },
    wheels: { rim: 18, tyre: "225/55", style: "twin", spokes: 5 },
    notes: "SUV with a tall shoulder and shallow glasshouse: hexagonal chrome-edged mesh grille, fang LEDs, chrome window surround and silver roof rails, black sills with chrome inserts, claw tail lamps on a dark bar.",
    source: "peu-3008,commons",
  },
  // 5008 II (2017-): the seven-seat 3008, boxier with a long upright roof.
  car_peugeot_5008: {
    face: { grille: "mesh", grilleW: 0.44, grilleChrome: true, lamp: "slim", drl: "c", intake: "wide", fog: true, sig: "fang" },
    rear: { lamp: "bar", exhaust: "twin", bar: true },
    body: { belt: 0.68, roofTaper: 0.02, tumble: 0.09, hood: 0.26, ws: 1.15, rr: 0.4, roof: "flat", clearance: 0.19, pillars: "black", windowTrim: "chrome", crease: 0.6, cladding: 0.4, rails: true, spoiler: true, top: "body", kick: false, skid: "silver" },
    wheels: { rim: 18, tyre: "225/55", style: "twin", spokes: 5 },
    notes: "Seven-seat SUV: chrome-edged hexagonal mesh grille and fang LEDs on a longer boxier body, chrome window surround, silver roof rails, three side windows, near-upright tail with claw lamps.",
    source: "peu-5008,commons",
  },

  // ---- Citroen ----
  // Ami (2020-): electric quadricycle; front and rear panels are practically identical and the two doors hinge opposite ways.
  car_citroen_ami: {
    face: { grille: "closed", grilleW: 0.3, grilleChrome: false, lamp: "round", drl: "none", intake: "none", sig: "symmetrical-cube" },
    rear: { lamp: "block", exhaust: "hidden", bar: false },
    body: { belt: 0.62, roofTaper: 0, tumble: 0.05, hood: 0.12, ws: 1.2, rr: 1.0, roof: "flat", clearance: 0.12, pillars: "black", windowTrim: "black", crease: 0.1, cladding: 0.1, spoiler: false, kick: false, top: "contrast", accent: "#4d5359", mirror: "black", skid: "none" },
    wheels: { rim: 14, tyre: "155/65", style: "steel", spokes: 5 },
    notes: "Cube microcar: pressed flat panels, tiny round lamp at each low front corner, dark roof, raked glass with black frames, no bonnet to speak of, small black steel wheels.",
    source: "cit-ami,commons",
  },
  // C3 III (2016-2023): Airbump pods and a contrast roof.
  car_citroen_c3: {
    face: { grille: "bar", grilleW: 0.36, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, sig: "split-lamps-chevron-wings" },
    rear: { lamp: "block", exhaust: "hidden", bar: false },
    body: { belt: 0.66, roofTaper: 0.03, tumble: 0.11, hood: 0.24, ws: 1.2, rr: 0.6, roof: "flat", clearance: 0.15, windowTrim: "black", crease: 0.35, cladding: 0.45, spoiler: true, top: "contrast", accent: "#1f1f1f", kick: false },
    wheels: { rim: 16, tyre: "195/55", style: "twin", spokes: 5 },
    notes: "Rounded supermini: chrome chevron wings run into a thin high DRL, main lamp low in the bumper, black Airbump pods on the doors, contrast roof, boxy round-cornered tail lamps, black lower rear bumper.",
    source: "cit-c3,commons",
  },
  // C4 III (2020-): a raised fastback hatch; E-C4 shares the body.
  car_citroen_c4: {
    face: { grille: "bar", grilleW: 0.4, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", sig: "split-lamps-chevron-wings" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.7, roofTaper: 0.08, tumble: 0.09, hood: 0.26, ws: 1.15, rr: 1.1, roof: "fastback", clearance: 0.17, windowTrim: "black", crease: 0.5, cladding: 0.4, spoiler: true, kick: true },
    wheels: { rim: 18, style: "ten", spokes: 10 },
    notes: "High-riding fastback: sloping roof into a big black roof spoiler over a slit rear window, slim lamp strips, black arch and door-lower cladding, chevron wings over a low lamp, chrome exhaust tip.",
    source: "cit-c4,commons",
  },
  // C5 Aircross (2018-): comfort SUV with Airbump panels and a tall front.
  car_citroen_c5_aircross: {
    face: { grille: "bar", grilleW: 0.4, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, sig: "split-lamps-chevron-wings" },
    rear: { lamp: "block", exhaust: "hidden", bar: false },
    body: { belt: 0.69, roofTaper: 0.03, tumble: 0.09, hood: 0.26, ws: 1.15, rr: 0.7, roof: "flat", clearance: 0.23, windowTrim: "black", crease: 0.45, cladding: 0.55, rails: true, spoiler: true, kick: false, skid: "silver" },
    wheels: { rim: 18, style: "twin", spokes: 5 },
    notes: "Tall comfort SUV: chrome chevron wings over a thin DRL and low lamp, round lower fog surrounds, black Airbump door panels, heavy black arch cladding, black roof rails, broad squared rear.",
    source: "cit-c5x,commons",
  },
  // Berlingo III (2018-): tall leisure van with a short nose.
  car_citroen_berlingo: {
    face: { grille: "bar", grilleW: 0.38, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", fog: true, sig: "split-lamps-chevron-wings" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.64, roofTaper: 0, tumble: 0.06, hood: 0.18, ws: 1.35, rr: 0.15, roof: "flat", clearance: 0.17, windowTrim: "black", crease: 0.35, cladding: 0.4, rails: false, spoiler: false, kick: false, slide: false },
    wheels: { rim: 16, style: "ten", spokes: 10 },
    notes: "Tall leisure van: short bonnet, chevron wings over a thin DRL with the main lamp low, white-ringed fog pods, black Airbump strips on the doors, full-height tailgate with slim vertical lamps, full black rear bumper.",
    source: "cit-berlingo,commons",
  },

  // ---- Opel ----
  // Corsa F (2019-): shared platform with the 208; wide black grille panel with a chrome bar between slim lamps.
  car_opel_corsa: {
    face: { grille: "bar", grilleW: 0.5, lamp: "slim", drl: "strip", intake: "wide", sig: "vizor-black-panel" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.66, roofTaper: 0.04, tumble: 0.1, hood: 0.26, ws: 1.2, rr: 0.7, roof: "flat", clearance: 0.13, windowTrim: "black", crease: 0.5, cladding: 0.05, spoiler: true, kick: false },
    wheels: { rim: 16, tyre: "205/45", style: "ten", spokes: 10 },
    notes: "Low supermini: wide black mesh grille with a chrome bar through the badge between slim lamps, black corner vents, tall rising beltline, black window frames, roof edge spoiler.",
    source: "opel-corsa,commons",
  },
  // Astra K (2015-2021): pre-Vizor face with the chrome wing over a black mesh grille.
  car_opel_astra: {
    face: { grille: "bar", grilleW: 0.4, grilleChrome: true, lamp: "angular", drl: "strip", intake: "wide", fog: true, sig: "chrome-wing" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.68, roofTaper: 0.08, tumble: 0.1, hood: 0.27, ws: 1.2, rr: 0.8, roof: "flat", clearance: 0.13, pillars: "body", windowTrim: "chrome", crease: 0.6, cladding: 0, spoiler: true, kick: true },
    wheels: { rim: 17, tyre: "225/45", style: "twin", spokes: 5 },
    notes: "Compact hatch: chrome wing across the nose over a black mesh grille, swept lamps with fogs in the bumper, chrome window surround, kinked beltline, roof spoiler, wrap tail lamps and a chrome exhaust tip.",
    source: "opel-astra,commons",
  },
  // Mokka B (2020-): first Vizor car; black bonnet and roof on the one seen.
  car_opel_mokka: {
    face: { grille: "bar", grilleW: 0.5, lamp: "slim", drl: "strip", intake: "split", sig: "vizor-black-panel" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.69, roofTaper: 0.06, tumble: 0.09, hood: 0.25, ws: 1.15, rr: 0.8, roof: "flat", clearance: 0.18, windowTrim: "black", crease: 0.65, cladding: 0.45, rails: false, spoiler: true, top: "contrast", accent: "#161616", kick: false, skid: "silver" },
    wheels: { rim: 18, tyre: "215/50", style: "twin", spokes: 5 },
    notes: "Short crossover: black Vizor panel with the badge across slim lamps, black mesh intake with silver skid and vertical corner vents, black arch and sill cladding, optional black roof and bonnet.",
    source: "opel-mokka,commons",
  },

  // ---- Fiat ----
  // 500 (2007-, 2015 facelift seen): retro round lamps with chrome rings, chrome bar under the badge, black mesh intake.
  car_fiat_500: {
    face: { grille: "bar", grilleW: 0.3, grilleChrome: true, lamp: "round", drl: "none", intake: "wide", fog: false, sig: "round-lamps-chrome-bars" },
    rear: { lamp: "vertical", exhaust: "single", bar: false },
    body: { belt: 0.68, roofTaper: 0.02, tumble: 0.13, hood: 0.18, ws: 1.2, rr: 0.55, roof: "flat", clearance: 0.12, windowTrim: "chrome", crease: 0.4, cladding: 0, spoiler: false, kick: false },
    wheels: { rim: 15, tyre: "185/55", style: "ten", spokes: 10 },
    notes: "Retro city car: dome-like round cabin, big round lamps with chrome rings and a small round lamp below, two chrome bars either side of the badge, black mesh mouth, thin chrome window frames, multi-spoke alloys.",
    source: "fiat-500,commons",
  },
  // 500e (2020-): new platform, longer and wider than the 500; looks the same from afar but with a mesh mouth under a thin chrome bar.
  car_fiat_500e: {
    face: { grille: "closed", grilleW: 0.3, grilleChrome: true, lamp: "round", drl: "strip", intake: "wide", fog: true, sig: "round-lamps-led-ring" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.68, roofTaper: 0.02, tumble: 0.12, hood: 0.18, ws: 1.2, rr: 0.55, roof: "flat", clearance: 0.13, windowTrim: "black", crease: 0.4, cladding: 0, spoiler: false, kick: false },
    wheels: { rim: 17, tyre: "205/45", style: "turbine", spokes: 8 },
    notes: "Electric 500: round lamps with an LED ring and a small round lamp below, thin chrome bar with the badge lettering, honeycomb lower mouth, smooth flat tailgate with two slim vertical tail lamps at the corners.",
    source: "fiat-500e,commons",
  },
  // Panda III (2011-, hybrid since 2020): squircle forms everywhere.
  car_fiat_panda: {
    face: { grille: "bar", grilleW: 0.36, grilleChrome: false, lamp: "round", drl: "none", intake: "wide", fog: true, sig: "squircle" },
    rear: { lamp: "vertical", exhaust: "single", bar: false },
    body: { belt: 0.7, roofTaper: 0, tumble: 0.12, hood: 0.18, ws: 1.35, rr: 0.4, roof: "flat", clearance: 0.16, windowTrim: "black", crease: 0.3, cladding: 0.25, rails: true, spoiler: false, kick: false },
    wheels: { rim: 15, tyre: "185/55", style: "five", spokes: 5 },
    notes: "Squircle city box: tall and short, rounded-square lamps, thin black bar with the badge above a black bumper with a squircle fog lamp, black side strips, roof rails, tall vertical tail lamps.",
    source: "fiat-panda,commons",
  },
  // Tipo (2015-, hatch pre-facelift seen): black mesh grille, swept lamps, fogs in the bumper.
  car_fiat_tipo: {
    face: { grille: "mesh", grilleW: 0.4, grilleChrome: false, lamp: "angular", drl: "none", intake: "wide", fog: true, sig: "mesh-grille-badge" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.66, roofTaper: 0.05, tumble: 0.08, hood: 0.28, ws: 1.25, rr: 0.8, roof: "flat", clearance: 0.13, windowTrim: "chrome", crease: 0.35, cladding: 0, spoiler: true, kick: false },
    wheels: { rim: 16, tyre: "205/55", style: "twin", spokes: 5 },
    notes: "Value compact hatch: black honeycomb grille with the badge, swept lamps, round fogs in the bumper, soft flanks with a gentle shoulder, short horizontal tail lamps wrapping into the sides, small roof spoiler.",
    source: "fiat-tipo,commons",
  },
  // Ducato (2014-): high-roof long wheelbase panel van.
  car_fiat_ducato: {
    face: { grille: "mesh", grilleW: 0.44, grilleChrome: false, lamp: "angular", drl: "none", intake: "wide", fog: true, sig: "wide-black-grille" },
    rear: { lamp: "vertical", exhaust: "hidden", bar: false },
    body: { belt: 0.6, roofTaper: 0, tumble: 0.05, hood: 0.14, ws: 1.5, rr: 0.1, roof: "flat", clearance: 0.18, crease: 0.3, cladding: 0.3, slide: true, kick: false, mirror: "black", skid: "black" },
    wheels: { rim: 16, tyre: "225/75", style: "steel", spokes: 5 },
    notes: "Large panel van: cab-forward with a short bonnet, black honeycomb grille in a chunky black bumper, swept lamps, black mirrors, very tall box body with sliding side door, slim vertical tail lamps and barn doors.",
    source: "fiat-ducato,commons",
  },

  // ---- Alfa Romeo ----
  // Giulia (952, 2016-): long bonnet, short boot, scudetto.
  car_alfa_romeo_giulia: {
    face: { grille: "shield", grilleW: 0.3, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", sig: "scudetto-trilobo" },
    rear: { lamp: "wrap", exhaust: "twin", bar: false },
    body: { belt: 0.7, roofTaper: 0.05, tumble: 0.1, hood: 0.32, ws: 1.35, rr: 0.7, roof: "notchback", clearance: 0.12, windowTrim: "chrome", crease: 0.75, cladding: 0, spoiler: false, kick: true },
    wheels: { rim: 18, tyre: "225/45", style: "ten", spokes: 10 },
    notes: "Rear-drive saloon: long bonnet and cab-rearward profile, narrow scudetto between slim lamps, chrome window surround, strong shoulders, short boot lid, slim wrap tail lamps, two chrome tailpipes, multi-spoke alloys.",
    source: "alfa-giulia,commons",
  },
  // Stelvio (949, 2017-): the Giulia on stilts.
  car_alfa_romeo_stelvio: {
    face: { grille: "shield", grilleW: 0.3, grilleChrome: true, lamp: "slim", drl: "strip", intake: "wide", sig: "scudetto-trilobo" },
    rear: { lamp: "wrap", exhaust: "twin", bar: false },
    body: { belt: 0.7, roofTaper: 0.06, tumble: 0.09, hood: 0.3, ws: 1.25, rr: 0.7, roof: "flat", clearance: 0.2, windowTrim: "chrome", crease: 0.7, cladding: 0.15, rails: false, spoiler: true, kick: true, skid: "silver" },
    wheels: { rim: 19, tyre: "235/55", style: "five", spokes: 5 },
    notes: "Sporty midsize SUV: Giulia face with narrow scudetto between slim lamps, chrome sill and window line, no roof rails, sloping rear with small roof spoiler, silver underguard between two round tailpipes, slim wrap tail lamps.",
    source: "alfa-stelvio,commons",
  },
};

// photos (Wikimedia Commons file titles viewed for the visual pass; image content is not copied into the repo):
// photos: car_renault_twingo: Renault Twingo III 1.0 SCe 71 (2018) (53048823622).jpg ; Renault Twingo III 1.0 SCe 71 (2018) (53047819065).jpg
// photos: car_renault_clio: 2019 Renault Clio Iconic Front.jpg ; Renault Clio V TCe 90 (2021) (52207757759).jpg
// photos: car_renault_megane: Renault MEGANE GT Line (ABA-BBH5F) front.jpg ; Renault Mégane (IV) – Heckansicht, 19. September 2015, Frankfurt.jpg
// photos: car_renault_megane_e_tech: Renault Megane E-Tech 1X7A6017.jpg ; Renault Megane E-Tech 1X7A6190.jpg
// photos: car_renault_captur: Renault Captur II Sindelfingen 2020 IMG 2300.jpg ; Renault Captur II (rear).jpg
// photos: car_renault_zoe: 2019 Renault ZOE Dynamique Front.jpg ; 2019 Renault ZOE Dynamique Rear.jpg
// photos: car_renault_trafic: Renault Trafic III dCi 120 (2019) (52180832802).jpg ; Renault trafic - Police Nationale.jpg
// photos: car_dacia_duster: Dacia Duster II Facelift IAA 2021 1X7A0132.jpg ; Dacia Duster II Facelift IAA 2021 1X7A0133.jpg
// photos: car_dacia_sandero: Dacia Sandero III (France) front view.jpg ; Dacia Sandero III (France) rear view.jpg
// photos: car_dacia_logan: 2021 Dacia Logan III (front angle view).jpg ; 2021 Dacia Logan III (rear angle view).jpg
// photos: car_dacia_spring: Dacia Spring IAA 2021 1X7A0215.jpg ; 2021 Dacia Spring Electric (France) rear view 02.png
// photos: car_peugeot_208: Peugeot 208 II GT Line rouge (avant).jpg ; Peugeot 208 II GT Line rouge (arrière).jpg
// photos: car_peugeot_e_208: 2020 Peugeot e-208 GT Front.jpg ; 2020 Peugeot e-208 GT Rear.jpg
// photos: car_peugeot_308: 2021 - Peugeot 308 III (C) - 03.jpg ; 2021 - Peugeot 308 III (C) - 02.jpg
// photos: car_peugeot_2008: Peugeot 2008 II 001.jpg ; Peugeot 2008 II 002.jpg
// photos: car_peugeot_3008: Peugeot 3008 BlueHDi 180 EAT8 GT (II) – Frontansicht, 25. November 2018, Düsseldorf.jpg ; Peugeot 3008 BlueHDi 180 EAT8 GT (II) – Heckansicht, 25. November 2018, Düsseldorf.jpg
// photos: car_peugeot_5008: Peugeot 5008 II.jpg ; Peugeot 5008 2020.jpg
// photos: car_citroen_ami: Citroën Ami, París, Francia, 2022-10-30, DD 03.jpg
// photos: car_citroen_c3: Citroën C3 BlueHDi 100 Shine (III) – Frontansicht, 24. Juni 2017, Düsseldorf.jpg ; Citroën C3 BlueHDi 100 Shine (III) – Heckansicht, 24. Juni 2017, Düsseldorf.jpg
// photos: car_citroen_c4: Citroën C4 BlueHDi 130 EAT8 Shine (III) – f 02012021.jpg ; Citroën C4 BlueHDi 130 EAT8 Shine (III) – h 02012021.jpg
// photos: car_citroen_c5_aircross: Citroen C5 Aircross Plug-in-Hybrid IMG 5338.jpg ; CITROEN C5 AIRCROSS China (2).jpg
// photos: car_citroen_berlingo: 2019 Citroen Berlingo Feel Puretech 1.2 Front.jpg ; 2019 Citroen Berlingo Feel Puretech 1.2 Rear.jpg
// photos: car_opel_corsa: 2020 Opel Corsa F.jpg ; Opel Corsa F Sindelfingen 2020 IMG 2464.jpg
// photos: car_opel_astra: Opel Astra 1.4 EDIT Edition (K) – Frontansicht, 31. Juli 2016, Düsseldorf.jpg ; Opel Astra K 2016 model year 2017 rear three quarters.jpg
// photos: car_opel_mokka: Opel Mokka B Auto Zuerich 2021 IMG 0480.jpg ; Opel mokka 2021.jpg
// photos: car_fiat_500: 2017 Fiat 500 Lounge front.jpg ; Fiat 500 (2007)-yellow-front view.jpg
// photos: car_fiat_500e: Fiat 500e (front).jpg ; Fiat 500e (rear).jpg
// photos: car_fiat_panda: The frontview of FIAT panda III.JPG ; The rearview of FIAT panda III.JPG
// photos: car_fiat_tipo: 2016 Fiat Tipo Easy+ T-Jet 1.4 Front.jpg ; 2016 Fiat Tipo Easy+ T-Jet 1.4 Rear.jpg
// photos: car_fiat_ducato: Fiat Ducato Kastenwagen 130 Multijet (III, Facelift) – Frontansicht, 13. Juli 2014, Düsseldorf.jpg ; Fiat Ducato IMG 6216.jpg
// photos: car_alfa_romeo_giulia: 2016 Alfa Romeo Giulia R.jpg (rear three quarters); front scudetto from model knowledge
// photos: car_alfa_romeo_stelvio: Alfa Romeo Stelvio - lewy przód (MSP17).jpg ; Alfa Romeo Stelvio - lewy tył (MSP17).jpg
