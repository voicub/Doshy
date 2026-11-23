import type { Def, Part } from "../catalog";
import { b, cx, cy } from "../partKit.ts";

// Glass balcony, terrace and stair railings: tempered glass panels (see-through, reflective) in several fixings. Modules are 1.0 / 1.5 / 2.0 m long and
// 6 cm deep like the metal "Balcony railing", so they swap one for one and line up along a balcony edge (rot 0 = run along x, front = +z).
const STEEL = "#c9ced4"; // brushed stainless
const BLACK = "#2b2d31";
const OAK = "#b9885a";
const GLASS_TINT = "#c3e6ee";

type Fixing = "handrail" | "frameless" | "black" | "standoff" | "wood";
const LABEL: Record<Fixing, string> = {
  handrail: "Glass balcony railing with steel handrail",
  frameless: "Frameless glass balcony railing (base channel)",
  black: "Glass balcony railing, black aluminium posts",
  standoff: "Glass balcony railing on stainless stand-offs",
  wood: "Glass balcony railing with oak handrail",
};
const H = 1.1;
const T = 0.06;

/** post of thickness t at x */
const post = (x: number, h: number, t: number, c: string): Part => b(x, h / 2, 0, t, h, t, c, { m: true });

function parts(fix: Fixing, len: number): Part[] {
  const half = len / 2;
  const n = Math.max(1, Math.round(len / 1.0)); // glass panels per module: 1 m each
  const panel = len / n;
  const centres = Array.from({ length: n }, (_, i) => -half + panel * (i + 0.5));
  switch (fix) {
    case "handrail":
      return [
        b(0, 0.05, 0, len, 0.1, T, STEEL, { m: true }), // base shoe the glass sits in
        ...centres.map((x) => b(x, 0.56, 0, panel - 0.03, 0.92, 0.012, GLASS_TINT, { glass: true })),
        cx(0, H - 0.025, 0, 0.045, len, STEEL, { m: true }), // round handrail
        ...[-half + 0.02, half - 0.02, ...centres.slice(1).map((x) => x - panel / 2)].map((x) => post(x, H - 0.05, 0.035, STEEL)),
      ];
    case "frameless":
      return [
        b(0, 0.05, 0, len, 0.1, T, STEEL, { m: true }),
        ...centres.map((x) => b(x, 0.56, 0, panel - 0.01, 0.98, 0.012, GLASS_TINT, { glass: true })),
        ...centres.slice(1).map((x) => b(x - panel / 2, 0.56, 0, 0.012, 0.99, 0.02, STEEL)), // clamp line between panels
      ];
    case "black":
      return [
        b(0, 0.04, 0, len, 0.08, T, BLACK, { m: true }),
        ...centres.map((x) => b(x, 0.55, 0, panel - 0.08, 0.9, 0.012, GLASS_TINT, { glass: true })),
        b(0, H - 0.02, 0, len, 0.04, 0.05, BLACK, { m: true }), // flat top rail
        ...[-half + 0.03, half - 0.03, ...centres.slice(1).map((x) => x - panel / 2)].map((x) => post(x, H, 0.05, BLACK)),
      ];
    case "standoff":
      return [
        ...centres.map((x) => b(x, 0.6, 0, panel - 0.03, 0.98, 0.012, GLASS_TINT, { glass: true })),
        b(0, H - 0.01, 0, len, 0.025, 0.04, STEEL, { m: true }), // slim cap rail along the top of the glass
        ...centres.flatMap((x) => [-1, 1].flatMap((sx) => [0.2, 0.85].map((y) => cy(x + sx * (panel / 2 - 0.08), y, 0.012, 0.05, 0.03, STEEL, { r: [Math.PI / 2, 0, 0] })))), // stand-off buttons
        post(-half + 0.01, 0.12, 0.03, STEEL),
        post(half - 0.01, 0.12, 0.03, STEEL),
      ];
    case "wood":
      return [
        b(0, 0.05, 0, len, 0.1, T, STEEL),
        ...centres.map((x) => b(x, 0.56, 0, panel - 0.04, 0.92, 0.012, GLASS_TINT, { glass: true })),
        b(0, H - 0.03, 0, len, 0.05, 0.07, OAK, { m: true }), // oak handrail
        ...[-half + 0.03, half - 0.03, ...centres.slice(1).map((x) => x - panel / 2)].map((x) => b(x, (H - 0.06) / 2, 0, 0.05, H - 0.06, 0.05, OAK, { m: true })),
      ];
  }
}

const rail = (fix: Fixing, len: number): Def => ({
  label: `${LABEL[fix]}, ${len === 1 ? "1 m" : `${len} m`}`,
  brand: "Generic",
  cat: "Garden",
  w: len,
  d: T,
  h: H,
  solid: true,
  parts: parts(fix, len),
});

const FIXINGS: Fixing[] = ["handrail", "frameless", "black", "standoff", "wood"];
const LENGTHS = [1, 1.5, 2] as const;

export const RAILINGS: Record<string, Def> = Object.fromEntries(
  FIXINGS.flatMap((f) => LENGTHS.map((len) => [`gd_railing_glass_${f}_${String(len).replace(".", "_")}`, rail(f, len)] as const)),
);
