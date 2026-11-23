// Browser-side client for our own /api/ha/* routes (the HA token never leaves the server).
import { REQUEST_TIMEOUT_MS, timedOut, within } from "./requestTimeout.ts";
export type HAState = {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    unit_of_measurement?: string;
    rgb_color?: [number, number, number];
    brightness?: number; // 0-255
    color_temp_kelvin?: number;
    current_temperature?: number;
    // sun.sun, weather.*, zone.home
    elevation?: number;
    azimuth?: number;
    latitude?: number;
    longitude?: number;
    temperature?: number;
    humidity?: number;
    wind_speed?: number; // km/h
    wind_bearing?: number;
    cloud_coverage?: number;
    // light
    supported_color_modes?: string[];
    min_color_temp_kelvin?: number;
    max_color_temp_kelvin?: number;
    hs_color?: [number, number];
    // media_player
    volume_level?: number;
    media_title?: string;
    media_artist?: string;
    source?: string;
    source_list?: string[];
    entity_picture?: string; // server-relative path: load it through mediaImageUrl(), never directly
    media_series_title?: string;
    media_season?: string | number;
    media_episode?: string | number;
    media_duration?: number; // seconds
    media_position?: number; // seconds, as of media_position_updated_at
    media_position_updated_at?: string;
    media_content_type?: string;
    app_name?: string;
    is_volume_muted?: boolean;
    shuffle?: boolean;
    repeat?: string;
    supported_features?: number; // media_player bitmask, see lib/media.ts
    sound_mode?: string;
    sound_mode_list?: string[];
    group_members?: string[];
    media_album_name?: string;
    // remote
    activity_list?: string[];
    current_activity?: string;
    percentage?: number; // fan
    current_position?: number; // cover
    // climate / humidifier
    hvac_action?: string;
    hvac_modes?: string[];
    preset_mode?: string;
    preset_modes?: string[];
    target_temp_step?: number;
    min_temp?: number;
    max_temp?: number;
    current_humidity?: number;
    min_humidity?: number;
    max_humidity?: number;
    device_class?: string;
    // vacuum (some integrations report where the robot is: `x`/`y`, or a `position` object / pair), camera
    x?: number;
    y?: number;
    position?: { x: number; y: number } | [number, number];
    battery_level?: number;
    status?: string;
    fan_speed?: string;
    // update.*
    title?: string;
    installed_version?: string;
    latest_version?: string;
    release_url?: string;
    release_summary?: string;
    in_progress?: boolean | number;
    update_percentage?: number;
    skipped_version?: string;
    // select.* (WashData's cycle program): the choices it offers
    options?: string[];
  };
  last_changed?: string;
};

export const TOGGLEABLE = ["light", "switch", "input_boolean", "fan", "cover", "media_player", "automation", "humidifier", "climate", "vacuum", "remote", "water_heater"];
const ACTIVE_STATES = ["on", "playing", "heat", "cool", "heat_cool", "auto", "dry", "fan_only", "open", "cleaning", "buffering"];
/** A toggleable appliance that is currently running (switch on, speaker playing, climate heating, ...). */
export const isActive = (st?: HAState) => !!st && TOGGLEABLE.includes(domainOf(st.entity_id)) && ACTIVE_STATES.includes(st.state);
/** A door / window contact reading "open": a binary_sensor that is on, or a cover that is open / opening. Accepts a state object or its raw state string. */
export const isOpenState = (st?: HAState | string) => {
  const s = typeof st === "string" ? st : st?.state;
  return s === "on" || s === "open" || s === "opening";
};
export const domainOf = (entityId: string) => entityId.split(".")[0];

// The last list the server sent and its ETag: while Home Assistant reports nothing new the server answers an empty 304 instead of re-sending ~250 KB.
let known: { etag: string; list: HAState[] } | null = null;

/** The entity list. When nothing changed since the previous call it is the very same array (same entity objects), so memoised readers of one entity see no change. Gives up after `timeoutMs`. */
export async function fetchStates(fetchFn: typeof fetch = fetch, timeoutMs = REQUEST_TIMEOUT_MS): Promise<HAState[]> {
  try {
    const res = await fetchFn("/api/ha/states", { cache: "no-store", headers: known ? { "If-None-Match": known.etag } : undefined, signal: within(timeoutMs) });
    if (res.status === 304 && known) return known.list;
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    const list: HAState[] = await res.json();
    const etag = res.headers.get("etag");
    known = etag ? { etag, list } : null;
    return list;
  } catch (e) {
    throw timedOut(e) ? new Error("The dashboard server did not answer") : e;
  }
}

export async function toggleEntity(entityId: string) {
  const res = await fetch("/api/ha/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId }),
    signal: within(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
}

export type ServiceCall = { domain: string; service: string; entity_id?: string; data?: Record<string, unknown> };

/** Call an allowlisted Home Assistant service through our server (see lib/haService.ts for what is accepted). */
export async function callService(call: ServiceCall) {
  const res = await fetch("/api/ha/service", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(call),
    signal: within(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
}

/** Poster / thumbnail of a media_player, proxied by our server (the HA token never reaches the browser). Pass the entity's `entity_picture` as `v` to refetch when the artwork changes. */
export const mediaImageUrl = (entityId: string, v?: string) => `/api/ha/media-image?entity=${encodeURIComponent(entityId)}${v ? `&v=${encodeURIComponent(v)}` : ""}`;
