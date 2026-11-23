import type { Def, Part } from "./catalog";
import { withMaterials } from "./partsKit.ts";

// Cameras, video doorbell, alarm panel and keypad. Sensors, locks and sirens live in catalog.sensors.ts.
// Wall pieces have their back on -z (the wall) and look out along +z; a camera's field of view follows that direction. Glow parts light with the linked
// entity (lib/securityLook.ts colours them: a camera's red recording dot, the panel's armed / disarmed light).
type Opt = { m?: true; glow?: true; r?: [number, number, number]; shape?: Part["shape"]; spin?: Part["spin"] };
const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, o?: Opt): Part => ({
  p: [x, y, z],
  s: [sx, sy, sz],
  c,
  ...o,
});
const cy = (x: number, y: number, z: number, dia: number, h: number, c: string, o?: Opt) => b(x, y, z, dia, h, dia, c, { ...o, shape: "cyl" });
const sp = (x: number, y: number, z: number, dia: number, c: string, o?: Opt) => b(x, y, z, dia, dia, dia, c, { ...o, shape: "sph" });

const HALF_PI = Math.PI / 2;
const WHITE = "#eceeef";
const LIGHT = "#d3d6d9";
const BLACK = "#16181b";
const GLASS = "#26334f";
const DARK = "#2b2e33";
const KEY = "#d8dbde";
const LED = "#ff3b30";

/** 3 x 4 key pad of small square keys, centred at (0, y) on a front face at z. */
const keys = (y: number, z: number, pitch: number, size: number): Part[] =>
  [0, 1, 2, 3].flatMap((row) => [-1, 0, 1].map((col) => b(col * pitch, y - row * pitch * 0.78, z, size, size * 0.65, 0.003, KEY)));

export const SECURITY: Record<string, Def> = {
  sec_cam_bullet: {
    label: "Bullet security camera", brand: "Generic", cat: "Security", w: 0.08, d: 0.24, h: 0.14, wall: true,
    parts: [
      b(0, 0.07, -0.114, 0.07, 0.1, 0.012, LIGHT), // wall plate
      b(0, 0.062, -0.085, 0.024, 0.04, 0.05, LIGHT), // arm
      cy(0, 0.075, 0.02, 0.065, 0.19, WHITE, { m: true, r: [HALF_PI, 0, 0] }), // body
      b(0, 0.11, 0.035, 0.076, 0.005, 0.16, WHITE, { m: true }), // sun shield
      cy(0, 0.075, 0.116, 0.054, 0.006, BLACK, { r: [HALF_PI, 0, 0] }), // lens ring
      cy(0, 0.075, 0.12, 0.036, 0.002, GLASS, { r: [HALF_PI, 0, 0] }), // lens glass
      sp(0, 0.046, 0.09, 0.012, LED, { glow: true }), // recording dot
    ],
  },
  sec_cam_dome_ceiling: {
    label: "Dome security camera", brand: "Generic", cat: "Security", w: 0.13, d: 0.13, h: 0.09,
    parts: [
      cy(0, 0.085, 0, 0.13, 0.01, WHITE, { m: true }), // ceiling plate
      sp(0, 0.04, 0, 0.09, "#20242b"), // smoked dome
      sp(0.012, 0.036, 0.022, 0.03, BLACK), // lens
      sp(0, 0.078, 0.057, 0.011, LED, { glow: true }), // recording dot on the rim
    ],
  },
  sec_cam_indoor: {
    label: "Indoor Wi-Fi camera", brand: "Generic", cat: "Security", w: 0.08, d: 0.08, h: 0.11,
    parts: [
      cy(0, 0.006, 0, 0.08, 0.012, WHITE, { m: true }), // base
      cy(0, 0.026, -0.004, 0.03, 0.03, LIGHT), // neck
      sp(0, 0.072, 0, 0.075, WHITE, { m: true }), // head
      b(0, 0.074, 0.032, 0.052, 0.04, 0.006, BLACK), // face plate
      sp(0, 0.075, 0.037, 0.016, GLASS), // lens
      sp(0.02, 0.097, 0.026, 0.008, LED, { glow: true }), // recording dot
    ],
  },
  sec_doorbell_cam: {
    label: "Video doorbell", brand: "Generic", cat: "Security", w: 0.055, d: 0.03, h: 0.13, wall: true,
    parts: [
      b(0, 0.065, -0.002, 0.055, 0.13, 0.026, DARK, { m: true }),
      b(0, 0.065, 0.0125, 0.048, 0.12, 0.003, "#1c1e22"), // face
      cy(0, 0.105, 0.0145, 0.026, 0.004, BLACK, { r: [HALF_PI, 0, 0] }), // lens ring
      cy(0, 0.105, 0.0165, 0.016, 0.002, GLASS, { r: [HALF_PI, 0, 0] }), // lens glass
      b(0, 0.075, 0.0145, 0.03, 0.008, 0.002, "#3a3d42"), // motion window
      cy(0, 0.032, 0.0145, 0.026, 0.003, "#7fd1ff", { glow: true, r: [HALF_PI, 0, 0] }), // button ring
      cy(0, 0.032, 0.0155, 0.016, 0.003, "#e6e8ea", { r: [HALF_PI, 0, 0] }), // button
    ],
  },
  sec_alarm_panel: {
    label: "Alarm panel", brand: "Generic", cat: "Security", w: 0.16, d: 0.03, h: 0.2, wall: true,
    parts: [
      b(0, 0.1, 0, 0.16, 0.2, 0.03, WHITE, { m: true }),
      b(0, 0.14, 0.0155, 0.12, 0.07, 0.002, "#101418"), // screen
      b(0, 0.188, 0.0155, 0.1, 0.008, 0.002, "#7fe3a0", { glow: true }), // armed / disarmed light
      ...keys(0.095, 0.0155, 0.032, 0.026),
    ],
  },
  sec_keypad: {
    label: "Alarm keypad", brand: "Generic", cat: "Security", w: 0.08, d: 0.022, h: 0.12, wall: true,
    parts: [
      b(0, 0.06, 0, 0.08, 0.12, 0.022, DARK, { m: true }),
      b(0, 0.108, 0.0115, 0.05, 0.006, 0.002, "#7fe3a0", { glow: true }),
      ...keys(0.08, 0.0115, 0.024, 0.018),
    ],
  },
};
withMaterials(SECURITY);
