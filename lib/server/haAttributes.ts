// Home Assistant forwards whatever an integration put in an attribute: a thermostat that reports its temperature as the text "unavailable", a position as a string,
// a list that holds numbers. The dashboard trusts the types of `HAState` (a number is a number), so every attribute is checked here, once, on its way in; one that is
// not what the dashboard expects is dropped, like a missing one, which every reader already handles. Imports only a type and a pure module: the node test runner loads it.
import { isRecord } from "../guards.ts";
import { mdiName } from "../mdi.ts";
import type { HAState } from "../ha.ts";

type Kind = "text" | "number" | "flag" | "textOrNumber" | "flagOrNumber" | "texts" | "rgb" | "hs" | "position" | "mdi";

/** What each attribute of `HAState` must be. `satisfies` makes the compiler ask for a line here whenever the type gains an attribute. */
const KIND_OF = {
  friendly_name: "text", unit_of_measurement: "text", media_title: "text", media_artist: "text", source: "text", entity_picture: "text", media_series_title: "text",
  media_position_updated_at: "text", media_content_type: "text", app_name: "text", repeat: "text", sound_mode: "text", media_album_name: "text", current_activity: "text",
  hvac_action: "text", preset_mode: "text", device_class: "text", status: "text", fan_speed: "text", title: "text", installed_version: "text", latest_version: "text",
  release_url: "text", release_summary: "text", skipped_version: "text",
  brightness: "number", color_temp_kelvin: "number", min_color_temp_kelvin: "number", max_color_temp_kelvin: "number", current_temperature: "number", elevation: "number",
  azimuth: "number", latitude: "number", longitude: "number", temperature: "number", humidity: "number", wind_speed: "number", wind_bearing: "number", cloud_coverage: "number",
  volume_level: "number", media_duration: "number", media_position: "number", supported_features: "number", percentage: "number", current_position: "number",
  target_temp_step: "number", min_temp: "number", max_temp: "number", current_humidity: "number", min_humidity: "number", max_humidity: "number", x: "number", y: "number",
  battery_level: "number", update_percentage: "number",
  is_volume_muted: "flag", shuffle: "flag",
  media_season: "textOrNumber", media_episode: "textOrNumber",
  in_progress: "flagOrNumber",
  supported_color_modes: "texts", source_list: "texts", sound_mode_list: "texts", group_members: "texts", activity_list: "texts", hvac_modes: "texts", preset_modes: "texts", options: "texts",
  rgb_color: "rgb", hs_color: "hs",
  position: "position",
  pressure_unit: "text", pressure: "number",
  temperature_unit: "text",
  icon: "mdi",
} satisfies Record<keyof HAState["attributes"], Kind>;

const kindOf: Readonly<Record<string, Kind>> = KIND_OF;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** A number, or the number a text spells ("21.5": some integrations send numbers as text). */
const asNumber = (v: unknown): number | undefined => (finite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
const numbers = (v: unknown, count: number): number[] | undefined => (Array.isArray(v) && v.length === count && v.every(finite) ? v : undefined);

const check: Record<Kind, (v: unknown) => unknown> = {
  text: (v) => (typeof v === "string" ? v : undefined),
  number: asNumber,
  flag: (v) => (typeof v === "boolean" ? v : undefined),
  textOrNumber: (v) => (typeof v === "string" || finite(v) ? v : undefined),
  flagOrNumber: (v) => (typeof v === "boolean" || finite(v) ? v : undefined),
  texts: (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string") : undefined),
  rgb: (v) => numbers(v, 3),
  hs: (v) => numbers(v, 2),
  position: (v) => numbers(v, 2) ?? (isRecord(v) && finite(v.x) && finite(v.y) ? { x: v.x, y: v.y } : undefined),
  mdi: (v) => (mdiName(v) === null ? undefined : v), // only `mdi:` icons: another icon set's name is dropped like a missing attribute
};

/** The attribute as the dashboard's types promise it, or undefined (drop it) when it is not, or when the dashboard does not know the attribute. */
export function cleanAttribute(key: string, value: unknown): unknown {
  return Object.hasOwn(kindOf, key) ? check[kindOf[key]](value) : undefined;
}

/** Every attribute the dashboard can read (a forwarded list must stay inside it). */
export const KNOWN_ATTRIBUTES: readonly string[] = Object.keys(kindOf);
