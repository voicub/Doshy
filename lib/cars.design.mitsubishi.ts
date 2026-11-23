import type { DesignRow } from "./cars.design.ts";

// Mitsubishi: "Dynamic Shield" face (since 2015): a dark grille framed by two chrome clasps that run down either side of the grille into the
// bumper and shield the three-diamond badge, fog / daytime lamps low in the bumper corners, silver skid plate under the bumper.
//
// sources:
// mits-asx16 = https://commons.wikimedia.org (photos of the 2016 UK ASX before the facelift: "2016 Mitsubishi ASX ZC-M 1.6 facelift Front.jpg" and "... Rear.jpg"), https://www.carsguide.com.au/mitsubishi/asx/car-dimensions/2016 (dimensions), https://en.wikipedia.org/wiki/Mitsubishi_ASX (facelift history: 2015 LED lamps in the bumper, 18" wheels, black arch surrounds)
// mits-asx17 = https://www.autozine.co.uk/mitsubishi/asx-2010-2021/news/revised-mitsubishi-asx-arrives-in-the-uk , https://autogazette.de/fahrberichte/mitsubishi/asx/mitsubishi-asx-aufgehuebscht-in-neuen-lebensabschnitt-581458.html , https://www.drivencarguide.co.nz/reviews/mitsubishi-asx-another-asx-birthday-face , https://media.mitsubishicars.com/en-US/releases/release-08d469b1203d410da7bf6582343a287b-dynamic-design-enhances-mitsubishi-motors-sales-leader-mitsubishi-outlander-sport-updated-for-2016 ; photos: "Mitsubishi ASX 1.6 DI-D (2017) (52102333370).jpg", "2017 Mitsubishi RVR SE in Titanium Grey, front right, 2024-11-21.jpg", "Mitsubishi RVR -- Rear.jpg"
// mits-ds = https://www.autozine.co.uk/mitsubishi/asx-2010-2021/news/revised-mitsubishi-asx-arrives-in-the-uk (Dynamic Shield description)
// mits-outl = https://en.wikipedia.org/wiki/Mitsubishi_Outlander ; mits-ecx = https://en.wikipedia.org/wiki/Mitsubishi_Eclipse_Cross + photo "2018 Mitsubishi Eclipse Cross rear 4.2.18.jpg"
// mits-ss = https://en.wikipedia.org/wiki/Mitsubishi_Mirage + photo "Mitsubishi Space Star 1.2 CVT (2020) (52198103408).jpg" ; mits-l200 = https://en.wikipedia.org/wiki/Mitsubishi_Triton

