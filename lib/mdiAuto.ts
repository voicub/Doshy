// "Device icons: From Home Assistant": which Material Design icon a linked entity gets when the owner has not picked one. Home Assistant's own dashboard takes the entity's
// `icon` attribute when there is one and otherwise a default by domain and device class (some change with the state: a door open or closed); this is the same idea as a plain table.
// Pure; the node test runner loads this file directly. Names are Material Design Icons names without the `mdi:` prefix.
import { iconOf, mdiOf } from "./deviceIcons.ts";
import { mdiName } from "./mdi.ts";

type Attrs = { icon?: unknown; device_class?: unknown };
type Pair = readonly [on: string, off: string];

/** Binary sensors by device class: [state on, state off]. Open/closed pairs follow what the sensor reports, like Home Assistant's own icons. */
const BINARY: Record<string, Pair> = {
  battery: ["battery-alert", "battery"], battery_charging: ["battery-charging", "battery"], carbon_monoxide: ["molecule-co", "check-circle"], cold: ["snowflake", "thermometer"],
  connectivity: ["check-network-outline", "close-network-outline"], door: ["door-open", "door-closed"], garage_door: ["garage-open", "garage"], gas: ["gas-cylinder", "check-circle"],
  heat: ["fire", "thermometer"], light: ["brightness-5", "brightness-5"], lock: ["lock-open", "lock"], moisture: ["water", "water-off"], motion: ["motion-sensor", "motion-sensor-off"],
  moving: ["arrow-right", "pause"], occupancy: ["home", "home-outline"], opening: ["square-outline", "square"], plug: ["power-plug", "power-plug-off"], power: ["lightning-bolt", "power-plug-off"],
  presence: ["home", "home-outline"], problem: ["alert-circle", "check-circle"], running: ["play", "stop"], safety: ["alert-circle", "check-circle"], smoke: ["smoke", "check-circle"],
  sound: ["music-note", "music-note-off"], tamper: ["alert-circle", "check-circle"], update: ["package-up", "package"], vibration: ["vibrate", "crop-portrait"], window: ["window-open", "window-closed"],
};

/** Sensors by device class (one icon each). */
const SENSOR: Record<string, string> = {
  apparent_power: "flash", aqi: "air-filter", battery: "battery", carbon_dioxide: "molecule-co2", carbon_monoxide: "molecule-co", current: "current-ac", date: "calendar", distance: "ruler",
  duration: "timer-outline", energy: "lightning-bolt", gas: "gas-cylinder", humidity: "water-percent", illuminance: "brightness-5", moisture: "water-percent", monetary: "cash", pm1: "molecule",
  pm10: "molecule", pm25: "molecule", power: "flash", power_factor: "angle-acute", pressure: "gauge", signal_strength: "wifi", speed: "speedometer", temperature: "thermometer",
  timestamp: "clock-outline", voltage: "sine-wave", volume: "car-coolant-level", water: "water", weight: "weight", wind_speed: "weather-windy",
};

/** Covers by device class: [open, closed]. */
const COVER: Record<string, Pair> = {
  awning: ["awning-outline", "awning"], blind: ["blinds-open", "blinds"], curtain: ["curtains", "curtains-closed"], damper: ["valve-open", "valve-closed"], door: ["door-open", "door-closed"],
  garage: ["garage-open", "garage"], gate: ["gate-open", "gate"], shade: ["roller-shade", "roller-shade-closed"], shutter: ["window-shutter-open", "window-shutter"], window: ["window-open", "window-closed"],
};

const MEDIA: Record<string, string> = { tv: "television", speaker: "speaker", receiver: "audio-video" };

/** One icon per domain (the ones that do not change with the state or the device class). */
const DOMAIN: Record<string, string> = {
  light: "lightbulb", switch: "toggle-switch", input_boolean: "toggle-switch", fan: "fan", climate: "thermostat", water_heater: "water-boiler", humidifier: "air-humidifier", vacuum: "robot-vacuum",
  camera: "video", alarm_control_panel: "shield-home", siren: "bullhorn", remote: "remote", scene: "palette", script: "script-text", automation: "robot", person: "account", device_tracker: "account",
  sun: "white-balance-sunny", weather: "weather-partly-cloudy", update: "package-up", button: "gesture-tap-button", number: "ray-vertex", select: "format-list-bulleted", valve: "valve",
  lawn_mower: "robot-mower", calendar: "calendar", input_number: "ray-vertex", input_select: "format-list-bulleted", lock: "lock", media_player: "cast", cover: "window-shutter", binary_sensor: "radiobox-marked",
  sensor: "eye",
};

const pick = (pair: Pair, on: boolean): string => (on ? pair[0] : pair[1]);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The Material Design icon (name only) for this entity, or undefined when there is none worth drawing instead of the marker the dashboard already has.
 * First the entity's own `icon` attribute (only `mdi:` ones: Home Assistant also has `hass:` and custom sets, which this does not carry); then a default by domain and device class.
 * With `attributeOnly` only the first (a sensor badge keeps its own reading-based icon unless Home Assistant names one).
 */
export function autoIconName(entityId: string, state: string, attrs: Attrs, attributeOnly = false): string | undefined {
  const given = mdiName(attrs.icon);
  if (given || attributeOnly) return given ?? undefined;
  const domain = entityId.slice(0, entityId.indexOf("."));
  const cls = text(attrs.device_class);
  if (domain === "binary_sensor") {
    const pair = Object.hasOwn(BINARY, cls) ? BINARY[cls] : undefined;
    return pair ? pick(pair, state === "on") : state === "on" ? "radiobox-marked" : "radiobox-blank";
  }
  if (domain === "cover") {
    const pair = Object.hasOwn(COVER, cls) ? COVER[cls] : undefined;
    const open = state === "open" || state === "opening";
    return pair ? pick(pair, open) : open ? "window-shutter-open" : "window-shutter";
  }
  if (domain === "lock") return state === "unlocked" || state === "open" || state === "opening" ? "lock-open-variant" : "lock";
  if (domain === "sensor") return Object.hasOwn(SENSOR, cls) ? SENSOR[cls] : DOMAIN.sensor;
  if (domain === "media_player") return Object.hasOwn(MEDIA, cls) ? MEDIA[cls] : DOMAIN.media_player;
  if (domain === "switch" && cls === "outlet") return "power-plug";
  return Object.hasOwn(DOMAIN, domain) ? DOMAIN[domain] : undefined;
}

type Params = Record<string, number | string | boolean> | undefined;
/** What a linked device's marker shows: the owner's own pick always wins (one of Doshy's icons, or a Material Design icon); otherwise, with "From Home Assistant", the automatic icon (`mdi`). */
export function iconChoice(params: Params, entity: string | undefined, st: { state: string; attributes: Attrs } | undefined, source: "ha" | "doshy", attributeOnly = false): { own?: string; mdi?: string } {
  const own = iconOf(params);
  if (own) return { own };
  const picked = mdiOf(params);
  if (picked) return { mdi: picked };
  const auto = source === "ha" && entity && st ? autoIconName(entity, st.state, st.attributes, attributeOnly) : undefined;
  return auto ? { mdi: auto } : {};
}
