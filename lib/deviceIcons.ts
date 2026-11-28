// Custom icon of a linked device (`item.params.icon`): the small round marker drawn over it in the Live view. The list is curated (plain names, search words);
// components/ui/deviceIcons.ts maps each id to its drawing. Pure: the node test runner loads this file directly.
import { mdiName } from "./mdi.ts";

type DeviceIcon = { id: string; label: string; words: string };

export const DEVICE_ICONS: readonly DeviceIcon[] = [
  { id: "lightbulb", label: "Light bulb", words: "lamp light bulb led ceiling" },
  { id: "filament", label: "Filament bulb", words: "light bulb retro edison" },
  { id: "lamp", label: "Table lamp", words: "lamp light desk bedside" },
  { id: "pendant", label: "Hanging lamp", words: "pendant light ceiling chandelier" },
  { id: "fan", label: "Fan", words: "fan ventilation air hood extractor" },
  { id: "temperature", label: "Thermometer", words: "temperature thermostat climate heat" },
  { id: "hot", label: "Heating", words: "heater radiator warm hot" },
  { id: "cold", label: "Cooling", words: "cold ac air conditioner cool" },
  { id: "tv", label: "TV", words: "television screen tv media" },
  { id: "plug", label: "Plug", words: "socket outlet plug power switch" },
  { id: "charging", label: "Charger", words: "charger charging ev wallbox" },
  { id: "lock", label: "Lock", words: "lock door smart lock security" },
  { id: "unlocked", label: "Open lock", words: "unlocked lock open" },
  { id: "door", label: "Door", words: "door entrance" },
  { id: "door-open", label: "Open door", words: "door open" },
  { id: "garage", label: "Garage", words: "garage gate door" },
  { id: "camera", label: "Camera", words: "camera security cctv" },
  { id: "video", label: "Video camera", words: "video camera doorbell" },
  { id: "bell", label: "Bell", words: "bell doorbell notification" },
  { id: "alarm-bell", label: "Ringing bell", words: "alarm bell ring" },
  { id: "siren", label: "Siren", words: "siren alarm alert" },
  { id: "water", label: "Water", words: "water drop leak tap" },
  { id: "humidity", label: "Humidity", words: "humidity dehumidifier humidifier moisture" },
  { id: "flame", label: "Flame", words: "fire flame smoke stove boiler gas" },
  { id: "snow", label: "Snowflake", words: "snow cold freezer frost" },
  { id: "wind", label: "Wind", words: "wind air breeze" },
  { id: "sun", label: "Sun", words: "sun solar daylight" },
  { id: "moon", label: "Moon", words: "moon night sleep" },
  { id: "cloud", label: "Cloud", words: "cloud weather" },
  { id: "bolt", label: "Lightning", words: "power energy electric lightning" },
  { id: "battery", label: "Battery", words: "battery storage" },
  { id: "car", label: "Car", words: "car vehicle" },
  { id: "car-simple", label: "Car (side)", words: "car vehicle parking" },
  { id: "bike", label: "Bicycle", words: "bike bicycle" },
  { id: "washer", label: "Washing machine", words: "washer washing machine laundry dryer" },
  { id: "oven", label: "Oven", words: "oven cooker stove hob kitchen" },
  { id: "toilet", label: "Toilet", words: "toilet wc bathroom" },
  { id: "bath", label: "Bathtub", words: "bath bathtub bathroom" },
  { id: "shower", label: "Shower", words: "shower bathroom" },
  { id: "bed", label: "Bed", words: "bed bedroom sleep" },
  { id: "armchair", label: "Armchair", words: "armchair chair seat" },
  { id: "sofa", label: "Sofa", words: "sofa couch living room" },
  { id: "desk", label: "Desk", words: "desk office table" },
  { id: "monitor", label: "Monitor", words: "monitor screen display pc computer" },
  { id: "laptop", label: "Laptop", words: "laptop computer" },
  { id: "printer", label: "Printer", words: "printer 3d print" },
  { id: "wifi", label: "Wi-Fi", words: "wifi router network internet" },
  { id: "speaker", label: "Speaker", words: "speaker audio echo alexa sound" },
  { id: "music", label: "Music", words: "music media player" },
  { id: "radio", label: "Radio", words: "radio audio" },
  { id: "robot", label: "Robot", words: "robot vacuum cleaner mower" },
  { id: "plant", label: "Plant", words: "plant garden watering" },
  { id: "flower", label: "Flower", words: "flower garden" },
  { id: "tree", label: "Tree", words: "tree garden outdoor" },
  { id: "leaf", label: "Leaf", words: "leaf eco green" },
  { id: "gauge", label: "Gauge", words: "gauge meter reading sensor" },
  { id: "power", label: "Power button", words: "power on off button switch" },
  { id: "solar", label: "Solar panel", words: "solar panel photovoltaic pv" },
  { id: "solar-roof", label: "Solar roof", words: "solar roof inverter" },
  { id: "house", label: "House", words: "house home" },
  { id: "home-line", label: "Home outline", words: "house home presence" },
  { id: "windmill", label: "Wind turbine", words: "windmill turbine wind energy" },
  { id: "key", label: "Key", words: "key access" },
  { id: "shield", label: "Shield", words: "shield security alarm panel" },
  { id: "shield-ok", label: "Shield (ok)", words: "shield armed secure" },
  { id: "eye", label: "Eye", words: "eye motion presence sensor" },
  { id: "person", label: "Person", words: "person presence people" },
  { id: "paw", label: "Paw", words: "pet paw animal" },
  { id: "dog", label: "Dog", words: "dog pet" },
  { id: "cat", label: "Cat", words: "cat pet litter feeder" },
  { id: "bird", label: "Bird", words: "bird chicken coop" },
  { id: "fish", label: "Fish", words: "fish aquarium tank" },
  { id: "coffee", label: "Coffee", words: "coffee machine kitchen" },
  { id: "pot", label: "Cooking pot", words: "pot cook kitchen" },
  { id: "knife", label: "Kitchen", words: "knife kitchen" },
  { id: "alarm", label: "Alarm clock", words: "alarm clock wake" },
  { id: "clock", label: "Clock", words: "clock time schedule" },
  { id: "timer", label: "Timer", words: "timer countdown" },
  { id: "calendar", label: "Calendar", words: "calendar date" },
  { id: "waves", label: "Waves", words: "waves pool water" },
  { id: "sliders", label: "Sliders", words: "sliders dimmer control" },
  { id: "switch", label: "Switch", words: "toggle switch on off" },
  { id: "gear", label: "Gear", words: "gear settings machine" },
  { id: "wrench", label: "Wrench", words: "wrench tool repair" },
  { id: "package", label: "Package", words: "package parcel delivery" },
  { id: "mailbox", label: "Mailbox", words: "mailbox post letter" },
  { id: "trash", label: "Bin", words: "trash bin waste garbage" },
  { id: "basket", label: "Basket", words: "basket laundry" },
  { id: "gift", label: "Gift", words: "gift present" },
  { id: "wine", label: "Wine", words: "wine fridge drink" },
];

