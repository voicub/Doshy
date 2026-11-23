import type { Def } from "../catalog";
import { BLACK, CORTEN, DARK, GREY, LGREY, STEEL, WARM, b, cy, el, gd, globe, led, lit, range, ring } from "./kit.ts";

// Spotlights, path lights, bollards, wall washers, deck and pond lights. See lib/garden/lights.ts for the lighting rules (light y <= 1.78).
const CYAN = "#5ad7ff";
const PIPE = "#2b2e33";

/** Spike-mounted spot: a stake and an aimed head whose glow face points up and forward. */
const spike = (label: string, headDia: number, headLen: number, stem: number, tags: string): Def => {
  const a = 0.85, y = stem + 0.04, dz = Math.sin(a) * headLen * 0.5, dy = Math.cos(a) * headLen * 0.5;
  return gd(label, Math.max(0.12, headDia + 0.04), headLen + 0.08, y + headLen * 0.5 + 0.06, [
    cy(0, stem / 2, 0, 0.025, stem, PIPE),
    cy(0, stem + 0.02, 0, 0.05, 0.04, PIPE),
    cy(0, y + dy * 0.5, dz * 0.5, headDia, headLen, DARK, { r: [a, 0, 0] }),
    cy(0, y + dy * 0.5 + Math.cos(a) * (headLen / 2 + 0.003), dz * 0.5 + Math.sin(a) * (headLen / 2 + 0.003), headDia * 0.82, 0.012, "#fff6d8", { glow: true, r: [a, 0, 0] }),
  ], { ...lit(y, WARM, 0.55), tags: `${tags} spotlight spike ground light garden uplight accent` });
};

const path = {
  mushroom: gd("Mushroom path light 0.45 m", 0.34, 0.34, 0.45, [
    cy(0, 0.01, 0, 0.1, 0.02, PIPE), cy(0, 0.17, 0, 0.05, 0.32, PIPE, { m: true }),
    cy(0, 0.33, 0, 0.18, 0.02, "#fff1c8", { glow: true }),
    el(0, 0.39, 0, 0.34, 0.1, 0.34, "#3a3d42", { m: true }), cy(0, 0.352, 0, 0.34, 0.03, "#3a3d42", { m: true }),
  ], { ...lit(0.33, WARM, 0.4), tags: "mushroom path light walkway lamp garden" }),
  pillar: gd("Pillar path light 0.6 m", 0.14, 0.14, 0.6, [
    b(0, 0.29, 0, 0.12, 0.58, 0.12, GREY, { m: true }), b(0, 0.595, 0, 0.14, 0.03, 0.14, DARK),
    ...[-1, 1].map((s) => b(0, 0.44, s * 0.061, 0.05, 0.2, 0.004, "#fff1c8", { glow: true })),
    ...[-1, 1].map((s) => b(s * 0.061, 0.44, 0, 0.004, 0.2, 0.05, "#fff1c8", { glow: true })),
  ], { ...lit(0.44, WARM, 0.45), tags: "pillar path light post square walkway" }),
  solar: gd("Solar stake light 0.45 m", 0.1, 0.1, 0.45, [
    cy(0, 0.09, 0, 0.015, 0.18, STEEL), cy(0, 0.23, 0, 0.035, 0.1, DARK), globe(0, 0.33, 0, 0.09, "#e9dcb4"),
    cy(0, 0.395, 0, 0.07, 0.012, "#223a5a"),
  ], { ...lit(0.33, WARM, 0.25), tags: "solar stake lamp path garden cheap" }),
  pagoda: gd("Tiered path light 0.6 m", 0.24, 0.24, 0.62, [
    cy(0, 0.03, 0, 0.14, 0.06, PIPE), cy(0, 0.3, 0, 0.04, 0.54, PIPE),
    ...[0.18, 0.34, 0.5].flatMap((y, i) => [cy(0, y, 0, 0.1, 0.07, "#fff1c8", { glow: true }), cy(0, y + 0.055, 0, 0.24 - i * 0.04, 0.02, DARK, { m: true })]),
    cy(0, 0.6, 0, 0.06, 0.03, DARK),
  ], { ...lit(0.34, WARM, 0.45), tags: "pagoda tiered path light walkway lamp stacked" }),
};

