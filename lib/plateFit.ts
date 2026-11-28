import { Euler, Quaternion, Vector3 } from "three";
import type { PlateMount } from "./carSurf.ts";
import { isRecord } from "./guards.ts";
import { clamp } from "./mathUtil.ts";
import type { PlateEnd } from "./plate.ts";

// Where the owner wants a car's number plate, as a small nudge away from the automatic place (the bumper or tailgate the car's own geometry or the
// ray-cast of a real model picked, lib/carModelPlate.ts). Pure data and maths: the scene applies it with one cheap transform, the inspector edits it.
// Two homes, resolved per end: the car's own `params.plateFront` / `params.plateRear`, else what was remembered for its model (lib/plateFitStore.ts),
// else no fit at all (the automatic place).

/** Metres, degrees, a factor. Directions are the plate's own, as seen looking at it from outside: +dx to the viewer's right, +dy up the plate, +dz out of the car. */
export type PlateFit = { dx: number; dy: number; dz: number; tilt: number; yaw: number; scale: number; hidden: boolean };
export type PlateFits = Partial<Record<PlateEnd, PlateFit>>;

export const PLATE_ENDS: readonly PlateEnd[] = ["front", "rear"];
export const PLATE_FIT_KEY: Record<PlateEnd, "plateFront" | "plateRear"> = { front: "plateFront", rear: "plateRear" };

/** Allowed range and the step the value is rounded to (the encoded form below stores whole steps). `dz` may only sink a few centimetres: further in it would vanish inside the body. */
export const FIT_RANGE = {
  dx: { min: -0.6, max: 0.6, step: 0.001 },
  dy: { min: -0.6, max: 0.6, step: 0.001 },
  dz: { min: -0.05, max: 0.2, step: 0.001 },
  tilt: { min: -45, max: 45, step: 1 },
  yaw: { min: -60, max: 60, step: 1 },
  scale: { min: 0.5, max: 1.6, step: 0.01 },
} as const;

export const defaultFit: PlateFit = { dx: 0, dy: 0, dz: 0, tilt: 0, yaw: 0, scale: 1, hidden: false };

const NUMBERS = ["dx", "dy", "dz", "tilt", "yaw", "scale"] as const;

