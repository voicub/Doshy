import type { Def } from "../catalog";
import { BLACK, DARK, WARM, b, cy, gd, lit, sp } from "./kit.ts";

// Street lights for lib/lineLights.ts: tall on purpose (light.y above 1.78 m), the one documented exception in lib/garden/lights.ts.
// They repeat along a road, so each stays under 25 parts.
const IRON = "#2f3236";
const PANE = "#fff1c8";

const classic = gd("Classic street light 3.6 m", 0.3, 0.3, 3.6, [
  cy(0, 0.075, 0, 0.3, 0.15, IRON), cy(0, 0.4, 0, 0.22, 0.5, IRON), cy(0, 0.68, 0, 0.14, 0.06, DARK), // plinth and fluted base
  cy(0, 1.85, 0, 0.07, 2.3, IRON), cy(0, 3.0, 0, 0.12, 0.06, DARK), // slim column and its collar below the lantern
  cy(0, 3.05, 0, 0.26, 0.04, IRON),
  cy(0, 3.3, 0, 0.18, 0.46, PANE, { glow: true }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * 0.1, 3.3, sz * 0.1, 0.02, 0.46, 0.02, IRON))),
  cy(0, 3.55, 0, 0.3, 0.05, IRON), cy(0, 3.6 - 0.065, 0, 0.14, 0.05, DARK), sp(0, 3.6 - 0.03, 0, 0.06, BLACK),
], { ...lit(3.3, WARM, 0.8), tags: "street light lamp post lantern cast iron victorian road garden classic" });

// The pole stands at the back of the footprint and the arm reaches +z (front), so the head hangs over the road side the lamp faces.
const modern = gd("Modern street pole 5 m", 0.3, 1.2, 5.0, [
  cy(0, 0.1, -0.45, 0.3, 0.2, IRON), cy(0, 2.5, -0.45, 0.12, 4.8, "#8d939a", { m: true }), // base plate and slim round pole
  b(0, 4.88, -0.0, 0.07, 0.07, 0.95, "#8d939a", { m: true }), // arm out to the front
  b(0, 4.88, -0.45, 0.12, 0.07, 0.12, "#8d939a", { m: true }), // elbow
  b(0, 4.86, 0.35, 0.22, 0.06, 0.5, DARK), // flat LED head
  b(0, 4.82, 0.35, 0.18, 0.02, 0.44, PANE, { glow: true }), // light face, downwards
], { ...lit(4.8, "#e8f2ff", 0.9), tags: "street pole lamp led arm road highway modern lighting" });

export const STREET_LIGHTS: Record<string, Def> = { gd_street_classic: classic, gd_street_modern: modern };
