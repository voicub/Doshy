// Ambient life of the live view: smoke and flames of stoves, fireplaces and fire pits that are burning. Which devices count, what "burning" means for the entity
// linked to them, where the smoke leaves and how a puff moves. Pure: no React, no three.js (components/scene/AmbientLife.tsx draws it).

export type V3 = readonly [number, number, number];

// ---------- settings ----------

export type AmbientSettings = {
  /** Smoke and flames from stoves and chimneys (Balanced and above only: the tier decides whether anything animates at all). */
  smoke: boolean;
};

export const DEFAULT_AMBIENT: AmbientSettings = { smoke: true };

/** Stored settings, or the defaults for anything missing or of the wrong type. */
export function restoreAmbient(stored: unknown): AmbientSettings {
  const smoke = typeof stored === "object" && stored !== null && "smoke" in stored ? stored.smoke : undefined;
  return { smoke: typeof smoke === "boolean" ? smoke : DEFAULT_AMBIENT.smoke };
}

// ---------- what burns, and where ----------

export type PlumeName = "smoke" | "vapour";

export type HeatKind = {
  /** Where the smoke leaves, in the catalog piece's own metres (x right, y up, z towards the front) before the item's size is applied. Absent: nothing to smoke (an open hearth with no flue). */
  flue?: V3;
  /** What leaves the flue: grey wood smoke, or the thin white vapour of a gas boiler. Default smoke. */
  plume?: PlumeName;
  /** The glowing fire: centre of the flame glow and its width (m). */
  flame?: { at: V3; size: number };
};

/** Catalog pieces that burn something. Positions are read from the parts of each piece (flue top, firebox door); the kind ids are the catalog's own and never change. */
export const HEAT_KINDS: Record<string, HeatKind> = {
  ap_woodstove: { flue: [0, 2.5, -0.04], flame: { at: [0, 0.5, 0.22], size: 0.4 } },
  dc_stove_woodburner: { flue: [0, 2.3, -0.1], flame: { at: [0, 0.47, 0.25], size: 0.4 } },
  dc_fireplace_stone: { flue: [0, 2.5, -0.2], flame: { at: [0, 0.3, 0.02], size: 0.75 } },
  dc_fireplace_mantel: { flame: { at: [0, 0.3, 0.04], size: 0.7 } },
  out_fire_pit: { flue: [0, 0.5, 0], flame: { at: [0, 0.34, 0], size: 0.6 } },
  kt_boiler: { flue: [0, 2.2, 0], plume: "vapour" }, // wall gas boiler: its flue pipe tops the piece; no open flame to glow
};

const OFF_STATES: Record<string, true> = { off: true, unavailable: true, unknown: true, "": true };
const SWITCHED = ["switch", "light", "fan", "input_boolean", "binary_sensor"];

/**
 * Is the device behind this entity burning or heating right now? A switch, light, fan, input boolean or binary sensor when on; a thermostat when it reports
 * heating (or has no report and is set to heat); a water heater in any mode but off. Everything else (a sensor, a person ...) says nothing about a fire.
 */
export function isHeatActive(domain: string, state: string, attrs: { hvac_action?: unknown } | undefined): boolean {
  if (SWITCHED.includes(domain)) return state === "on";
  if (domain === "climate") return typeof attrs?.hvac_action === "string" ? attrs.hvac_action === "heating" : state === "heat";
  if (domain === "water_heater") return !Object.hasOwn(OFF_STATES, state);
  return false;
}

export type HeatItem = { id: string; kind: string; entity?: string };
type StateOf = { state: string; attributes: { hvac_action?: unknown } };

/** What burns in a catalog piece of this kind, or undefined for any other piece. */
export const heatKindOf = (kind: string): HeatKind | undefined => (Object.hasOwn(HEAT_KINDS, kind) ? HEAT_KINDS[kind] : undefined);

