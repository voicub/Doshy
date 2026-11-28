// Starting points for the scene editor: each template picks sensible targets for the plan's own devices. They only pre-fill the editor; the person adjusts and saves.
// Pure. The node test runner loads this file directly.
import type { SceneDevice } from "./sceneDevices.ts";
import type { SceneIcon, SceneStep } from "./scenes.ts";

export type SceneTemplate = { id: SceneIcon; name: string; blurb: string };

export const TEMPLATES: readonly SceneTemplate[] = [
  { id: "movie", name: "Movie night", blurb: "Dim lights, close curtains, TV on" },
  { id: "morning", name: "Good morning", blurb: "Lights up, curtains open, warm house" },
  { id: "away", name: "Away", blurb: "Everything off, curtains closed" },
  { id: "bed", name: "Bedtime", blurb: "Lights off, curtains closed, cooler" },
  { id: "dinner", name: "Dinner", blurb: "Warm, low light where you eat" },
  { id: "clean", name: "Cleaning", blurb: "Full bright light, curtains open" },
  { id: "party", name: "Party", blurb: "Bright colour, music, curtains closed" },
  { id: "guests", name: "Guests", blurb: "Welcoming light and a comfy temperature" },
  { id: "custom", name: "Blank scene", blurb: "Start empty and pick every device yourself" },
];

type Look = { off: true } | { brightness: number; kelvin?: number; rgb?: [number, number, number] };

/** A light told to follow `look`, as far as that bulb can (a plain on/off bulb ignores brightness and colour). */
function lightStep(d: SceneDevice, look: Look): SceneStep {
  if ("off" in look) return { entity: d.entity, on: false };
  // a bulb that cannot dim cannot be "low": a dim look means off for it
  if (!d.dimmable && !d.colour && !d.kelvin && look.brightness < 50) return { entity: d.entity, on: false };
  const step: SceneStep = { entity: d.entity, on: true };
  if (d.dimmable) step.brightness = look.brightness;
  if (look.rgb && d.colour) step.rgb = look.rgb;
  else if (look.kelvin !== undefined && d.kelvin) step.kelvin = Math.min(d.kelvin[1], Math.max(d.kelvin[0], look.kelvin));
  return step;
}

const roomMatches = (d: SceneDevice, pattern: RegExp) => pattern.test(d.room);
const isTv = (d: SceneDevice) => /\b(tv|television)\b/i.test(d.name);

/** The targets a template suggests for these devices (empty for the blank template). */
export function templateSteps(id: SceneIcon, devices: readonly SceneDevice[]): SceneStep[] {
  const mediaRooms = new Set(devices.filter((d) => d.kind === "media").map((d) => d.room));
  const temp = (d: SceneDevice, t: number): SceneStep | null => (d.limits ? { entity: d.entity, temperature: Math.min(d.limits.max, Math.max(d.limits.min, t)) } : null);
  const cover = (d: SceneDevice, position: number): SceneStep => ({ entity: d.entity, position });
  const each = (f: (d: SceneDevice) => SceneStep | null): SceneStep[] => devices.flatMap((d) => f(d) ?? []);

  switch (id) {
    case "movie":
      return each((d) => {
        if (d.kind === "light") return lightStep(d, mediaRooms.has(d.room) ? { brightness: 15, kelvin: 2200 } : { off: true });
        if (d.kind === "cover") return cover(d, 0);
        return d.kind === "media" && isTv(d) ? { entity: d.entity, on: true } : null;
      });
    case "morning":
      return each((d) => (d.kind === "light" ? lightStep(d, { brightness: 60, kelvin: 4000 }) : d.kind === "cover" ? cover(d, 100) : d.kind === "climate" ? temp(d, 21) : null));
    case "away":
      return each((d) => (d.kind === "light" || d.kind === "fan" ? { entity: d.entity, on: false } : d.kind === "media" ? { entity: d.entity, on: false } : d.kind === "cover" ? cover(d, 0) : d.kind === "climate" ? temp(d, 17) : null));
    case "bed":
      return each((d) => (d.kind === "light" || d.kind === "media" ? { entity: d.entity, on: false } : d.kind === "cover" ? cover(d, 0) : d.kind === "climate" ? temp(d, 18) : null));
    case "dinner":
      return each((d) => (d.kind === "light" && roomMatches(d, /dining|kitchen|living|lounge/i) ? lightStep(d, { brightness: 45, kelvin: 2700 }) : null));
    case "clean":
      return each((d) => (d.kind === "light" ? lightStep(d, { brightness: 100, kelvin: 5000 }) : d.kind === "cover" ? cover(d, 100) : d.kind === "media" ? { entity: d.entity, on: false } : null));
    case "party":
      return each((d) => {
        if (d.kind === "light" && roomMatches(d, /living|lounge|kitchen|dining|party|garden|terrace|patio/i)) return lightStep(d, { brightness: 80, rgb: [255, 60, 200] });
        if (d.kind === "cover" && roomMatches(d, /living|lounge|kitchen|dining|party/i)) return cover(d, 0);
        return d.kind === "media" && !isTv(d) && roomMatches(d, /living|lounge|kitchen|dining|party|garden|terrace|patio/i) ? { entity: d.entity, on: true, volume: 40 } : null;
      });
    case "guests":
      return each((d) => {
        if (d.kind === "light" && roomMatches(d, /living|lounge|hall|entry|kitchen|bath|guest/i)) return lightStep(d, { brightness: 70, kelvin: 3000 });
        return d.kind === "cover" ? cover(d, 100) : d.kind === "climate" ? temp(d, 22) : null;
      });
    case "custom":
      return [];
  }
}
