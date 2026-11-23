// Curtains that open and close by themselves: how open a linked Home Assistant entity says the curtain is (0 closed .. 1 open), and how the
// modelled panels move for it. A window curtain has two layers, each with its own entity: the SHEER one (the light net / voile, `item.entity`) and
// the BLACKOUT one (the heavy sun-blocking velvet, `item.params.blackoutEntity`). The 3D side is components/scene/ItemMesh.tsx.
// The node test runner loads this file directly: .ts imports.
import type { Part } from "./catalog.ts";
import { domainOf, type HAState } from "./ha.ts";

export type CurtainLayer = "sheer" | "blackout";
type Params = Record<string, number | string | boolean>;

/** The plain words for each layer (inspector and cards), and the suffix on a room device row. */
export const LAYER_NAME: Record<CurtainLayer, string> = { sheer: "Curtain (sheer)", blackout: "Sun-blocking curtain" };
export const LAYER_ROW: Record<CurtainLayer, string> = { sheer: "(sheer)", blackout: "(sun-blocking)" };

type CurtainParams = { invert: boolean; above?: number };

/**
 * The per-layer settings, read from `item.params`: sheer `curtainInvert` (open when the entity is off / below) and `curtainAbove` (a number sensor: open at or above it);
 * blackout `blackoutInvert` and `blackoutAbove`, the same two for the sun-blocking layer.
 */
export function curtainParams(params?: Params, layer: CurtainLayer = "sheer"): CurtainParams {
  const above = params?.[layer === "sheer" ? "curtainAbove" : "blackoutAbove"];
  return { invert: params?.[layer === "sheer" ? "curtainInvert" : "blackoutInvert"] === true, ...(typeof above === "number" && Number.isFinite(above) ? { above } : {}) };
}

type LayerSettings = CurtainParams & { entity?: string };
/** The blackout layer also has the dawn rule: `dawn` closes it by itself at civil dawn (on unless the owner switched it off), `openAt` ("HH:MM") opens it again (absent: never by itself). */
type BlackoutSettings = LayerSettings & { dawn: boolean; openAt?: string };

const DAWN_DOMAINS = ["cover"]; // the rule only ever calls cover.close_cover / cover.open_cover
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Does the dawn rule apply to this blackout? On by default for a linked cover, until the owner turns it off (`blackoutDawn: false`). */
export const blackoutDawnOn = (params: Params | undefined, entity: string | undefined): boolean =>
  !!entity && DAWN_DOMAINS.includes(domainOf(entity)) && params?.blackoutDawn !== false;

/** Both layers of a window curtain: their entities and settings. The server-side dawn rule and the scene read it the same way. */
export function curtainLayers(item: { entity?: string; params?: Params }): { sheer: LayerSettings; blackout: BlackoutSettings } {
  const blackoutEntity = item.params?.blackoutEntity;
  const entity = typeof blackoutEntity === "string" && blackoutEntity ? blackoutEntity : undefined;
  const at = item.params?.blackoutOpenAt;
  return {
    sheer: { ...curtainParams(item.params, "sheer"), ...(item.entity ? { entity: item.entity } : {}) },
    blackout: { ...curtainParams(item.params, "blackout"), ...(entity ? { entity } : {}), dawn: blackoutDawnOn(item.params, entity), ...(typeof at === "string" && HHMM.test(at) ? { openAt: at } : {}) },
  };
}

/** "open" / "closed" / "60% open" for an openness (0..1), in the words the inspector, the cards and the device list use. */
export const opennessWords = (open: number): string => (open >= 0.995 ? "open" : open <= 0.005 ? "closed" : `${Math.round(open * 100)}% open`);

/** What the dawn rule last did for one curtain (`GET /api/automation/curtains`: `at` is a unix time in ms, "skip" = it looked and left the curtain alone, `why` says why in plain words). */
export type AutoNote = { at: number; action: "close" | "open" | "skip"; why: string };