/** The burning pieces among `items`: a known kind whose linked entity is active (nothing without a link or while the state is not known). */
export function burningItems<T extends HeatItem>(items: readonly T[], states: Readonly<Record<string, StateOf | undefined>>): T[] {
  return items.filter((i) => {
    const st = i.entity ? states[i.entity] : undefined;
    return !!i.entity && !!st && !!heatKindOf(i.kind) && isHeatActive(i.entity.split(".")[0], st.state, st.attributes);
  });
}

type Placed = { x: number; y: number; rot: number; w: number; d: number; h: number; elev?: number };
type Dims = { w: number; d: number; h: number };

/** A point of a catalog piece (its own metres) in the world: sized like the item, turned like it (clockwise `rot` degrees in plan), on a floor `floorY` high. */
export function heatPoint(item: Placed, def: Dims, local: V3, floorY: number): V3 {
  const lx = local[0] * (item.w / def.w);
  const lz = local[2] * (item.d / def.d);
  const a = (-item.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [item.x + lx * c + lz * s, floorY + (item.elev ?? 0) + local[1] * (item.h / def.h), item.y - lx * s + lz * c];
}

// ---------- the smoke ----------

/** Puffs per chimney, chimneys drawn at most (so the whole scene has at most PER_SOURCE * MAX_SOURCES puffs). */
export const PER_SOURCE = 6;
export const MAX_SOURCES = 4;
/** Seconds a puff lives, metres a puff is blown sideways by a strong wind at the end of its life. */
const LIFE_S = 6;
const DRIFT_M = 1.6;
const WIND_FULL = 8; // m/s: this wind bends the plume as far as it bends
const FADE_IN = 0.12; // share of the life the puff takes to appear

/** How a plume looks: puffs used (of PER_SOURCE), metres risen, puff size (m) at the flue and growth, strongest alpha, whiteness 0 (grey smoke) .. 1 (white vapour). */
export type PlumeStyle = { puffs: number; rise: number; size0: number; grow: number; alpha: number; white: number };
export const PLUMES: Record<PlumeName, PlumeStyle> = {
  smoke: { puffs: PER_SOURCE, rise: 2.7, size0: 0.21, grow: 0.6, alpha: 0.42, white: 0 },
  vapour: { puffs: 3, rise: 0.9, size0: 0.12, grow: 0.3, alpha: 0.26, white: 1 },
};

export type Puff = { x: number; y: number; z: number; size: number; alpha: number };
export const newPuff = (): Puff => ({ x: 0, y: 0, z: 0, size: 0, alpha: 0 });

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 0..1 how far the wind bends a plume. */
export const bendOf = (windMs: number) => clamp01(windMs / WIND_FULL);

/** Age of puff `i` of `n` (0 just left the flue, 1 gone) at time `t` seconds: puffs are spread evenly along the plume, `seed` shifts a chimney against the others. */
export function puffAge(t: number, i: number, n: number, seed: number): number {
  const u = (t / LIFE_S + i / n + seed) % 1;
  return u < 0 ? u + 1 : u;
}

/**
 * Where puff of age `u` is, relative to the flue: rising and widening, blown along (`windX`, `windZ` = unit direction the wind blows towards) by `bend`
 * (0 calm .. 1 strong) more the higher it gets, and fading out with height. Writes into `out`.
 */
export function plumeAt(out: Puff, u: number, seed: number, bend: number, windX: number, windZ: number, style: PlumeStyle = PLUMES.smoke): Puff {
  const drift = bend * DRIFT_M * u ** 1.4;
  const sway = Math.sin(seed * 17 + u * 6) * 0.06 * u;
  out.x = windX * drift + sway;
  out.z = windZ * drift - sway;
  out.y = style.rise * u ** 0.8;
  out.size = style.size0 + style.grow * u;
  out.alpha = style.alpha * clamp01(u / FADE_IN) * (1 - u) ** 1.2;
  return out;
}

/** Flame flicker, 0.55..1: two sines that never line up. */
export function flicker(t: number, seed: number): number {
  return 0.775 + 0.225 * (0.6 * Math.sin(t * 9 + seed * 6.3) + 0.4 * Math.sin(t * 14.7 + seed * 2.1));
}
