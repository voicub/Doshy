// Scenes: a named set of device targets ("Movie night": lights dim, curtains closed, TV on). They live in the plan (`plan.scenes`), so they survive export,
// import and duplicating a plan, and they are undoable like any other plan edit. Pure: no React, no network. The node test runner loads this file directly.
import { isRecord } from "./guards.ts";
import { ENTITY_ID } from "./haService.ts";
import type { Plan } from "./types.ts";

/** What a scene step can drive. Anything else (locks, alarms, garage doors, buttons) is deliberately not here. */
export const STEP_DOMAINS = ["light", "switch", "fan", "input_boolean", "cover", "media_player", "climate", "scene", "script"] as const;
export type StepDomain = (typeof STEP_DOMAINS)[number];

/**
 * One device's target. Which fields mean something depends on the device: a light takes `on`, `brightness` (percent), and a `kelvin` or an `rgb`; a cover a
 * `position` (0 closed .. 100 open); a speaker or TV `on` and `volume` (percent); a thermostat a `temperature`; a switch or fan `on`; a scene or script `run`.
 */
export type SceneStep = {
  entity: string;
  on?: boolean;
  brightness?: number;
  kelvin?: number;
  rgb?: [number, number, number];
  position?: number;
  volume?: number;
  temperature?: number;
  run?: true;
};

export const SCENE_ICONS = ["movie", "morning", "away", "bed", "dinner", "clean", "party", "guests", "custom"] as const;
export type SceneIcon = (typeof SCENE_ICONS)[number];

export type Scene = { id: string; name: string; icon: SceneIcon; steps: SceneStep[]; /** Room ids whose card shows a button for this scene. */ pin?: string[] };

export const MAX_SCENES = 40;
export const MAX_STEPS = 60;
export const NAME_MAX = 40;

const domainOf = (entity: string) => entity.slice(0, entity.indexOf("."));
const isStepDomain = (d: string): d is StepDomain => (STEP_DOMAINS as readonly string[]).includes(d);
const within = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);

/** One step read from untrusted JSON: only the fields its device understands survive, numbers are clamped; null when it is not a usable step. */
export function stepOf(raw: unknown): SceneStep | null {
  if (!isRecord(raw) || typeof raw.entity !== "string" || !ENTITY_ID.test(raw.entity) || raw.entity.length > 120) return null;
  const entity = raw.entity;
  const domain = domainOf(entity);
  if (!isStepDomain(domain)) return null;
  const on = typeof raw.on === "boolean" ? raw.on : undefined;
  const step: SceneStep = { entity };
  if (domain === "scene" || domain === "script") return { entity, run: true };
  if (domain === "cover") {
    const position = within(raw.position, 0, 100);
    return position !== undefined ? { entity, position: Math.round(position) } : on === undefined ? null : { entity, position: on ? 100 : 0 };
  }
  if (domain === "climate") {
    const temperature = within(raw.temperature, 5, 35);
    return temperature === undefined ? null : { entity, temperature: Math.round(temperature * 2) / 2 };
  }
  if (on !== undefined) step.on = on;
  if (domain === "light" && on !== false) {
    const brightness = within(raw.brightness, 1, 100);
    const kelvin = within(raw.kelvin, 1500, 9000);
    if (brightness !== undefined) step.brightness = Math.round(brightness);
    const c = raw.rgb;
    if (Array.isArray(c) && c.length === 3 && c.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255)) step.rgb = [c[0], c[1], c[2]];
    else if (kelvin !== undefined) step.kelvin = Math.round(kelvin);
  }
  if (domain === "media_player" && on !== false) {
    const volume = within(raw.volume, 0, 100);
    if (volume !== undefined) step.volume = Math.round(volume);
  }
  return step.on === undefined && Object.keys(step).length === 1 ? null : step;
}

/** One scene read from untrusted JSON (a saved plan, an imported file): a clean copy, or null. Steps for the same device collapse to the last one. */
export function sceneOf(raw: unknown): Scene | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.id) || typeof raw.name !== "string" || !Array.isArray(raw.steps)) return null;
  const name = raw.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX);
  if (!name) return null;
  const byEntity = new Map<string, SceneStep>();
  for (const s of raw.steps.slice(0, MAX_STEPS)) {
    const step = stepOf(s);
    if (step) byEntity.set(step.entity, step);
  }
  const icon = SCENE_ICONS.find((i) => i === raw.icon) ?? "custom";
  const pin = Array.isArray(raw.pin) ? raw.pin.filter((r): r is string => typeof r === "string" && r.length > 0 && r.length <= 40).slice(0, 40) : [];
  return { id: raw.id, name, icon, steps: [...byEntity.values()], ...(pin.length ? { pin } : {}) };
}

