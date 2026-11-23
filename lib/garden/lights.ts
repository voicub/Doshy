import type { Def, Part } from "../catalog";
import { HANG_LIGHTS } from "./lights.hang.ts";
import { GROUND_LIGHTS } from "./lights.ground.ts";
import { BULB_OFF, PI, TRUNK, b, cy, gd, led, lit, range, rod, shellPoints, vegPart, WARM } from "./kit.ts";

// Lit plants and LED strips. Every glow part follows the linked HA light/switch (on/off, brightness, colour); `light` is the soft pool it casts.
// Lights must sit at or below 1.78 m: higher ones count as ceiling fixtures in components/scene/pointShadow.ts and would take the shadow
// slots of the indoor lamps. Each item adds a real point light to the scene, so decorative pieces use a small `k`.
const RGB_OFF = ["#ff6b8a", "#6bd0ff", "#8aff9a", "#ffd36b", "#c58aff"];
const RGB_DEFAULT = "#9be8ff";

/** A real procedural shrub covered with a net of tiny bulbs: `n` glow points over the upper shell of the leaf blob. */
const bushLed = (size: string, w: number, h: number, n: number, rgb: boolean): Def => {
  const pts = shellPoints(0, h * 0.5, 0, w * 0.45, h * 0.48, w * 0.45, n, -0.45);
  const bulbs: Part[] = pts.map(([x, y, z], i) => led(x, y, z, w > 1 ? 0.04 : 0.032, rgb ? RGB_OFF[i % RGB_OFF.length] : BULB_OFF, 1));
  return gd(`LED bush light, ${rgb ? "colour-changing" : "warm white"} ${size}`, w, w, h, [vegPart("shrub", w, h, w, rgb ? 2 : 1), ...bulbs], {
    ...lit(h * 0.55, rgb ? RGB_DEFAULT : WARM, 0.5),
    tags: "fairy lights shrub net lit bush rgb led twinkle garden light",
  });
};

/** A tree trunk wound with a spiral of bulbs: `core` is a thin pole that hides inside the real trunk when the wrap is placed on a tree. */
const trunkWrap = (): Def => {
  const n = 64, H = 3.0;
  return gd("LED tree wrap 3 m", 0.5, 0.5, H, [
    cy(0, H / 2, 0, 0.16, H, TRUNK),
    ...range(n).map((i) => led(0.2 * Math.cos(i * 1.15), 0.12 + (i / n) * (H - 0.24), 0.2 * Math.sin(i * 1.15), 0.035, BULB_OFF, 1)),
  ], { ...lit(1.4, WARM, 0.5), tags: "fairy lights trunk lit tree uplight wrap led palm" });
};

/** A bare lit tree: trunk, five branches wound with bulbs. */
const treeLit = (): Def => {
  const H = 3.4, branches = range(5).map((i) => {
    const a = (i / 5) * PI * 2 + 0.4, reach = 1.1 + 0.15 * (i % 2), top = 2.35 + 0.22 * (i % 3);
    return { a, end: [Math.cos(a) * reach, top + 0.45, Math.sin(a) * reach] as [number, number, number], start: [0, top - 0.5, 0] as [number, number, number] };
  });
  const parts: Part[] = [cy(0, 1.1, 0, 0.3, 2.2, TRUNK), cy(0, 2.35, 0, 0.2, 0.5, TRUNK)];
  for (const { start, end } of branches) {
    parts.push(rod(start, end, 0.07, TRUNK));
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      parts.push(led(start[0] + (end[0] - start[0]) * t + 0.05, start[1] + (end[1] - start[1]) * t + 0.05, start[2] + (end[2] - start[2]) * t, 0.04, BULB_OFF, 1));
    }
  }
  return gd("Lit tree with fairy lights 3.4 m", 3.0, 3.0, H, parts, { ...lit(1.7, WARM, 0.6), tags: "fairy lights branches winter tree led glow" });
};

/** A clipped hedge with a string of bulbs along its top and front. */
const hedgeLed = (len: number): Def => {
  const h = 0.9, d = 0.6, hedge = len >= 2 ? "hedge_long" : "hedge";
  const top = range(Math.round(len * 8)).map((i) => led(-len / 2 + 0.08 + (i / (Math.round(len * 8) - 1)) * (len - 0.16), h - 0.02, i % 2 ? 0.17 : -0.12, 0.035, BULB_OFF, 1));
  const front = range(Math.round(len * 6)).map((i) => led(-len / 2 + 0.1 + (i / (Math.round(len * 6) - 1)) * (len - 0.2), 0.3 + 0.38 * ((i * 5) % 3) / 2, d / 2 - 0.03, 0.035, BULB_OFF, 1));
  return gd(`LED hedge lights ${len} m`, len, d, h, [vegPart(hedge, len, h, d, 0), ...top, ...front], { ...lit(0.6, WARM, 0.45), tags: "hedge fairy lights strip led boundary" });
};

/** Flexible rope light lying along a fence, deck edge or kerb. */
const rope = (len: number): Def =>
  gd(`LED rope light ${len} m`, len, 0.06, 0.04, [
    b(0, 0.02, 0, len, 0.02, 0.02, "#e9ecee", { glow: true }),
    ...range(Math.round(len * 2) + 1).map((i) => b(-len / 2 + 0.02 + (i / Math.round(len * 2)) * (len - 0.04), 0.015, 0, 0.03, 0.03, 0.05, "#3a3d42")),
  ], { ...lit(0.03, WARM, 0.25), tags: "led rope tube light fence deck edge kerb outline" });

/** Slim aluminium channel with an LED strip, for steps, kerbs, pergola beams and seating edges. */
const strip = (len: number): Def =>
  gd(`LED strip for steps and beams ${len} m`, len, 0.04, 0.03, [
    b(0, 0.012, 0, len, 0.024, 0.03, "#b8bcc2"),
    b(0, 0.026, 0.004, len - 0.04, 0.008, 0.018, "#fff1c8", { glow: true }),
  ], { ...lit(0.03, WARM, 0.25), tags: "led strip aluminium step stair kerb pergola beam linear light" });

export const LIGHTS: Record<string, Def> = {
  gd_bush_led_s: bushLed("0.6 m", 0.6, 0.55, 24, false),
  gd_bush_led_m: bushLed("0.9 m", 0.9, 0.8, 38, false),
  gd_bush_led_l: bushLed("1.4 m", 1.4, 1.2, 58, false),
  gd_bush_rgb_s: bushLed("0.6 m", 0.6, 0.55, 24, true),
  gd_bush_rgb_m: bushLed("0.9 m", 0.9, 0.8, 38, true),
  gd_bush_rgb_l: bushLed("1.4 m", 1.4, 1.2, 58, true),
  gd_tree_wrap: trunkWrap(),
  gd_tree_lit: treeLit(),
  gd_hedge_led_15: hedgeLed(1.5),
  gd_hedge_led_3: hedgeLed(3),
  gd_led_rope_2: rope(2),
  gd_led_rope_5: rope(5),
  gd_led_strip_1: strip(1),
  gd_led_strip_3: strip(3),
  ...GROUND_LIGHTS,
  ...HANG_LIGHTS,
};
