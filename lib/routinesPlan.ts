// Which devices of the active plan the routine finder reads, and which motion sensor belongs to which light (the one in the same room). Pure.
import { automationChoices } from "./automationChoices.ts";
import { DOMAIN_VERBS, domainOf } from "./deviceAction.ts";
import type { HAState } from "./ha.ts";
import type { Link } from "./routines.ts";
import { sceneDevices, type SceneDevice } from "./sceneDevices.ts";
import type { Plan } from "./types.ts";

/** Most devices and sensors read in one scan: the server accepts 150, and a plan linking more than that is read in part rather than not at all. */
const MAX_DEVICES = 120;
const MAX_SENSORS = 30;

export type RoutinePlan = {
  /** the devices a routine may act on, by entity id */
  devices: Map<string, SceneDevice>;
  /** everything to read: the devices and the motion sensors that give them context */
  entities: string[];
  links: Link[];
};

export function routinePlan(plan: Plan, states: Record<string, HAState>): RoutinePlan {
  const list = sceneDevices(plan, states).filter((d) => Object.hasOwn(DOMAIN_VERBS, domainOf(d.entity))).slice(0, MAX_DEVICES);
  const devices = new Map(list.map((d) => [d.entity, d]));
  const motion = automationChoices(plan, states).motion.slice(0, MAX_SENSORS);
  const links: Link[] = [];
  for (const d of list) {
    const sensor = domainOf(d.entity) === "light" ? motion.find((m) => m.room === d.room) : undefined;
    if (sensor) links.push({ light: d.entity, motion: sensor.entity });
  }
  const sensors = [...new Set(links.map((l) => l.motion))];
  return { devices, entities: [...list.map((d) => d.entity), ...sensors], links };
}