const bollard = {
  slit: gd("Square slot bollard light 0.6 m", 0.14, 0.14, 0.6, [
    b(0, 0.3, 0, 0.12, 0.6, 0.12, "#6e7379", { m: true }),
    ...[-1, 1].map((s) => b(0, 0.38, s * 0.061, 0.03, 0.36, 0.004, "#fff1c8", { glow: true })),
    b(0, 0.605, 0, 0.14, 0.012, 0.14, DARK),
  ], { ...lit(0.38, WARM, 0.55), tags: "bollard square slot led garden path driveway" }),
  slim: gd("Slim bollard with light ring 1.0 m", 0.12, 0.12, 1.0, [
    cy(0, 0.04, 0, 0.12, 0.02, PIPE), cy(0, 0.5, 0, 0.08, 1.0, "#6e7379", { m: true }),
    cy(0, 0.86, 0, 0.084, 0.06, "#fff1c8", { glow: true }), cy(0, 0.995, 0, 0.09, 0.01, DARK),
  ], { ...lit(0.86, WARM, 0.55), tags: "bollard slim tall light ring led garden driveway" }),
  dome: gd("Low dome bollard light 0.35 m", 0.22, 0.22, 0.35, [
    cy(0, 0.1, 0, 0.18, 0.2, "#6e7379", { m: true }), cy(0, 0.21, 0, 0.2, 0.02, DARK),
    el(0, 0.24, 0, 0.18, 0.2, 0.18, "#fff1c8", { glow: true }),
  ], { ...lit(0.26, WARM, 0.5), tags: "bollard dome globe low light garden path" }),
  corten: gd("Perforated steel bollard light 0.8 m", 0.16, 0.16, 0.8, [
    cy(0, 0.4, 0, 0.14, 0.8, CORTEN, { m: true }), cy(0, 0.79, 0, 0.15, 0.02, DARK), cy(0, 0.4, 0, 0.1, 0.7, "#fff1c8", { glow: true }),
    ...range(4).flatMap((lv) => ring(6, 0.071, (x, z) => led(x, 0.15 + lv * 0.15, z, 0.03, "#ffe9b0"), lv % 2 ? 0.52 : 0)),
  ], { ...lit(0.45, WARM, 0.55), tags: "bollard corten rust perforated steel garden light" }),
};

/** Wall-mounted up/down light; the wall is at -z. Mounted at 1.5 m so it stays a garden light, not a ceiling fixture. */
const washer = (label: string, square: boolean): Def => {
  const body = (y: number, dz = 0.01) => (square ? b(0, y, dz, 0.1, 0.18, 0.1, "#6e7379", { m: true }) : cy(0, y, dz, 0.09, 0.18, "#6e7379", { m: true }));
  return gd(label, 0.14, 0.14, 1.65, [
    b(0, 1.5, -0.062, 0.08, 0.14, 0.016, DARK), body(1.5, 0.0),
    ...[-1, 1].map((s) => (square ? b(0, 1.5 + s * 0.095, 0, 0.09, 0.012, 0.09, "#fff1c8", { glow: true }) : cy(0, 1.5 + s * 0.095, 0, 0.08, 0.012, "#fff1c8", { glow: true }))),
  ], { wall: true, ...lit(1.5, WARM, 0.5), tags: "wall washer up down light facade garden wall sconce" });
};

