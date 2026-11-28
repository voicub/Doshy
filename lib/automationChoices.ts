// What the "Make it do something" sheet offers: which recipes fit the device it was opened from, and the devices of the plan each recipe field may pick. Pure.
import type { RecipeType } from "./automations.ts";
import { domainOf, type HAState } from "./ha.ts";
import { contacts, movableCover, sceneDevices } from "./sceneDevices.ts";
import type { Plan } from "./types.ts";

export type Option = { entity: string; name: string; room: string };

export type Choices = { contacts: Option[]; motion: Option[]; lights: Option[]; covers: Option[] };

const MOTION_CLASSES = ["motion", "occupancy", "presence"];

/** Every device of the plan a recipe may use, by what it is. */
export function automationChoices(plan: Plan, states: Record<string, HAState>): Choices {
  const devices = sceneDevices(plan, states);
  // only `light.*`: a smart switch behind a ceiling fixture is a plain switch to Home Assistant, and a recipe may not switch arbitrary switches off
  const pick = (kind: "light" | "cover"): Option[] => devices.filter((d) => d.kind === kind && d.entity.startsWith(kind === "light" ? "light." : "cover.")).map((d) => ({ entity: d.entity, name: d.name, room: d.room }));
  const motion: Option[] = [];
  const add = (entity: string | undefined, room: string) => {
    const st = entity ? states[entity] : undefined;
    if (!entity || !st || domainOf(entity) !== "binary_sensor" || !MOTION_CLASSES.includes(st.attributes.device_class ?? "") || motion.some((m) => m.entity === entity)) return;
    motion.push({ entity, name: st.attributes.friendly_name ?? entity, room });
  };
  for (const r of plan.rooms) for (const e of r.presenceEntities ?? []) add(e, r.name);
  for (const it of plan.items) {
    const room = plan.rooms.find((r) => !r.parent && it.x >= r.x && it.x <= r.x + r.w && it.y >= r.y && it.y <= r.y + r.h);
    add(it.entity, room?.name ?? "Elsewhere");
  }
  return {
    contacts: contacts(plan, states).map((c) => ({ entity: c.entity, name: c.name, room: c.room })),
    motion,
    lights: pick("light"),
    covers: pick("cover").filter((c) => movableCover(states[c.entity])),
  };
}

/** The recipes that make sense for the device the sheet was opened from, best first. With no device, all of them. */
export function recipesFor(entity: string | null, states: Record<string, HAState>): RecipeType[] {
  if (!entity) return ["open-after", "notify-open", "light-off-no-motion", "curtains-sun", "scene-at"];
  const st = states[entity];
  const domain = domainOf(entity);
  const dc = st?.attributes.device_class ?? "";
  if (domain === "binary_sensor" && MOTION_CLASSES.includes(dc)) return ["light-off-no-motion", "scene-at"];
  if (domain === "binary_sensor") return ["open-after", "notify-open", "scene-at"];
  if (domain === "light") return ["light-off-no-motion", "scene-at"];
  if (domain === "cover") return ["curtains-sun", "open-after", "notify-open", "scene-at"];
  return ["scene-at"];
}