const BY_ID = new Map(DEVICE_ICONS.map((i) => [i.id, i]));
export const iconLabel = (id: unknown): string | undefined => (typeof id === "string" ? BY_ID.get(id)?.label : undefined);
/** The picked icon id of an item's params, when it is one we know (a stale or hand-edited value counts as none). */
export const iconOf = (params: Record<string, number | string | boolean> | undefined): string | undefined => (typeof params?.icon === "string" && BY_ID.has(params.icon) ? params.icon : undefined);
/** The Material Design icon a manual choice names (`params.icon` = `mdi:lamp` gives `lamp`), or undefined. Kept apart from `iconOf`: those draw from the dashboard's own set. */
export const mdiOf = (params: Record<string, number | string | boolean> | undefined): string | undefined => mdiName(params?.icon) ?? undefined;

/** Icons matching what was typed: every word must appear in the name or the search words (case-insensitive); name matches first. */
export function searchIcons(query: string): readonly DeviceIcon[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return DEVICE_ICONS;
  const hit = (i: DeviceIcon) => words.every((w) => `${i.label} ${i.words}`.toLowerCase().includes(w));
  return DEVICE_ICONS.filter(hit).sort((a, b) => Number(words.every((w) => b.label.toLowerCase().includes(w))) - Number(words.every((w) => a.label.toLowerCase().includes(w))));
}

/** The params with the icon set (or removed with `undefined`), every other key kept. */
export function withIcon(params: Record<string, number | string | boolean> | undefined, icon: string | undefined): Record<string, number | string | boolean> | undefined {
  const rest = Object.fromEntries(Object.entries(params ?? {}).filter(([k]) => k !== "icon"));
  const next = icon && (BY_ID.has(icon) || mdiName(icon)) ? { ...rest, icon } : rest;
  return Object.keys(next).length ? next : undefined;
}