/** "Closed automatically at 05:12" / "Opened automatically on 3 Nov at 09:00" / "Did nothing at 05:12: already closed". */
export function autoLine(n: AutoNote, now = new Date()): string {
  const d = new Date(n.at < 1e12 ? n.at * 1000 : n.at); // a unix time in seconds is also understood
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const when = d.toDateString() === now.toDateString() ? `at ${hm}` : `on ${d.getDate()} ${d.toLocaleString("en", { month: "short" })} at ${hm}`;
  return n.action === "skip" ? `Did nothing ${when}: ${n.why}` : `${n.action === "close" ? "Closed" : "Opened"} automatically ${when}`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const DEAD = new Set(["unavailable", "unknown", "none", ""]);

/** What kind of reading this is, in words for the inspector. */
export type Reading = "cover" | "sun" | "percent" | "number" | "switch" | "none";
export function readingOf(st: HAState | undefined): Reading {
  if (!st) return "none";
  const d = domainOf(st.entity_id);
  if (d === "cover") return "cover";
  if (d === "sun") return "sun";
  if (d === "sensor" || d === "number" || d === "input_number") return st.attributes.unit_of_measurement === "%" ? "percent" : "number";
  return "switch";
}

/**
 * How open the curtain is, from the entity it is linked to: a cover (its position, else open / closed), the sun (open while it is up),
 * a switch or binary sensor (on = open), a percentage sensor (the percentage), a number sensor with `above` (open at or above it).
 * Undefined when there is nothing to go by (no entity, unavailable, a plain number without a threshold): the curtain keeps its modelled look.
 */
export function curtainOpenness(st: HAState | undefined, p: CurtainParams): number | undefined {
  if (!st || DEAD.has(st.state)) return undefined;
  let open: number | undefined;
  switch (readingOf(st)) {
    case "cover": {
      const pos = st.attributes.current_position;
      open = typeof pos === "number" ? pos / 100 : st.state === "open" ? 1 : st.state === "closed" ? 0 : st.state === "opening" || st.state === "closing" ? 0.5 : undefined;
      break;
    }
    case "sun":
      open = st.state === "above_horizon" ? 1 : st.state === "below_horizon" ? 0 : undefined;
      break;
    case "percent":
    case "number": {
      const v = Number.parseFloat(st.state);
      if (!Number.isFinite(v)) return undefined;
      if (p.above !== undefined) open = v >= p.above ? 1 : 0;
      else if (readingOf(st) === "percent") open = v / 100;
      break;
    }
    default:
      open = st.state === "on" || st.state === "open" || st.state === "home" ? 1 : st.state === "off" || st.state === "closed" || st.state === "not_home" ? 0 : undefined;
  }
  if (open === undefined) return undefined;
  return clamp01(p.invert ? 1 - open : open);
}

// ---- the panels ---------------------------------------------------------------------------------------------------------------------

/**
 * One moving panel (a pleat, a velvet fold, the net): its centre `x`, the outer `edge` it stays tied to, its width factor `open` / `shut` (1 = as modelled)
 * when the curtain is open / drawn, and `m`, how open it is modelled (1 gathered, 0 drawn). Pleats gathered at a side draw toward the middle (wider when
 * shut); a continuous curtain and a net gather toward their outer edge (narrower when open).
 */
export type Drape = { i: number; x: number; edge: number; open: number; shut: number; m: 0 | 1 };
/** One layer's moving parts. mode "pair": pleats gathered at the sides or one side (modelled open). "single": one continuous curtain (modelled drawn), or a net alone. */
type LayerRig = { mode: "pair" | "single"; drapes: Drape[] };
export type CurtainRig = { sheer?: LayerRig; blackout?: LayerRig };

const SHEET_Z = 0.02; // m: thinner than this and wide, a part is a net sheet, not a pleat
const SHEET_W = 0.8;
const MAX_K = 4;
const GATHER = 0.75; // a single curtain bunches to a quarter of its width when open
const SHEET_GATHER = 0.8; // a net bunches to a fifth of its width when open
const MIN_GAP = 0.1; // m: pleats at least this far from the middle are a pair gathered at the sides

function layerRig(parts: readonly Part[], layer: CurtainLayer): LayerRig | null {
  const cloth = parts.flatMap((p, i) => (p.layer === layer ? [{ i, p }] : []));
  if (!cloth.length) return null;
  const isSheet = ({ p }: { p: Part }) => p.s[0] >= SHEET_W && p.s[2] <= SHEET_Z;
  const pleats = cloth.filter((c) => !isSheet(c));
  // a net gathers toward the side it is nearest to (the left when centred), tied to that outer edge
  const sheets: Drape[] = cloth.filter(isSheet).map(({ i, p }) => ({ i, x: p.p[0], edge: p.p[0] > 0 ? p.p[0] + p.s[0] / 2 : p.p[0] - p.s[0] / 2, open: 1 - SHEET_GATHER, shut: 1, m: 0 }));
  if (!pleats.length) return { mode: "single", drapes: sheets };
  const left = pleats.filter(({ p }) => p.p[0] < 0);
  const right = pleats.filter(({ p }) => p.p[0] > 0);
  const gap = Math.min(...pleats.map(({ p }) => Math.abs(p.p[0]) - p.s[0] / 2));
  if (left.length + right.length === pleats.length && gap >= MIN_GAP) {
    const side = (list: typeof pleats, sign: 1 | -1): Drape[] => {
      if (!list.length) return [];
      const outer = Math.max(...list.map(({ p }) => Math.abs(p.p[0]) + p.s[0] / 2));
      const inner = Math.min(...list.map(({ p }) => Math.abs(p.p[0]) - p.s[0] / 2));
      const shut = Math.min(MAX_K, outer / Math.max(0.05, outer - inner));
      return list.map(({ i, p }) => ({ i, x: p.p[0], edge: sign * outer, open: 1, shut, m: 1 }));
    };
    return { mode: "pair", drapes: [...side(left, -1), ...side(right, 1), ...sheets] };
  }
  const edge = Math.min(...pleats.map(({ p }) => p.p[0] - p.s[0] / 2));
  return { mode: "single", drapes: [...pleats.map(({ i, p }): Drape => ({ i, x: p.p[0], edge, open: 1 - GATHER, shut: 1, m: 0 })), ...sheets] };
}

/** Which parts of a curtain definition move, per layer (a part's `layer`; rods, rings and tie-backs have none and stay). Null when none do (a shower curtain, a rod alone). */
export function curtainRig(parts: readonly Part[]): CurtainRig | null {
  const sheer = layerRig(parts, "sheer");
  const blackout = layerRig(parts, "blackout");
  return sheer || blackout ? { ...(sheer ? { sheer } : {}), ...(blackout ? { blackout } : {}) } : null;
}

/** A panel's centre and its width factor at `open` (0..1). At `d.m` it is exactly where the model draws it. */
export function drapeAt(d: Drape, open: number): { x: number; s: number } {
  const s = d.shut + (d.open - d.shut) * clamp01(open);
  return { x: d.edge - (d.edge - d.x) * s, s };
}

/** Window curtains (Decor) open and close; a shower curtain in the bathroom does not. */
export const isWindowCurtain = (kind: string, cat: string) => cat === "Decor" && (kind.includes("curtain") || kind.endsWith("_sheer"));
