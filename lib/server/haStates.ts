// What GET /api/ha/states sends: Home Assistant's entity list cut down to the attributes the dashboard renders, serialised once, with an ETag.
// The browser polls every few seconds; one fetch from Home Assistant per second serves every browser, and an unchanged list costs a 304.
import { createHash } from "node:crypto";
import { isRecord } from "../guards.ts";
import { cleanAttribute } from "./haAttributes.ts";
import { ttlCache, type TtlCache } from "./ttlCache.ts";

// 1000+ entities: forward only the attributes the dashboard renders.
const KEEP = [
  "friendly_name", "unit_of_measurement", "rgb_color", "brightness", "color_temp_kelvin", "current_temperature",
  "elevation", "azimuth", "latitude", "longitude", "temperature", "humidity", "wind_speed", "wind_bearing", "cloud_coverage", // sun.sun, weather.*, zone.home
  "supported_color_modes", "min_color_temp_kelvin", "max_color_temp_kelvin", "hs_color", "volume_level", "media_title", "media_artist", "source", "percentage", "current_position", // light, media_player, fan, cover
  "hvac_action", "hvac_modes", "preset_mode", "preset_modes", "target_temp_step", "min_temp", "max_temp", "current_humidity", "min_humidity", "max_humidity", "device_class", // climate, humidifier, binary_sensor
];

// Now-playing details only matter for players and remotes; keeping them off the other 1000+ entities keeps the payload small.
const MEDIA_KEEP = [
  "entity_picture", "media_series_title", "media_season", "media_episode", "media_duration", "media_position", "media_position_updated_at", "media_content_type",
  "app_name", "source_list", "is_volume_muted", "shuffle", "repeat", "activity_list", "current_activity",
  "supported_features", "sound_mode", "sound_mode_list", "group_members", "media_album_name",
];

// A robot vacuum may report where it is; the 3D scene drives the robot from it when it does.
const VACUUM_KEEP = ["x", "y", "position", "battery_level", "status", "fan_speed"];

// update.* entities feed the Updates panel (53 of them here, so only these keys).
const UPDATE_KEEP = ["title", "installed_version", "latest_version", "release_url", "release_summary", "in_progress", "update_percentage", "skipped_version", "entity_picture"];

// WashData's program picker (select.<name>_cycle_program) lists its choices; no other select needs them.
const SELECT_KEEP = ["options"];

// Each list is built once (the same for every entity of its kind), not once per entity per request.
const WITH_MEDIA = [...KEEP, ...MEDIA_KEEP];
const WITH_VACUUM = [...KEEP, ...VACUUM_KEEP];
const WITH_UPDATE = [...KEEP, ...UPDATE_KEEP];
const WITH_SELECT = [...KEEP, ...SELECT_KEEP];

/** The attributes worth forwarding for this entity. */
export function keepFor(entityId: string): readonly string[] {
  switch (entityId.slice(0, entityId.indexOf("."))) {
    case "media_player":
    case "remote":
      return WITH_MEDIA;
    case "vacuum":
      return WITH_VACUUM;
    case "update":
      return WITH_UPDATE;
    case "select":
      return /^select\..+_cycle_program$/.test(entityId) ? WITH_SELECT : KEEP;
    default:
      return KEEP;
  }
}

type ShapedState = { entity_id: string; state: string; last_changed?: string; attributes: Record<string, unknown> };

/** Home Assistant's `/api/states` list reduced to what the dashboard needs, each attribute checked against the type the dashboard expects (lib/server/haAttributes.ts).
 *  An entry without a text id and state is skipped. Throws when it is not a list. */
export function shapeStates(all: unknown): ShapedState[] {
  if (!Array.isArray(all)) throw new Error("Home Assistant sent something unexpected");
  return all.flatMap((e: unknown) => {
    if (!isRecord(e) || typeof e.entity_id !== "string" || typeof e.state !== "string") return [];
    const attributes = isRecord(e.attributes) ? e.attributes : {};
    const kept: Record<string, unknown> = {};
    for (const k of keepFor(e.entity_id)) {
      const v = cleanAttribute(k, attributes[k]);
      if (v !== undefined) kept[k] = v;
    }
    return [{ entity_id: e.entity_id, state: e.state, last_changed: typeof e.last_changed === "string" ? e.last_changed : undefined, attributes: kept }];
  });
}

/** The reply body (JSON text) and its validator. */
type Snapshot = { body: string; etag: string };

export function snapshotOf(all: unknown): Snapshot {
  const body = JSON.stringify(shapeStates(all));
  return { body, etag: `"${createHash("sha1").update(body).digest("base64url")}"` };
}

/** Does an `If-None-Match` header name this ETag? (The header may list several, or be `*`.) */
export const etagMatches = (header: string | null, etag: string): boolean => !!header && (header.trim() === "*" || header.split(",").some((t) => t.trim().replace(/^W\//, "") === etag));

const STATES_TTL_MS = 1000;
const g = globalThis as typeof globalThis & { __houseyStates?: TtlCache<Snapshot> };
// On globalThis so the routes that change things (service, toggle) and the one that reads share it, also across Next dev's hot reloads.
const cache = (g.__houseyStates ??= ttlCache<Snapshot>(STATES_TTL_MS, 1));

/** The current entity list, at most a second old; concurrent callers share one fetch from Home Assistant. */
export const statesSnapshot = (load: () => Promise<unknown>): Promise<Snapshot> => cache.get("states", async () => snapshotOf(await load()));

/** Something just changed in Home Assistant: the next read must ask it again (the dashboard re-reads shortly after a toggle). */
export const forgetStates = (): void => cache.clear();
