// Pure validation for POST /api/ha/service: an allowlist of Home Assistant services with strict argument checks.
// Shared by the route (server) and its tests; contains no I/O.
import { errorMessage, isRecord } from "./guards.ts";

export type ServiceAttrs = Record<string, unknown>;
type Validated = { ok: true; domain: string; service: string; data: Record<string, unknown> } | { ok: false; error: string };

type Field = (v: unknown, attrs: ServiceAttrs) => unknown;

const fail = (m: string): never => {
  throw new Error(m);
};
const num = (name: string, lo: number, hi: number): Field => (v) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return fail(`${name} must be a number`);
  if (v < lo || v > hi) return fail(`${name} must be ${lo}..${hi}`);
  return v;
};
/** Number clamped by the entity's own limits when it reports them, else by the default range. */
const numAttr = (name: string, minKey: string, maxKey: string, lo: number, hi: number): Field => (v, attrs) => {
  const min = typeof attrs[minKey] === "number" ? (attrs[minKey] as number) : lo;
  const max = typeof attrs[maxKey] === "number" ? (attrs[maxKey] as number) : hi;
  return num(name, min, max)(v, attrs);
};
const oneOf = (name: string, listKey: string): Field => (v, attrs) => {
  if (typeof v !== "string" || !/^[a-z0-9_]{1,40}$/.test(v)) return fail(`${name} must be a plain identifier`);
  const list = attrs[listKey];
  if (Array.isArray(list) && !list.includes(v)) return fail(`${name} "${v}" is not offered by this entity`);
  return v;
};
/** A choice of a select entity: printable text that the entity itself lists in its `options` (so it cannot be set to anything else). */
const selectOption: Field = (v, attrs) => {
  const o = text("option", 100)(v, attrs);
  const list = attrs.options;
  if (!Array.isArray(list)) return fail("this entity does not list its options, so none can be chosen");
  return list.includes(o) ? o : fail(`option "${String(o)}" is not offered by this entity`);
};
const rgb: Field = (v) => {
  if (!Array.isArray(v) || v.length !== 3 || v.some((c) => typeof c !== "number" || !Number.isInteger(c) || c < 0 || c > 255)) return fail("rgb_color must be three integers 0..255");
  return v;
};
const hs: Field = (v) => {
  if (!Array.isArray(v) || v.length !== 2 || v.some((c) => typeof c !== "number" || !Number.isFinite(c))) return fail("hs_color must be [hue, saturation]");
  const [h, s] = v as number[];
  if (h < 0 || h > 360 || s < 0 || s > 100) return fail("hs_color must be [0..360, 0..100]");
  return [h, s];
};
const kelvin: Field = (v, attrs) => numAttr("color_temp_kelvin", "min_color_temp_kelvin", "max_color_temp_kelvin", 1500, 9000)(v, attrs);
const transition = num("transition", 0, 300);

const NONE: Record<string, Field> = {};

const bool = (name: string): Field => (v) => (typeof v === "boolean" ? v : fail(`${name} must be true or false`));
/** Printable text, no control characters. */
const text = (name: string, max: number): Field => (v) => {
  if (typeof v !== "string" || v.length === 0 || v.length > max) return fail(`${name} must be 1..${max} characters`);
  if (/[\u0000-\u001f\u007f]/.test(v)) return fail(`${name} must not contain control characters`);
  return v;
};
const choice = (name: string, allowed: readonly string[]): Field => (v) => (typeof v === "string" && allowed.includes(v) ? v : fail(`${name} must be one of ${allowed.join(", ")}`));