/** The scenes of a plan read from untrusted JSON: at most MAX_SCENES, ids unique. Undefined when there is nothing (a plan without scenes stays without the field). */
export function scenesOf(raw: unknown): Scene[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: Scene[] = [];
  for (const r of raw) {
    const s = sceneOf(r);
    if (!s || seen.has(s.id) || out.length >= MAX_SCENES) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/** A plan loaded from anywhere (storage, the server, a file): the scenes it carries are made valid, same plan object when they already are. */
export function withScenes(plan: Plan): Plan {
  if (plan.scenes === undefined) return plan;
  const clean = scenesOf(plan.scenes) ?? [];
  return JSON.stringify(clean) === JSON.stringify(plan.scenes) ? plan : { ...plan, scenes: clean };
}

/** The plan with this scene added (new id) or replaced (same id). An unusable scene leaves the plan as it is. */
export function saveSceneIn(plan: Plan, scene: Scene): Plan {
  const clean = sceneOf(scene);
  if (!clean) return plan;
  const list = plan.scenes ?? [];
  const next = list.some((s) => s.id === clean.id) ? list.map((s) => (s.id === clean.id ? clean : s)) : [...list, clean].slice(0, MAX_SCENES);
  return { ...plan, scenes: next };
}

export const removeSceneFrom = (plan: Plan, id: string): Plan => (plan.scenes?.some((s) => s.id === id) ? { ...plan, scenes: plan.scenes.filter((s) => s.id !== id) } : plan);

/** The same scene under a new id and a name that is not taken ("Movie night copy"). */
export function duplicateScene(scene: Scene, id: string, taken: readonly string[]): Scene {
  let name = `${scene.name} copy`.slice(0, NAME_MAX);
  for (let n = 2; taken.includes(name); n++) name = `${scene.name.slice(0, NAME_MAX - 4)} ${n}`;
  return { ...scene, id, name };
}

/** Pin or unpin a scene on a room's card. */
export function pinScene(plan: Plan, sceneId: string, roomId: string, pinned: boolean): Plan {
  const s = plan.scenes?.find((x) => x.id === sceneId);
  if (!s) return plan;
  const pin = (s.pin ?? []).filter((r) => r !== roomId);
  return saveSceneIn(plan, { ...s, pin: pinned ? [...pin, roomId] : pin });
}

/** The scenes shown on a room's card. */
export const pinnedIn = (plan: Plan, roomId: string): Scene[] => (plan.scenes ?? []).filter((s) => s.pin?.includes(roomId));

// ---- what a scene does ---------------------------------------------------------------------------------------------------------------------------------

/** One Home Assistant service call, in the shape POST /api/ha/scene and /api/ha/service take. */
export type SceneAction = { domain: string; service: string; entity_id: string; data?: Record<string, unknown> };

/** The service calls of one step (a speaker with a volume is two: on, then volume). */
export function stepActions(step: SceneStep): SceneAction[] {
  const { entity } = step;
  const domain = domainOf(entity);
  const call = (service: string, data?: Record<string, unknown>): SceneAction => ({ domain, service, entity_id: entity, ...(data ? { data } : {}) });
  switch (domain) {
    case "light": {
      if (step.on === false) return [call("turn_off")];
      const data = { ...(step.brightness !== undefined ? { brightness_pct: step.brightness } : {}), ...(step.rgb ? { rgb_color: step.rgb } : step.kelvin !== undefined ? { color_temp_kelvin: step.kelvin } : {}) };
      return [Object.keys(data).length ? call("turn_on", data) : call("turn_on")];
    }
    case "switch":
    case "fan":
    case "input_boolean":
      return [call(step.on === false ? "turn_off" : "turn_on")];
    case "cover":
      if (step.position === undefined) return [];
      return [step.position <= 0 ? call("close_cover") : step.position >= 100 ? call("open_cover") : call("set_cover_position", { position: step.position })];
    case "media_player":
      if (step.on === false) return [call("turn_off")];
      return [call("turn_on"), ...(step.volume !== undefined ? [call("volume_set", { volume_level: step.volume / 100 })] : [])];
    case "climate":
      return step.temperature === undefined ? [] : [call("set_temperature", { temperature: step.temperature })];
    case "scene":
    case "script":
      return [call("turn_on")];
    default:
      return [];
  }
}

export const sceneActions = (scene: Pick<Scene, "steps">): SceneAction[] => scene.steps.flatMap(stepActions);

/** The most calls one POST /api/ha/scene takes; a longer scene is sent in several. */
export const BATCH_MAX = 40;
export function inBatches<T>(list: readonly T[], size = BATCH_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