/** `v` clamped to the field's range and rounded to its step; a non-number counts as "no change". */
function level(key: (typeof NUMBERS)[number], v: unknown): number {
  const { min, max, step } = FIT_RANGE[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return defaultFit[key];
  const perUnit = Math.round(1 / step);
  return Math.round(clamp(v, min, max) * perUnit) / perUnit + 0; // + 0: a rounded -0.0002 is 0, not -0
}

/** One whole number per field, space separated, in mm / mm / mm / degrees / degrees / percent / 0 or 1: it survives a plan's `params` (numbers, flags, short plain words only). */
const ENCODED = /^-?\d{1,4}( -?\d{1,4}){0,6}$/;

function fromEncoded(s: string): Record<string, unknown> | undefined {
  if (s.length > 40 || !ENCODED.test(s)) return undefined;
  const [dx = 0, dy = 0, dz = 0, tilt = 0, yaw = 0, scale = 100, hidden = 0] = s.split(" ").map(Number);
  return { dx: dx / 1000, dy: dy / 1000, dz: dz / 1000, tilt, yaw, scale: scale / 100, hidden: hidden === 1 };
}

const isDefault = (f: PlateFit) => NUMBERS.every((k) => f[k] === defaultFit[k]) && !f.hidden;

/**
 * A stored fit, checked: the encoded text of a car's params or the object of the settings. Every number is clamped and rounded, anything unusable
 * counts as "no change", and a fit that changes nothing is undefined, so a stale or hand-edited value can never put the plate out of sight by accident.
 */
export function cleanPlateFit(raw: unknown): PlateFit | undefined {
  const o = typeof raw === "string" ? fromEncoded(raw) : isRecord(raw) ? raw : undefined;
  if (!o) return undefined;
  const fit: PlateFit = {
    dx: level("dx", o.dx),
    dy: level("dy", o.dy),
    dz: level("dz", o.dz),
    tilt: level("tilt", o.tilt),
    yaw: level("yaw", o.yaw),
    scale: level("scale", o.scale),
    hidden: o.hidden === true,
  };
  return isDefault(fit) ? undefined : fit;
}

/** The text stored in a car's params; undefined (= remove the key) for a fit that changes nothing. */
export function encodePlateFit(fit: PlateFit | undefined): string | undefined {
  const f = fit && cleanPlateFit(fit);
  if (!f) return undefined;
  return [f.dx * 1000, f.dy * 1000, f.dz * 1000, f.tilt, f.yaw, f.scale * 100, f.hidden ? 1 : 0].map(Math.round).join(" ");
}

/** The fits a car carries itself. */
export function itemPlateFits(params: Record<string, number | string | boolean> | undefined): PlateFits {
  const out: PlateFits = {};
  for (const end of PLATE_ENDS) {
    const fit = cleanPlateFit(params?.[PLATE_FIT_KEY[end]]);
    if (fit) out[end] = fit;
  }
  return out;
}

/** Own fit first, then what was remembered for the model; per end, so a car moved at the back still follows the model's front. */
export function resolvePlateFits(own: PlateFits, model: PlateFits | undefined): PlateFits {
  const out: PlateFits = {};
  for (const end of PLATE_ENDS) {
    const fit = own[end] ?? model?.[end];
    if (fit) out[end] = fit;
  }
  return out;
}

/** What is remembered for a model: the real model's resource id, or the catalogue id while the car is the built-in shape (their geometry differs, so do the places). */
export const plateModelKey = (carId: string, resource: string | undefined): string => resource ?? carId;

const MODEL_KEY = /^[\w-]{1,64}$/;
const MAX_MODELS = 64; // keeps the setting tiny whatever is stored

export function cleanFits(raw: unknown): PlateFits {
  const o = isRecord(raw) ? raw : {};
  const out: PlateFits = {};
  for (const end of PLATE_ENDS) {
    const fit = cleanPlateFit(o[end]);
    if (fit) out[end] = fit;
  }
  return out;
}

/** A stored map of model key -> fits, checked entry by entry; keys that are not a model id and entries with nothing in them are dropped. */
export function cleanFitMap(raw: unknown): Record<string, PlateFits> {
  const entries = isRecord(raw) ? Object.entries(raw) : [];
  const kept: [string, PlateFits][] = [];
  for (const [key, value] of entries) {
    const fits = MODEL_KEY.test(key) ? cleanFits(value) : {};
    if (fits.front || fits.rear) kept.push([key, fits]);
    if (kept.length >= MAX_MODELS) break;
  }
  return Object.fromEntries(kept);
}

/** The remembered fits of a model (own properties only: a key like "constructor" is not a model). */
export const fitsOfModel = (map: Record<string, PlateFits>, key: string): PlateFits | undefined => (Object.hasOwn(map, key) ? map[key] : undefined);

/** Where the plate is drawn: the car-frame position, Euler angles (x, y, z) and size factor; `hidden` plates are not drawn. */
export type PlacedPlate = { end: PlateEnd; p: [number, number, number]; rot: [number, number, number]; scale: number; hidden: boolean };

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/**
 * The automatic mount moved by `fit`. The moves follow the plate's own axes (so "up" goes up a leaning tailgate and the front and the back both
 * read the same from outside); the tilt turns it about its own horizontal axis, top outward for a positive angle, and the yaw about its own vertical one.
 */
export function applyPlateFit(base: PlateMount, fit: PlateFit | undefined): PlacedPlate {
  if (!fit) return { end: base.end, p: base.p, rot: base.rot, scale: 1, hidden: false };
  const q = new Quaternion().setFromEuler(new Euler(...base.rot));
  const at = new Vector3(...base.p)
    .addScaledVector(X.clone().applyQuaternion(q), fit.dx)
    .addScaledVector(Y.clone().applyQuaternion(q), fit.dy)
    .addScaledVector(new Vector3(0, 0, 1).applyQuaternion(q), fit.dz);
  const rad = Math.PI / 180;
  q.multiply(new Quaternion().setFromAxisAngle(Y, fit.yaw * rad)).multiply(new Quaternion().setFromAxisAngle(X, fit.tilt * rad));
  const r = new Euler().setFromQuaternion(q, "XYZ");
  return { end: base.end, p: [at.x, at.y, at.z], rot: [r.x, r.y, r.z], scale: fit.scale, hidden: fit.hidden };
}

/** The dark holder a procedural car has behind its plate only fits while the plate stays about where it was (the holder is 56 x 17 cm, the plate 52 x 11). */
export const holderStays = (fit: PlateFit | undefined): boolean =>
  !fit || (!fit.hidden && Math.abs(fit.dx) <= 0.02 && Math.abs(fit.dy) <= 0.03 && Math.abs(fit.dz) <= 0.02 && Math.abs(fit.tilt) <= 5 && Math.abs(fit.yaw) <= 5 && fit.scale <= 1.05);
