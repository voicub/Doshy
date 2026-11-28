// The word-level helpers of the typed-command parser: cleaning the text, words for each kind of device, fuzzy name matching and number reading.
// Deterministic and offline (no model, no network). Pure; the node test runner loads this file directly.
import type { DeviceKind } from "./sceneDevices.ts";

/** Lower case, accents dropped, punctuation gone, `%` and `°` spelled out, numbers like 22.5 kept. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%/g, " percent ")
    .replace(/°/g, " degrees ")
    .replace(/['’`]/g, "")
    .replace(/(\d)[.,](\d)/g, "$1#$2")
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/#/g, ".")
    .replace(/\bwhats\b/g, "what is")
    .replace(/\s+/g, " ")
    .trim();
}

export const wordsOf = (normalised: string): string[] => (normalised ? normalised.split(" ") : []);

/** The words people use for each kind of device. */
export const KIND_WORDS: Record<DeviceKind, readonly string[]> = {
  light: ["light", "lights", "lamp", "lamps", "lighting", "bulb", "bulbs", "chandelier", "spotlight", "spotlights"],
  cover: ["curtain", "curtains", "blind", "blinds", "shade", "shades", "shutter", "shutters", "drape", "drapes", "awning", "awnings", "cover", "covers"],
  media: ["tv", "tvs", "television", "televisions", "telly", "speaker", "speakers", "music", "radio", "stereo", "soundbar", "player", "players"],
  climate: ["heating", "heater", "heaters", "thermostat", "thermostats", "temperature", "climate", "ac", "aircon", "radiator", "radiators", "hvac"],
  fan: ["fan", "fans"],
  switch: ["switch", "switches", "plug", "plugs", "socket", "sockets", "outlet", "outlets"],
};

export const KIND_NOUN: Record<DeviceKind, [string, string]> = {
  light: ["light", "lights"],
  cover: ["curtain", "curtains"],
  media: ["TV or speaker", "TVs and speakers"],
  climate: ["thermostat", "thermostats"],
  fan: ["fan", "fans"],
  switch: ["switch", "switches"],
};

export function kindsIn(words: readonly string[]): DeviceKind[] {
  return (Object.keys(KIND_WORDS) as DeviceKind[]).filter((k) => words.some((w) => KIND_WORDS[k].includes(w)));
}

/** Words that carry no meaning for finding a device or a room. */
export const FILLER = new Set(
  ("please pls can could you would will i want need to the a an of in on off at for my our me us it its is are be and or then now just also with from into onto by up down " +
    "turn switch put set make dim darken brighten brightness open close shut raise lower lift pull draw drop run start activate launch trigger play scene power flip kill " +
    "all every each everything everywhere whole house home room rooms area floor percent degrees degree celsius warmer cooler hotter colder " +
    "this that these those there here what which how any anything is it ").split(" "),
);

/** Spellings people use for room names that a plan may spell differently. */
export const ROOM_SYNONYMS: Record<string, string[]> = {
  "living room": ["lounge", "sitting room", "livingroom", "front room", "family room"],
  bedroom: ["bed room"],
  bathroom: ["bath", "toilet", "wc", "restroom", "washroom", "shower room"],
  kitchen: ["kitchenette"],
  hall: ["hallway", "entrance", "entry", "corridor"],
  office: ["study", "workroom", "work room"],
  garden: ["yard", "backyard", "outside"],
};

/** Edit distance, stopping early when it passes `max`. */
export function distance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Same word, allowing one slip in words of six letters or more ("bedrom", "kitchn"); shorter ones must match exactly ("light" is not "night"). */
export const sameWord = (a: string, b: string): boolean => a === b || (a.length >= 6 && b.length >= 6 && distance(a, b, 1) <= 1);

/** A plural and its singular count as the same word ("lamps" / "lamp"). */
export const stem = (w: string): string => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

export type Amount = { value: number; unit: "percent" | "degrees" | null };

/** The first number in the words: "30", "30 percent", "22.5 degrees", "half" (50 percent), "full" or "max" (100 percent). */
export function amountOf(words: readonly string[]): Amount | null {
  for (const [i, w] of words.entries()) {
    if (/^\d+(\.\d+)?$/.test(w)) {
      const next = words[i + 1];
      return { value: Number(w), unit: next === "percent" ? "percent" : next === "degrees" || next === "degree" || next === "celsius" || next === "c" ? "degrees" : null };
    }
    if (w === "half") return { value: 50, unit: "percent" };
    if (w === "full" || w === "max" || w === "maximum") return { value: 100, unit: "percent" };
  }
  return null;
}

/** "Turn on" or "turn off" as the words say it: the first on/off that follows a switching verb, else the first one; null when there is none. */
export function onOffOf(words: readonly string[]): boolean | null {
  const verb = words.findIndex((w) => ["turn", "switch", "put", "shut", "power", "flip", "kill"].includes(w));
  const from = verb >= 0 ? words.slice(verb + 1) : words;
  const hit = from.find((w) => w === "on" || w === "off");
  return hit === undefined ? (words.includes("kill") ? false : null) : hit === "on";
}

export const pluralise = (n: number, [one, many]: readonly [string, string]) => `${n} ${n === 1 ? one : many}`;