const MEDIA_CONTENT_TYPES = ["movie", "episode", "video", "tvshow", "music", "app", "channel", "playlist", "url"] as const;
/** Android TV remote key names `remote.send_command` may press. */
const REMOTE_COMMANDS = [
  "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT", "DPAD_CENTER", "BACK", "HOME", "MENU", "SEARCH", "POWER", "VOLUME_UP", "VOLUME_DOWN", "VOLUME_MUTE",
  "MEDIA_PLAY_PAUSE", "MEDIA_PLAY", "MEDIA_PAUSE", "MEDIA_STOP", "MEDIA_NEXT", "MEDIA_PREVIOUS", "MEDIA_REWIND", "MEDIA_FAST_FORWARD", "CHANNEL_UP", "CHANNEL_DOWN",
  "ENTER", "ESCAPE", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
] as const;
const remoteCommands: Field = (v) => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 8) return fail("command must be a list of 1..8 key names");
  for (const c of v) if (typeof c !== "string" || !(REMOTE_COMMANDS as readonly string[]).includes(c)) return fail(`command "${String(c)}" is not an allowed key`);
  return v;
};
const int = (name: string, lo: number, hi: number): Field => (v) => {
  const n = num(name, lo, hi)(v, {});
  return Number.isInteger(n) ? n : fail(`${name} must be a whole number`);
};
/** 1-20 distinct media_player entity ids (the players to group with). */
const mediaPlayers: Field = (v) => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 20 || v.some((x) => typeof x !== "string" || !/^media_player\.[a-z0-9_]+$/.test(x)) || new Set(v).size !== v.length) return fail("group_members must be 1-20 distinct media_player entity ids");
  return v;
};
/** A persistent notification id: letters, digits and _ . - only. */
const notificationId: Field = (v) => (typeof v === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(v) ? v : fail("notification_id must be 1-128 letters, digits, _ . or -"));

/** Like `text` but notes may span lines. */
const notes = (name: string, max: number): Field => (v) => {
  if (typeof v !== "string" || v.length === 0 || v.length > max) return fail(`${name} must be 1..${max} characters`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) return fail(`${name} must not contain control characters`);
  return v;
};
const DAY = 86_400_000;
const YEARS = [Date.UTC(2000, 0, 1), Date.UTC(2101, 0, 1)];
/** A real calendar date `YYYY-MM-DD` in 2000..2100. */
const isoDate = (name: string): Field => (v) => {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  const t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || new Date(t).toISOString().slice(0, 10) !== v || t < YEARS[0] || t >= YEARS[1]) return fail(`${name} must be a date like 2026-11-21`);
  return v;
};
/** `YYYY-MM-DD HH:MM[:SS]` or with a T, optionally with Z or an offset (+02:00). */
const isoDateTime = (name: string): Field => (v) => {
  const m = typeof v === "string" ? /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(v) : null;
  if (!m || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4] ?? 0) > 59) return fail(`${name} must be a date and time like 2026-11-21 14:00:00`);
  isoDate(name)(m[1], {});
  return v;
};
const instant = (v: unknown) => Date.parse(String(v).replace(" ", "T"));

/** Checks that look at several fields together, after each one passed on its own. They throw. */
const CHECKS: Record<string, (out: Record<string, unknown>) => void> = {
  "calendar.create_event": (o) => {
    const days = o.start_date !== undefined || o.end_date !== undefined;
    const times = o.start_date_time !== undefined || o.end_date_time !== undefined;
    if (days === times) return fail("give start_date and end_date, or start_date_time and end_date_time");
    if (days) {
      if (o.start_date === undefined || o.end_date === undefined) return fail("start_date and end_date go together");
      if (Date.parse(String(o.end_date)) <= Date.parse(String(o.start_date))) return fail("end_date must be after start_date");
      return;
    }
    if (o.start_date_time === undefined || o.end_date_time === undefined) return fail("start_date_time and end_date_time go together");
    const [s, e] = [String(o.start_date_time), String(o.end_date_time)];
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(s) !== /(Z|[+-]\d{2}:?\d{2})$/.test(e)) return fail("start_date_time and end_date_time must both have a UTC offset or both not");
    if (instant(e) <= instant(s)) return fail("end_date_time must be after start_date_time");
    if (instant(e) - instant(s) > 366 * DAY) return fail("an event can last a year at most");
  },
};

