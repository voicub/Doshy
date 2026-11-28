import { gridLevels } from "@/lib/blueprint";
import type { Frame } from "@/lib/planView";
import type { FloorKind, WallStyle } from "@/lib/types";

/** Cyanotype blue the plan is drawn on, and the pale line colour of everything drafted on it. */
export const PAPER = "var(--plan-paper)";
export const LINE = "var(--plan-line)";
const RULE = "var(--plan-rule)"; // millimetre-paper rulings

/** Fill that draws a floor material as drafting symbols (planks, tiles, turf) instead of a colour. */
export const floorFill = (floor: FloorKind) => (floor === "carpet" ? "none" : `url(#bp-floor-${floor})`);

/** Fill that draws a cut wall's material as a section hatch. Plain paint and plaster share the single 45 degree hatch. */
export const wallFill = (style: WallStyle) => `url(#${WALL_HATCH[style]})`;
const WALL_HATCH: Record<WallStyle, string> = {
  plaster: "bp-wall", paint: "bp-wall", brick: "bp-wall-brick", redbrick: "bp-wall-brick", whitebrick: "bp-wall-brick", concrete: "bp-wall-concrete",
  woodv: "bp-wall-wood", woodh: "bp-wall-wood", batten: "bp-wall-stripes", stripes: "bp-wall-stripes", stone: "bp-wall-stone", metro: "bp-wall-tile", glass: "bp-wall-glass",
  fence_picket: "bp-wall-wood", fence_wire: "bp-wall-glass", fence_panel: "bp-wall-wood", wall_stone: "bp-wall-stone", wall_brick_low: "bp-wall-brick", hedge: "bp-wall-stripes",
  fence_slat: "bp-wall-wood", fence_bar: "bp-wall-stripes", fence_iron: "bp-wall-stripes", fence_glass: "bp-wall-glass", wall_block: "bp-wall-concrete", fence_rail: "bp-wall-wood", fence_electric: "bp-wall-glass", fence_bamboo: "bp-wall-stripes",
};

type FloorPattern = { kind: FloorKind; w: number; h: number; d: string; dots?: [number, number][]; strong?: boolean };
/** Plan symbols of the floors added after the original five. Tile sizes are metres. */
const FLOOR_PATTERNS: FloorPattern[] = [
  { kind: "oak", w: 1, h: 0.2, d: "M0 0H1M0.3 0V0.2" },
  { kind: "darkwood", w: 1, h: 0.12, d: "M0 0H1M0.6 0V0.12", strong: true },
  { kind: "herringbone", w: 0.4, h: 0.2, d: "M0 0.2L0.1 0.1L0.2 0.2L0.3 0.1L0.4 0.2M0.1 0.1V0M0.3 0.1V0" },
  { kind: "laminate", w: 0.8, h: 0.2, d: "M0 0H0.8M0.2 0V0.2M0.6 0V0.2" },
  { kind: "tilelarge", w: 0.9, h: 0.9, d: "M0.9 0H0V0.9M0.12 0.78L0.78 0.12", strong: true },
  { kind: "mosaic", w: 0.1, h: 0.1, d: "M0.1 0H0V0.1" },
  { kind: "marble", w: 1, h: 1, d: "M0.05 0.95C0.3 0.6 0.4 0.75 0.6 0.45S0.85 0.3 0.97 0.05M0.4 1C0.5 0.8 0.7 0.9 0.8 0.7S0.95 0.6 1 0.55", strong: true },
  { kind: "terrazzo", w: 0.5, h: 0.5, d: "M0.1 0.1l0.04 0.02l-0.01 0.04zM0.32 0.28l0.05 -0.02l0.01 0.05zM0.12 0.4l0.03 0.03", dots: [[0.4, 0.08], [0.22, 0.22], [0.45, 0.42]] },
  { kind: "concrete", w: 0.3, h: 0.3, d: "M0.06 0.2l0.03 0.02l-0.03 0.02z", dots: [[0.1, 0.06], [0.22, 0.12], [0.18, 0.26], [0.04, 0.14]] },
  { kind: "polished", w: 0.4, h: 0.4, d: "M0 0.4L0.4 0M0.2 0.4L0.4 0.2", dots: [[0.08, 0.08], [0.3, 0.34]] },
  { kind: "slabs", w: 1.2, h: 0.8, d: "M0 0H1.2M0 0.4H1.2M0.5 0V0.4M0.9 0.4V0.8M0 0.8H1.2M0.2 0.4V0.8", strong: true },
  { kind: "slate", w: 0.8, h: 0.4, d: "M0 0H0.8M0.3 0V0.4M0.6 0V0.4M0.1 0.15L0.2 0.1M0.4 0.25L0.5 0.2", strong: true },
  { kind: "vinyl", w: 1, h: 0.2, d: "M0 0H1", strong: true },
  { kind: "paving", w: 0.2, h: 0.1, d: "M0 0.1L0.05 0.05L0.1 0.1L0.15 0.05L0.2 0.1" },
  { kind: "gravel", w: 0.5, h: 0.5, d: "", dots: [[0.06, 0.1], [0.2, 0.34], [0.36, 0.14], [0.44, 0.44], [0.1, 0.46], [0.3, 0.3]] },
  { kind: "sand", w: 0.3, h: 0.2, d: "M0.03 0.05H0.08M0.17 0.14H0.23M0.24 0.03H0.27" },
  { kind: "deck", w: 1, h: 0.14, d: "M0 0H1M0.5 0V0.14", strong: true },
  { kind: "asphalt", w: 0.25, h: 0.25, d: "M0.05 0.05H0.09M0.14 0.17H0.18", dots: [[0.2, 0.06], [0.08, 0.2], [0.17, 0.12]] },
  { kind: "water", w: 0.6, h: 0.3, d: "M0 0.15Q0.075 0.05 0.15 0.15T0.3 0.15T0.45 0.15T0.6 0.15", strong: true },
  { kind: "cobble", w: 0.6, h: 0.4, d: "M0 0.2H0.6M0.15 0V0.2M0.45 0.2V0.4M0.4 0V0.2M0.1 0.2V0.4", dots: [[0.28, 0.1], [0.25, 0.3]], strong: true },
  { kind: "flagstone", w: 1.2, h: 0.8, d: "M0 0.3L0.55 0.36L1.2 0.28M0.55 0.36L0.5 0.8M0.9 0.3L0.95 0M0.2 0.8L0.25 0.58", strong: true },
  { kind: "pavers_grey", w: 0.4, h: 0.2, d: "M0 0H0.4M0 0.1H0.4M0.1 0V0.1M0.3 0.1V0.2" },
  { kind: "pavers_sand", w: 0.3, h: 0.3, d: "M0 0H0.3M0 0.15H0.3M0.15 0V0.15M0 0.15V0.3M0.3 0.15V0.3" },
  { kind: "pavers_red", w: 0.4, h: 0.2, d: "M0 0.2L0.1 0.1L0.2 0.2L0.3 0.1L0.4 0.2M0 0H0.4" },
  { kind: "mulch", w: 0.4, h: 0.4, d: "M0.05 0.1l0.06 0.02M0.24 0.06l0.05 -0.02M0.12 0.28l0.07 0.03M0.3 0.34l0.05 -0.03", dots: [[0.3, 0.2], [0.06, 0.36]] },
  { kind: "soil", w: 0.5, h: 0.5, d: "M0.1 0.1l0.04 0.02M0.34 0.28l0.04 -0.02", dots: [[0.4, 0.1], [0.2, 0.3], [0.08, 0.44], [0.44, 0.46]] },
  { kind: "turf", w: 0.3, h: 0.12, d: "M0.02 0.06H0.12M0.17 0.06H0.28", strong: true },
  { kind: "rubber", w: 0.25, h: 0.25, d: "M0 0.125H0.25M0.125 0V0.25", dots: [[0.125, 0.125]] },
];

