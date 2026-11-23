import type { Def } from "../catalog.ts";
import { BLACK, BRASS, DARKWOOD, OAK, WHITE, WOOD, b, cy, dims, piece, sp } from "./kit.ts";
import { cabinet, fin } from "./storage.ts";
import * as K from "../partsKit.ts";

const GAP = "#44464a";
const STONE = "#e9e6e0";
const BRASS_M: K.Opt = { tex: "metal", metal: 1, rough: 0.3 };

/** Kitchen island: cabinets with fronts on the +z side, a worktop that overhangs 30 cm on the -z side for stools. Each bay: a drawer over a door. */
const island = (w: number, d: number, cols: number, c: string): Def => {
  const body = d - 0.3;
  const zc = d / 2 - body / 2;
  const fw = (w - 0.04) / cols;
  const f = fin(c);
  const face = d / 2 - 0.001;
  return piece("Kitchen & dining", `Kitchen island with seating side ${dims(w, d)}`, w, d, 0.92, [
    b(0, 0.45, zc - 0.008, w - 0.02, 0.84, body - 0.016, GAP, { ...K.MATT, bevel: 0.004 }),
    b(0, 0.905, 0, w + 0.04, 0.04, d, STONE, { ...K.STONE, rough: 0.2, bevel: 0.006 }),
    ...Array.from({ length: cols }, (_, k) => {
      const x = -w / 2 + 0.02 + fw * (k + 0.5);
      return [
        ...K.drawerFront(x, 0.74, d / 2 - 0.019, fw - 0.006, 0.184, c, { ...f, thick: 0.018 }),
        ...K.drawerFront(x, 0.34, d / 2 - 0.019, fw - 0.006, 0.624, c, { ...f, thick: 0.018 }),
        K.handleBar(x, 0.76, face, Math.min(0.2, fw * 0.5), "x", BRASS, BRASS_M),
        K.handleBar(x + (k % 2 ? 1 : -1) * (fw / 2 - 0.05), 0.5, face, 0.16, "y", BRASS, BRASS_M),
      ];
    }).flat(),
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.03), 0.43, -d / 2 + 0.05, 0.05, 0.86, 0.05, c, { ...f, bevel: 0.006 })),
    b(0, 0.04, zc, w - 0.04, 0.08, body - 0.04, BLACK, { ...K.MATT, bevel: 0.004 }),
    K.seam(0, 0.878, face, w - 0.04, 0.006, 0.006, "#2a2c30", K.MATT), // shadow gap under the worktop
    ...[-1, 1].map((s) => b(s * (w / 2 - 0.03), 0.84, -d / 2 + 0.2, 0.04, 0.08, 0.3, c, { ...f, bevel: 0.004, detail: 1 })), // knee brackets carrying the overhang
  ]);
};
const barCart = (): Def => {
  const glassC = { tex: "ceramic", rough: 0.05, bevel: 0 } as const;
  return piece("Kitchen & dining", `Bar cart ${dims(0.8, 0.4)}`, 0.8, 0.4, 1.0, [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cy(sx * 0.38, 0.4, sz * 0.17, 0.025, 0.8, BRASS, BRASS_M))),
    ...[0.2, 0.62].map((y) => b(0, y, 0, 0.76, 0.03, 0.36, WOOD, { ...K.WOOD, m: true, bevel: 0.006 })),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => sp(sx * 0.38, 0.03, sz * 0.17, 0.06, BLACK, K.RUBBER))),
    cy(0.4, 0.8, 0.0, 0.025, 0.3, BRASS, { ...BRASS_M, r: [Math.PI / 2, 0, 0] }),
    cy(0.4, 0.87, 0.0, 0.025, 0.2, BRASS, BRASS_M),
    ...[-0.25, -0.12, 0.02].map((x, i) => K.turned(x, 0.635, i % 2 ? 0.05 : -0.05, K.vaseProfile(0.035, 0.22, 0.28), ["#2f5530", "#7a2f2a", "#c8a24a"][i], K.CERAMIC)),
    ...[0.18, 0.3].map((x) => K.turned(x, 0.635, 0.08, [[0.025, 0], [0.03, 0.1]], "#d9e6ee", glassC)),
    b(-0.2, 0.25, 0, 0.3, 0.08, 0.2, "#d6cfc4", { ...K.CERAMIC, bevel: 0.01 }),
    K.turned(0.15, 0.215, 0.0, [[0.035, 0], [0.05, 0.1], [0.052, 0.12]], "#b8683f", { ...K.CERAMIC, rough: 0.8 }),
    ...[0.2, 0.62].flatMap((y) => [-1, 1].map((s) => b(0, y + 0.025, s * 0.175, 0.74, 0.02, 0.01, BRASS, { ...BRASS_M, bevel: 0.002, detail: 1 }))), // gallery rails
    ...[0.2, 0.62].map((y) => b(0.37, y + 0.025, 0, 0.01, 0.02, 0.34, BRASS, { ...BRASS_M, bevel: 0.002, detail: 1 })),
  ]);
};

