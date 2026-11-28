// What a guest link may show of a plan, and of the home's live states. Pure: the server passes in the stored plan text's parsed value and gets back a copy with
// everything private taken out. An ALLOW-list of plan parts (a field added to the plan later stays private until it is listed here); per part, the fields that
// name a Home Assistant device are removed or, when the owner switched on "live states", replaced by made-up ids so the guest never learns the real ones.
import { isRecord } from "./guards.ts";
import { withMaterials } from "./planMaterials.ts";
import { mdiName } from "./mdi.ts";
import { iconsFor } from "./mdiPlan.ts";
import type { Building, GroundArea, GroundPath, Item, Level, Opening, Plan, Room, SlabVoid, Wall } from "./types.ts";
import type { Site } from "./siteTypes.ts";
import { sanitizeUtilities } from "./utilities.ts";

export type GuestOptions = {
  /** Keep where the home really is (coordinates, which way it faces, the real surroundings). Off by default. */
  location: boolean;
  /** Keep the device links, under made-up ids, so a read-only live state can be shown. Off by default. */
  live: boolean;
};

export type GuestPlan = {
  plan: Plan;
  /** made-up id ("light.g1") -> the real entity id. Stays on the server. */
  entities: Map<string, string>;
};

/** `light.kitchen_ceiling`: what a Home Assistant entity id looks like. Anything of that shape in a text the guest could read is dropped. */
const ENTITY_LIKE = /^[a-z][a-z0-9_]{0,40}\.[a-z0-9_]{1,100}$/;
const MAX_ENTITIES = 500;
const SAFE_PARAM_TEXT = /^[\w .#%+-]{0,40}$/;

/** The rows of a list in the stored plan. The stored plan is this server's own data, trusted like the owner's own screen is (the scene normalises it the same way). */
function rows<T extends object>(v: unknown): T[] {
  return Array.isArray(v) ? v.filter(isRecord).map((r) => r as T) : [];
}

/** One object of the stored plan (the building, the site), or undefined. Same trust as `rows`. */
const one = <T extends object>(v: unknown): T | undefined => (isRecord(v) ? (v as T) : undefined);

function makeAliaser(live: boolean) {
  const entities = new Map<string, string>();
  const byReal = new Map<string, string>();
  /** The made-up id for a real entity id (same one every time), or undefined when links are off or `real` is not an entity id. */
  const alias = (real: unknown): string | undefined => {
    if (!live || typeof real !== "string" || !ENTITY_LIKE.test(real)) return undefined;
    const known = byReal.get(real);
    if (known) return known;
    if (byReal.size >= MAX_ENTITIES) return undefined;
    const made = `${real.slice(0, real.indexOf("."))}.g${byReal.size + 1}`;
    byReal.set(real, made);
    entities.set(made, real);
    return made;
  };
  return { alias, entities };
}

/** Numbers, flags and short plain words only: a car's colour, a stair's width, never a device id or an address. */
function plainParams(params: Item["params"]): Item["params"] | undefined {
  if (!params) return undefined;
  const out: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!/^\w{1,32}$/.test(k)) continue;
    if (typeof v === "number" ? Number.isFinite(v) : typeof v === "boolean" || (typeof v === "string" && ((k === "icon" && mdiName(v) !== null) || (SAFE_PARAM_TEXT.test(v) && !ENTITY_LIKE.test(v))))) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A name that is only text: no markup characters, one line, short. React shows it escaped anyway; this keeps it harmless wherever else it might land (a page title, a label drawn in 3D). */
const plainText = (v: string): string => v.replace(/[\u0000-\u001f\u007f<>`"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const named = <T extends { name?: unknown }>(o: T): T => (typeof o.name === "string" ? { ...o, name: plainText(o.name) } : o);

type Alias = (real: unknown) => string | undefined;
const link = (alias: Alias, real: unknown): { entity?: string } => {
  const a = alias(real);
  return a ? { entity: a } : {};
};
const links = (alias: Alias, reals: unknown): string[] | undefined => {
  const out = (Array.isArray(reals) ? reals : []).flatMap((r) => alias(r) ?? []);
  return out.length ? out : undefined;
};

function guestItem(it: Item, alias: Alias): Item {
  const { entity, params, locked: _locked, ...rest } = it; // `locked` is an editing lock: meaningless to a viewer
  const p = plainParams(params);
  return { ...rest, ...link(alias, entity), ...(p ? { params: p } : {}) };
}

function guestRoom(r: Room, alias: Alias): Room {
  const { tempEntity, humidityEntity, presenceEntities, powerEntities, areas: _areas, ...rest } = r;
  const temp = alias(tempEntity);
  const humidity = alias(humidityEntity);
  const presence = links(alias, presenceEntities);
  const power = links(alias, powerEntities);
  return named({ ...rest, ...(temp ? { tempEntity: temp } : {}), ...(humidity ? { humidityEntity: humidity } : {}), ...(presence ? { presenceEntities: presence } : {}), ...(power ? { powerEntities: power } : {}) });
}

function guestOpening(o: Opening, alias: Alias): Opening {
  const { entity, ...rest } = o;
  return { ...rest, ...link(alias, entity) };
}

/**
 * The plan as a guest may see it: the building (walls, openings, rooms, furniture, levels, roof, ground, paths) and nothing else. Never included: scenes, notes and
 * measurements, power flows, the floor plan picture, the list of merged catalog additions. Included only with `location`: the real coordinates, orientation and surroundings.
 */
export function guestPlan(raw: unknown, opts: GuestOptions): GuestPlan {
  const p = isRecord(raw) ? raw : {};
  const { alias, entities } = makeAliaser(opts.live);
  const building = one<Building>(p.building);
  const site = opts.location ? one<Site>(p.site) : undefined;
  const utilities = sanitizeUtilities(p.utilities)?.map(({ name, ...line }) => ({ ...line, ...(name && !ENTITY_LIKE.test(name) ? { name } : {}) }));
  const plan: Plan = {
    walls: rows<Wall>(p.walls),
    openings: rows<Opening>(p.openings).map((o) => guestOpening(o, alias)),
    rooms: rows<Room>(p.rooms).map((r) => guestRoom(r, alias)),
    items: rows<Item>(p.items).map((i) => guestItem(i, alias)),
    ...(Array.isArray(p.levels) ? { levels: rows<Level>(p.levels).map(named) } : {}),
    ...(Array.isArray(p.voids) ? { voids: rows<SlabVoid>(p.voids).map(named) } : {}),
    ...(Array.isArray(p.ground) ? { ground: rows<GroundArea>(p.ground).map(named) } : {}),
    ...(Array.isArray(p.paths) ? { paths: rows<GroundPath>(p.paths).map(named) } : {}),
    ...(utilities?.length ? { utilities } : {}),
    ...(building ? { building: named(building) } : {}),
    ...(opts.location && typeof p.bearing === "number" ? { bearing: p.bearing } : {}),
    ...(site ? { site } : {}),
  };
  const icons = iconsFor(plan.items, p.icons); // the drawings of the hand-picked icons travel with the guest page: it never asks the icon service (and a guest-only server has no such route)
  return { plan: withMaterials(Object.keys(icons).length ? { ...plan, icons } : plan), entities }; // a texture reference of the stored plan is re-checked like any file: the guest page loads what it names
}

// ---- live states -------------------------------------------------------------------------------------------------------------------------------------

/** What a guest may be told a device is doing: words from a short list, or a plain number. Anything else (a title, a name, a place) is "unknown". */
const STATE_WORDS = /^(on|off|open|closed|opening|closing|locked|unlocked|home|not_home|playing|paused|idle|heat|cool|heat_cool|auto|dry|fan_only|heating|cooling|unavailable|unknown)$/;
const STATE_NUMBER = /^-?\d{1,9}(\.\d{1,3})?$/;
const NUMBER_ATTRIBUTES = ["brightness", "color_temp_kelvin", "current_temperature", "temperature", "current_humidity", "humidity", "current_position", "percentage"] as const;
const WORD = /^[a-z_%°/ ]{1,16}$/i;

export type GuestState = { entity_id: string; state: string; attributes: Record<string, number | string | number[]> };

/** Home Assistant's (already shaped) state list cut down to the made-up ids in `entities`: state words or numbers, a few numeric attributes and the unit; no names, pictures or titles. */
export function guestStates(entities: ReadonlyMap<string, string>, list: readonly unknown[]): Record<string, GuestState> {
  const byReal = new Map<string, unknown>();
  for (const e of list) if (isRecord(e) && typeof e.entity_id === "string") byReal.set(e.entity_id, e);
  const out: Record<string, GuestState> = {};
  for (const [made, real] of entities) {
    const e = byReal.get(real);
    if (!isRecord(e) || typeof e.state !== "string") continue;
    const attributes: GuestState["attributes"] = {};
    const a = isRecord(e.attributes) ? e.attributes : {};
    for (const k of NUMBER_ATTRIBUTES) if (typeof a[k] === "number" && Number.isFinite(a[k])) attributes[k] = a[k];
    const rgb = a.rgb_color;
    if (Array.isArray(rgb) && rgb.length === 3 && rgb.every((n) => typeof n === "number" && Number.isFinite(n))) attributes.rgb_color = rgb;
    if (typeof a.unit_of_measurement === "string" && WORD.test(a.unit_of_measurement)) attributes.unit_of_measurement = a.unit_of_measurement;
    if (typeof a.device_class === "string" && /^[a-z_]{1,32}$/.test(a.device_class)) attributes.device_class = a.device_class;
    out[made] = { entity_id: made, state: STATE_WORDS.test(e.state) || STATE_NUMBER.test(e.state) ? e.state : "unknown", attributes };
  }
  return out;
}
