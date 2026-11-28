import type { Def, Part } from "./catalog";
import { b, cy, cz, STEEL, WHITE, DARK } from "./partKit.ts";

const BRASS = "#b79548";
const valve = (label: string, handle: string, smart = false): Def => {
  const parts: Part[] = [cz(0, 0.1, 0, 0.04, 0.2, BRASS), cy(0, 0.12, 0, 0.055, 0.08, BRASS), b(0, 0.17, 0, 0.16, 0.02, 0.035, handle)];
  if (smart) parts.push(b(0, 0.21, 0, 0.14, 0.08, 0.1, WHITE), b(0, 0.255, 0, 0.04, 0.01, 0.04, DARK));
  return { label, brand: "Generic", cat: "Sensors", w: 0.18, d: 0.22, h: smart ? 0.26 : 0.18, parts, tags: "pipes plumbing shutoff valve water gas utility" };
};
const meter = (label: string, gas: boolean): Def => ({
  label, brand: "Generic", cat: "Sensors", w: gas ? 0.25 : 0.16, d: gas ? 0.18 : 0.2, h: gas ? 0.35 : 0.2,
  parts: gas ? [b(0, 0.19, 0, 0.25, 0.3, 0.18, STEEL), b(0, 0.25, 0.095, 0.14, 0.06, 0.01, DARK), cz(-0.08, 0.04, 0, 0.035, 0.18, BRASS), cz(0.08, 0.04, 0, 0.035, 0.18, BRASS)] : [cz(0, 0.1, 0, 0.035, 0.2, BRASS), cy(0, 0.13, 0, 0.15, 0.12, STEEL), cy(0, 0.195, 0, 0.12, 0.01, DARK)],
  tags: "pipes plumbing meter utility flow usage",
});
export const UTILITIES: Record<string, Def> = {
  ut_water_main: valve("Main water shut-off valve", "#398acc"),
  ut_water_valve: valve("Water shut-off valve", "#398acc"),
  ut_water_smart: valve("Smart water shut-off valve", "#398acc", true),
  ut_zone_valve: valve("Zone shut-off valve", "#c45050"),
  ut_water_usage: meter("Water meter", false),
  ut_gas_main: valve("Main gas shut-off valve", "#e4be36"),
  ut_gas_usage: meter("Gas meter", true),
};