export const BRANDS: Record<string, DesignRow> = {
  Mitsubishi: {
    face: { grille: "shield", grilleW: 0.44, grilleChrome: true, lamp: "angular", drl: "none", intake: "wide", fog: true, bars: 3, id: "mitsubishi-dynamic-shield", sig: "chrome-clasps" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { skid: "silver", mirror: "body" },
    wheels: { rim: 18, style: "twin", spokes: 5 },
    source: "mits-ds",
  },
};

export const ROWS: Record<string, DesignRow> = {
  // The owner's car: 2016 ASX with the OLDER face (before Dynamic Shield; 4.295 m body). Photos of the real car show: chrome-framed trapezoid grille with an
  // upper louvre and a lower mesh, wedge headlamps with amber indicator, fog lamp pod with chrome strip (LED daytime lamp in the bumper), black sills, wide tail lamps.
  car_mitsubishi_asx_2016: {
    face: { grille: "shield", grilleW: 0.44, grilleChrome: true, lamp: "angular", drl: "none", intake: "wide", fog: true, bars: 2, id: "mitsubishi-2013", sig: "chrome-framed-trapezoid-led-drl-in-bumper" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: {
      belt: 0.66, roofTaper: 0.03, tumble: 0.1, hood: 0.25, ws: 1.2, rr: 0.5, roof: "flat", clearance: 0.19, pillars: "body", windowTrim: "black",
      crease: 0.5, cladding: 0.5, rails: true, spoiler: true, top: "body", kick: true, mirror: "body", skid: "black",
    },
    wheels: { rim: 18, tyre: "225/55", style: "twin", spokes: 5 },
    notes: "Small crossover: short snub bonnet, upright steep tailgate with roof spoiler, chrome-framed trapezoid grille, black sill and arch cladding, black rails, wide horizontal tail lamps wrapping the quarter, one round exhaust tip.",
    source: "mits-asx16",
  },
  // Dynamic Shield facelift (US/CA/JP model year 2016, Europe from autumn 2016): longer front bumper, 4.365 m.
  car_mitsubishi_asx_2017_dynamic_shield: {
    face: { grille: "shield", grilleW: 0.44, grilleChrome: true, lamp: "angular", drl: "none", intake: "wide", fog: true, bars: 3, id: "mitsubishi-dynamic-shield", sig: "chrome-clasps-led-drl-in-bumper" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: {
      belt: 0.66, roofTaper: 0.03, tumble: 0.1, hood: 0.25, ws: 1.2, rr: 0.5, roof: "flat", clearance: 0.19, pillars: "body", windowTrim: "chrome",
      crease: 0.5, cladding: 0.5, rails: true, spoiler: true, top: "body", kick: true, mirror: "body", skid: "silver",
    },
    wheels: { rim: 18, tyre: "225/55", style: "twin", spokes: 5 },
    notes: "Same crossover with the Dynamic Shield nose: black louvred grille between two chrome clasps, silver skid plate, shark-fin aerial, wide wrap-around tail lamps.",
    source: "mits-asx17",
  },
  car_mitsubishi_outlander: {
    face: { drl: "strip", sig: "chrome-clasps-led-drl" },
    rear: { lamp: "vertical", exhaust: "hidden" },
    body: { belt: 0.66, hood: 0.27, ws: 1.15, rr: 0.4, roof: "flat", clearance: 0.19, windowTrim: "chrome", crease: 0.5, cladding: 0.45, rails: true, spoiler: true, kick: true },
    wheels: { rim: 18, tyre: "225/55", style: "twin", spokes: 5 },
    notes: "Mid SUV with the Dynamic Shield face at full size: tall bonnet, chrome-clasped black grille, roof rails, rear lamps wrapping into the quarter.",
    source: "mits-outl",
  },
  car_mitsubishi_eclipse_cross: {
    face: { drl: "strip", sig: "chrome-clasps-led-drl" },
    rear: { lamp: "wrap", exhaust: "single", bar: false },
    body: { belt: 0.68, roofTaper: 0.06, hood: 0.25, ws: 1.2, rr: 1.0, roof: "fastback", clearance: 0.19, windowTrim: "chrome", crease: 0.7, cladding: 0.45, rails: false, spoiler: true, kick: true, skid: "silver" },
    wheels: { rim: 18, tyre: "225/55", style: "ten", spokes: 10 },
    notes: "Coupe-crossover: sloping roofline, a hatch spoiler that splits the rear window in two, beltline kicking up sharply to the rear, slim wrap-around tail lamps.",
    source: "mits-ecx",
  },
  car_mitsubishi_space_star: {
    face: { grilleW: 0.4, grilleChrome: true, lamp: "angular", drl: "strip", fog: true, bars: 2 },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.64, hood: 0.24, ws: 1.35, rr: 0.7, roof: "flat", clearance: 0.16, crease: 0.3, cladding: 0.15, rails: false, spoiler: true, kick: false },
    wheels: { rim: 15, tyre: "175/55", style: "five", spokes: 5 },
    notes: "Tiny supermini: short and tall, chrome-clasped shield grille, small roof spoiler, rounded rear with tall lamps.",
    source: "mits-ss",
  },
  car_mitsubishi_l200: {
    face: { grilleW: 0.5, bars: 3, drl: "strip", sig: "chrome-clasps-led-drl" },
    rear: { lamp: "vertical", exhaust: "single" },
    body: { belt: 0.62, hood: 0.27, ws: 1.0, roof: "flat", clearance: 0.22, windowTrim: "chrome", crease: 0.6, cladding: 0.3, rails: false, cab: "double", bed: "open", skid: "silver" },
    wheels: { rim: 17, tyre: "265/65", style: "ten", spokes: 10 },
    notes: "Double-cab pickup: wide chrome-clasped shield grille, strong shoulder line running into the load bed, open box with tall sides.",
    source: "mits-l200",
  },
};