type Scale = { px: number; hatch: number };

/** Section hatches of cut walls (one per material family) and the solid hatch of columns. */
function WallHatches({ px, hatch }: Scale) {
  const mark = px;
  return (
    <>
        {/* cut partition: single 45 degree section hatch; exterior (brick): cross-hatch */}
        <pattern id="bp-wall" width={hatch} height={hatch} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={hatch} height={hatch} fill={PAPER} />
          <line x1="0" y1="0" x2="0" y2={hatch} stroke={LINE} strokeOpacity={0.75} strokeWidth={mark} />
        </pattern>
        <pattern id="bp-wall-brick" width={hatch} height={hatch} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={hatch} height={hatch} fill={PAPER} />
          <line x1="0" y1="0" x2="0" y2={hatch} stroke={LINE} strokeOpacity={0.85} strokeWidth={mark} />
          <line x1="0" y1="0" x2={hatch} y2="0" stroke={LINE} strokeOpacity={0.55} strokeWidth={mark} />
        </pattern>
        <pattern id="solid-hatch" width={hatch} height={hatch} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={hatch} height={hatch} fill={PAPER} />
          <line x1="0" y1="0" x2="0" y2={hatch} stroke={LINE} strokeOpacity={0.9} strokeWidth={mark * 1.6} />
        </pattern>
        {/* cut walls by material: stipple for concrete, grain for wood, blocks for stone, squares for tile, upright lines for wallpaper and battens */}
        <pattern id="bp-wall-concrete" width={hatch * 2} height={hatch * 2} patternUnits="userSpaceOnUse">
          <rect width={hatch * 2} height={hatch * 2} fill={PAPER} />
          {[[0.25, 0.3], [0.7, 0.2], [0.5, 0.75], [0.15, 0.85], [0.85, 0.65]].map(([x, y], i) => <circle key={i} cx={x * hatch * 2} cy={y * hatch * 2} r={mark * 0.9} fill={LINE} fillOpacity={0.8} />)}
        </pattern>
        <pattern id="bp-wall-wood" width={hatch} height={hatch} patternUnits="userSpaceOnUse">
          <rect width={hatch} height={hatch} fill={PAPER} />
          <path d={`M0 ${hatch * 0.25}H${hatch}M0 ${hatch * 0.75}H${hatch}`} stroke={LINE} strokeOpacity={0.75} strokeWidth={mark} fill="none" />
        </pattern>
        <pattern id="bp-wall-stone" width={hatch * 3} height={hatch * 2} patternUnits="userSpaceOnUse">
          <rect width={hatch * 3} height={hatch * 2} fill={PAPER} />
          <path d={`M0 0H${hatch * 3}M0 ${hatch}H${hatch * 3}M${hatch} 0V${hatch}M${hatch * 2} ${hatch}V${hatch * 2}`} stroke={LINE} strokeOpacity={0.8} strokeWidth={mark} fill="none" />
        </pattern>
        <pattern id="bp-wall-tile" width={hatch} height={hatch} patternUnits="userSpaceOnUse">
          <rect width={hatch} height={hatch} fill={PAPER} />
          <path d={`M${hatch} 0H0V${hatch}`} stroke={LINE} strokeOpacity={0.8} strokeWidth={mark} fill="none" />
        </pattern>
        <pattern id="bp-wall-stripes" width={hatch} height={hatch} patternUnits="userSpaceOnUse">
          <rect width={hatch} height={hatch} fill={PAPER} />
          <path d={`M${hatch * 0.5} 0V${hatch}`} stroke={LINE} strokeOpacity={0.85} strokeWidth={mark} fill="none" />
        </pattern>
        <pattern id="bp-wall-glass" width={hatch} height={hatch} patternUnits="userSpaceOnUse">
          <rect width={hatch} height={hatch} fill={PAPER} />
          <path d={`M0 ${hatch / 2}H${hatch}`} stroke={RULE} strokeOpacity={0.35} strokeWidth={mark} fill="none" />
        </pattern>
    </>
  );
}