/** Fields that must be present for a service to make sense. */
const REQUIRED: Record<string, string[]> = {
  "climate.set_temperature": ["temperature"],
  "climate.set_hvac_mode": ["hvac_mode"],
  "climate.set_preset_mode": ["preset_mode"],
  "media_player.volume_set": ["volume_level"],
  "media_player.select_sound_mode": ["sound_mode"],
  "media_player.join": ["group_members"],
  "media_player.media_seek": ["seek_position"],
  "media_player.volume_mute": ["is_volume_muted"],
  "media_player.select_source": ["source"],
  "media_player.shuffle_set": ["shuffle"],
  "media_player.repeat_set": ["repeat"],
  "media_player.play_media": ["media_content_type", "media_content_id"],
  "humidifier.set_humidity": ["humidity"],
  "fan.set_percentage": ["percentage"],
  "cover.set_cover_position": ["position"],
  "remote.send_command": ["command"],
  "persistent_notification.dismiss": ["notification_id"],
  "calendar.create_event": ["summary"],
  "select.select_option": ["option"],
};

/** `domain.service` -> allowed data fields. Anything not listed is rejected. */
const SERVICES: Record<string, Record<string, Field>> = {
  "climate.set_temperature": { temperature: numAttr("temperature", "min_temp", "max_temp", 5, 35) },
  "climate.set_hvac_mode": { hvac_mode: oneOf("hvac_mode", "hvac_modes") },
  "climate.set_preset_mode": { preset_mode: oneOf("preset_mode", "preset_modes") },
  "light.turn_on": { brightness_pct: num("brightness_pct", 1, 100), rgb_color: rgb, hs_color: hs, color_temp_kelvin: kelvin, transition },
  "light.turn_off": { transition },
  "switch.turn_on": NONE,
  "switch.turn_off": NONE,
  "input_boolean.turn_on": NONE,
  "input_boolean.turn_off": NONE,
  "media_player.media_play": NONE,
  "media_player.media_pause": NONE,
  "media_player.media_next_track": NONE,
  "media_player.media_previous_track": NONE,
  "media_player.volume_set": { volume_level: num("volume_level", 0, 1) },
  "media_player.turn_on": NONE,
  "media_player.turn_off": NONE,
  "media_player.toggle": NONE,
  "media_player.media_stop": NONE,
  "media_player.media_seek": { seek_position: num("seek_position", 0, 86400) },
  "media_player.volume_mute": { is_volume_muted: bool("is_volume_muted") },
  "media_player.volume_up": NONE,
  "media_player.volume_down": NONE,
  "media_player.select_source": { source: text("source", 100) },
  "media_player.select_sound_mode": { sound_mode: text("sound_mode", 100) },
  "media_player.join": { group_members: mediaPlayers },
  "media_player.unjoin": NONE,
  "media_player.shuffle_set": { shuffle: bool("shuffle") },
  "media_player.repeat_set": { repeat: choice("repeat", ["off", "all", "one"]) },
  "media_player.play_media": { media_content_type: choice("media_content_type", MEDIA_CONTENT_TYPES), media_content_id: text("media_content_id", 500), enqueue: choice("enqueue", ["add", "next", "play", "replace"]) },
  "remote.turn_on": { activity: text("activity", 120) },
  "remote.turn_off": NONE,
  "remote.send_command": { command: remoteCommands, num_repeats: int("num_repeats", 1, 10), delay_secs: num("delay_secs", 0, 2) },
  "humidifier.turn_on": NONE,
  "humidifier.turn_off": NONE,
  "humidifier.set_humidity": { humidity: numAttr("humidity", "min_humidity", "max_humidity", 0, 100) },
  "fan.turn_on": NONE,
  "fan.turn_off": NONE,
  "fan.set_percentage": { percentage: num("percentage", 0, 100) },
  "cover.open_cover": NONE,
  "cover.close_cover": NONE,
  "cover.stop_cover": NONE,
  "cover.set_cover_position": { position: num("position", 0, 100) },
  // a shut-off valve (Home Assistant's valve domain), asked for by the pipes dialog after an explicit confirm; the entity must exist (see MUST_EXIST)
  "valve.close_valve": NONE,
  "valve.open_valve": NONE,
  // takes a notification id, not an entity (see ENTITYLESS)
  "persistent_notification.dismiss": { notification_id: notificationId },
  // a new event: summary, plus either start_date + end_date (all day, end exclusive) or start_date_time + end_date_time (see CHECKS)
  "calendar.create_event": {
    summary: text("summary", 200),
    description: notes("description", 2000),
    location: text("location", 200),
    start_date: isoDate("start_date"),
    end_date: isoDate("end_date"),
    start_date_time: isoDateTime("start_date_time"),
    end_date_time: isoDateTime("end_date_time"),
  },
  // WashData: a tap on Pause / Resume / Force end / Mark unloaded, and the program choice. Both are limited to WashData's own entities (see ONLY_ENTITIES).
  "button.press": NONE,
  "select.select_option": { option: selectOption },
};