const pantry = (label: string, w: number, c: string, cols: number): Def =>
  cabinet("Kitchen & dining", label, w, 0.6, 2.1, cols, 2, c, { handle: "vbar", legH: 0.1, legC: BLACK });

/** Base cabinet that fills an inside corner: a door on the front, a blind panel on the side. */
const cornerBase = (): Def => {
  const f = fin(WHITE);
  return piece("Kitchen & dining", `Corner base cabinet ${dims(0.9, 0.9)}`, 0.9, 0.9, 0.92, [
    b(0, 0.43, 0, 0.9, 0.84, 0.9, GAP, { ...K.MATT, bevel: 0.004 }),
    b(0, 0.905, 0, 0.92, 0.04, 0.92, STONE, { ...K.STONE, rough: 0.2, bevel: 0.006 }),
    ...K.drawerFront(-0.14, 0.43, 0.436, 0.504, 0.804, WHITE, { ...f, thick: 0.018 }),
    ...K.drawerFront(0.38, 0.43, 0.436, 0.104, 0.804, WHITE, { ...f, thick: 0.018 }),
    b(0.44, 0.43, 0.2, 0.018, 0.8, 0.5, WHITE, { ...f, bevel: 0.004 }),
    K.handleBar(0.12, 0.7, 0.454, 0.2, "y"),
    b(0, 0.04, 0, 0.86, 0.08, 0.86, BLACK, { ...K.MATT, bevel: 0.004 }),
    K.seam(0, 0.878, 0.453, 0.86, 0.006, 0.006, "#2a2c30", K.MATT),
    b(-0.14, 0.43, 0.456, 0.36, 0.6, 0.004, WHITE, { ...f, bevel: 0.002, detail: 1 }), // door panel
  ]);
};
const cornerWall = (): Def => {
  const f = fin(WHITE);
  return piece("Kitchen & dining", `Corner wall cabinet ${dims(0.65, 0.65)}`, 0.65, 0.65, 2.1, [
    b(0, 1.65, 0, 0.65, 0.7, 0.65, GAP, { ...K.MATT, bevel: 0.004 }),
    ...K.drawerFront(-0.07, 1.65, 0.316, 0.404, 0.664, WHITE, { ...f, thick: 0.018 }),
    ...K.drawerFront(0.27, 1.65, 0.316, 0.104, 0.664, WHITE, { ...f, thick: 0.018 }),
    b(0.32, 1.65, 0.12, 0.018, 0.66, 0.4, WHITE, { ...f, bevel: 0.004 }),
    K.handleBar(0.1, 1.4, 0.334, 0.16, "y"),
    b(0, 1.3, 0, 0.62, 0.012, 0.62, "#d8d4cc", { ...K.MATT, bevel: 0.004, detail: 1 }), // underside light rail
    b(-0.07, 1.65, 0.336, 0.3, 0.5, 0.004, WHITE, { ...f, bevel: 0.002, detail: 1 }), // door panel
  ], { wall: true });
};

export const KITCHEN: Record<string, Def> = {
  dc_island_120: island(1.2, 0.9, 3, WHITE),
  dc_island_180: island(1.8, 1.0, 4, "#4a6b6a"),
  dc_island_240: island(2.4, 1.1, 6, DARKWOOD),
  dc_bar_cart: barCart(),
  dc_pantry_60: pantry(`Tall pantry cabinet ${dims(0.6, 0.6)}`, 0.6, WHITE, 1),
  dc_pantry_90: pantry(`Tall pantry cabinet, double door ${dims(0.9, 0.6)}`, 0.9, OAK, 2),
  dc_cabinet_corner_base: cornerBase(),
  dc_cabinet_corner_wall: cornerWall(),
};