/** The floors' drafting symbols. */
function FloorPatterns({ px }: { px: number }) {
  const floorAlpha = 0.16;
  return (
    <>
        <pattern id="bp-floor-wood" width="1" height="0.16" patternUnits="userSpaceOnUse">
          <path d="M0 0H1" stroke={RULE} strokeOpacity={floorAlpha} strokeWidth={px} fill="none" />
        </pattern>
        <pattern id="bp-floor-tile" width="0.4" height="0.4" patternUnits="userSpaceOnUse">
          <path d="M0.4 0H0V0.4" stroke={RULE} strokeOpacity={floorAlpha + 0.04} strokeWidth={px} fill="none" />
        </pattern>
        <pattern id="bp-floor-brick" width="0.25" height="0.125" patternUnits="userSpaceOnUse">
          <path d="M0 0H0.25M0 0V0.0625M0.125 0.0625V0.125" stroke={RULE} strokeOpacity={floorAlpha} strokeWidth={px} fill="none" />
        </pattern>
        <pattern id="bp-floor-grass" width="0.6" height="0.6" patternUnits="userSpaceOnUse">
          <path d="M0.1 0.2L0.15 0.1L0.2 0.2M0.4 0.5L0.45 0.4L0.5 0.5" stroke={RULE} strokeOpacity={floorAlpha + 0.06} strokeWidth={px} fill="none" />
        </pattern>
        {/* floors, newer kinds: each one a drafting symbol of its own (see FLOOR_PATTERNS) */}
        {FLOOR_PATTERNS.map(({ kind, w, h, d, dots, strong }) => (
          <pattern key={kind} id={`bp-floor-${kind}`} width={w} height={h} patternUnits="userSpaceOnUse">
            <path d={d} stroke={RULE} strokeOpacity={floorAlpha + (strong ? 0.06 : 0)} strokeWidth={px} fill="none" />
            {dots?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={Math.max(px * 0.9, 0.008)} fill={RULE} fillOpacity={floorAlpha + 0.1} />)}
          </pattern>
        ))}
    </>
  );
}

/**
 * The drawing sheet: millimetre paper that gains finer rulings as you zoom in (5 m, 1 m, 50 cm, 10 cm, 5 cm, 1 cm),
 * plus the hatch patterns for cut walls and floor materials. Everything is defined in plan metres so it zooms with the plan;
 * `px` (metres per screen pixel) keeps hairlines one pixel wide and hatches no denser than the eye can read.
 */
export default function BlueprintPaper({ vb, px }: { vb: Frame; px: number }) {
  const levels = gridLevels(px);
  const hatch = Math.max(0.05, 5 * px); // spacing of the section hatch on cut walls
  return (
    <>
      <defs>
        {levels.map((l, i) => (
          <pattern key={l.step} id={`bp-g${i}`} width={l.step} height={l.step} patternUnits="userSpaceOnUse">
            <path d={`M${l.step} 0H0V${l.step}`} fill="none" stroke={RULE} strokeOpacity={l.alpha} strokeWidth={px * (l.step >= 1 ? 1.25 : 1)} />
          </pattern>
        ))}
        <WallHatches px={px} hatch={hatch} />
        <FloorPatterns px={px} />
      </defs>
      {levels.map((l, i) => (
        <rect key={l.step} x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={`url(#bp-g${i})`} pointerEvents="none" />
      ))}
    </>
  );
}