/** Small flush light for a step riser, wall or deck board. */
const stepLight = gd("Step and wall light", 0.14, 0.05, 0.1, [
  b(0, 0.05, 0, 0.12, 0.08, 0.04, "#6e7379", { m: true }), b(0, 0.05, 0.022, 0.09, 0.012, 0.004, "#fff1c8", { glow: true }),
], { ...lit(0.05, WARM, 0.25), tags: "step light stair riser brick light wall recessed" });
const deckLight = gd("Recessed deck light", 0.1, 0.1, 0.03, [
  cy(0, 0.01, 0, 0.1, 0.02, LGREY), cy(0, 0.024, 0, 0.065, 0.008, "#fff1c8", { glow: true }),
], { ...lit(0.03, WARM, 0.2), tags: "deck light recessed decking in-ground patio terrace" });
const inGround = gd("In-ground uplight 0.16 m", 0.16, 0.16, 0.03, [
  cy(0, 0.01, 0, 0.16, 0.02, STEEL), cy(0, 0.024, 0, 0.11, 0.008, "#fff6d8", { glow: true }),
], { ...lit(0.03, WARM, 0.45), tags: "recessed in ground uplight well light paving uplighter facade" });
const treeUp = gd("Tree uplighter 0.3 m", 0.2, 0.2, 0.3, [
  cy(0, 0.03, 0, 0.12, 0.06, PIPE), cy(0, 0.15, 0, 0.16, 0.2, DARK), cy(0, 0.255, 0, 0.14, 0.012, "#fff6d8", { glow: true }), cy(0, 0.28, 0, 0.16, 0.02, BLACK),
], { ...lit(0.28, WARM, 0.7), tags: "tree uplighter spot flood ground garden accent" });

const pond = {
  sub: gd("Underwater pond light", 0.12, 0.12, 0.08, [
    cy(0, 0.025, 0, 0.12, 0.05, DARK), cy(0, 0.058, 0, 0.1, 0.012, CYAN, { glow: true }), el(0, 0.055, 0, 0.09, 0.05, 0.09, "#bfeeff", { glow: true }),
  ], { ...lit(0.06, CYAN, 0.45), tags: "pond light underwater submersible water feature led" }),
  float: gd("Floating pond light ball 0.3 m", 0.4, 0.4, 0.3, [
    cy(0, 0.002, 0, 0.4, 0.004, "#2f8fbf"), globe(0, 0.14, 0, 0.28, "#dff7ff"), cy(0, 0.012, 0, 0.18, 0.02, DARK),
  ], { ...lit(0.14, CYAN, 0.5), tags: "pond floating light ball sphere pool water glow" }),
};

const orb = (dia: number): Def =>
  gd(`Glowing garden orb ${Math.round(dia * 100)} cm`, dia + 0.04, dia + 0.04, dia + 0.03, [
    cy(0, 0.015, 0, dia * 0.6, 0.03, DARK), globe(0, dia / 2 + 0.03, 0, dia, "#eef6ff"),
  ], { ...lit(dia / 2 + 0.03, "#9be8ff", 0.5), tags: "orb ball sphere globe glowing garden colour rgb led floating" });

export const GROUND_LIGHTS: Record<string, Def> = {
  gd_spot_spike: spike("Spike spotlight 0.3 m", 0.07, 0.12, 0.2, "spike"),
  gd_spot_spike_wide: spike("Large spike floodlight 0.5 m", 0.12, 0.2, 0.28, "wide flood"),
  gd_uplight_recessed: inGround,
  gd_uplight_tree: treeUp,
  gd_path_mushroom: path.mushroom,
  gd_path_pillar: path.pillar,
  gd_path_solar: path.solar,
  gd_path_tiered: path.pagoda,
  gd_bollard_slot: bollard.slit,
  gd_bollard_slim: bollard.slim,
  gd_bollard_dome: bollard.dome,
  gd_bollard_corten: bollard.corten,
  gd_wall_washer_round: washer("Wall up-down light, round", false),
  gd_wall_washer_square: washer("Wall up-down light, square", true),
  gd_step_light: stepLight,
  gd_deck_light: deckLight,
  gd_pond_light: pond.sub,
  gd_pond_float: pond.float,
  gd_orb_30: orb(0.3),
  gd_orb_50: orb(0.5),
};