/** Services that may only touch a certain family of entities, so a generic "press any button" can never restart a router or an ESPHome board. */
const ONLY_ENTITIES: Record<string, { pattern: RegExp; error: string }> = {
  "button.press": { pattern: /^button\.[a-z0-9_]+_(pause_cycle|resume_cycle|force_end_cycle|mark_unloaded)$/, error: "button.press is only allowed for a WashData appliance's pause, resume, force end and mark unloaded buttons" },
  "select.select_option": { pattern: /^select\.[a-z0-9_]+_cycle_program$/, error: "select.select_option is only allowed for a WashData appliance's cycle program" },
};

/** Services that act on something other than an entity: no entity_id is accepted or sent. */
const ENTITYLESS = "persistent_notification.dismiss";

/** A Home Assistant entity id: `domain.object_id`. */
export const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

/** Does validating this service need the entity's attributes (min/max, offered modes)? */
export const needsAttrs = (domain: string, service: string) =>
  Object.values(SERVICES[`${domain}.${service}`] ?? NONE).length > 0 && /^(climate|humidifier)\.|^light\.turn_on$|^select\.select_option$/.test(`${domain}.${service}`);

/** Services that are only sent for an entity Home Assistant knows: a typo or a deleted valve must be an error, never a call into the void that looks as if it worked. */
const MUST_EXIST: readonly string[] = ["valve.close_valve", "valve.open_valve", "switch.turn_off", "switch.turn_on"];
export const needsExisting = (domain: string, service: string) => MUST_EXIST.includes(`${domain}.${service}`);

export function validateService(body: unknown, attrs: ServiceAttrs = {}): Validated {
  const b: Record<string, unknown> = isRecord(body) ? body : {};
  const { domain, service, entity_id, data } = b;
  if (typeof domain !== "string" || typeof service !== "string") return { ok: false, error: "domain and service are required" };
  const fields = Object.hasOwn(SERVICES, `${domain}.${service}`) ? SERVICES[`${domain}.${service}`] : undefined;
  if (!fields) return { ok: false, error: `service ${domain}.${service} is not allowed` };
  const entityless = `${domain}.${service}` === ENTITYLESS;
  if (entityless ? entity_id !== undefined : typeof entity_id !== "string" || !ENTITY_ID.test(entity_id) || entity_id.split(".")[0] !== domain) return { ok: false, error: entityless ? `${ENTITYLESS} takes only a notification_id` : "entity_id must be a valid entity of the service's domain" };
  const only = ONLY_ENTITIES[`${domain}.${service}`];
  if (only && (typeof entity_id !== "string" || !only.pattern.test(entity_id))) return { ok: false, error: only.error };
  const raw = data ?? {};
  if (!isRecord(raw)) return { ok: false, error: "data must be an object" };
  const out: Record<string, unknown> = {};
  try {
    for (const [k, v] of Object.entries(raw)) {
      if (!Object.hasOwn(fields, k)) return { ok: false, error: `${domain}.${service} does not accept "${k}"` };
      out[k] = fields[k](v, attrs);
    }
    for (const k of REQUIRED[`${domain}.${service}`] ?? []) if (out[k] === undefined) return { ok: false, error: `${k} is required` };
    CHECKS[`${domain}.${service}`]?.(out);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  return { ok: true, domain, service, data: entityless ? out : { ...out, entity_id } };
}
