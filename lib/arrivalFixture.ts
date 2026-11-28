// A small made-up house with a garden and the states Home Assistant would report for it, shared by the arrival tests. Not used by the app.
// A front door in the west wall of the hall, a living room east of the hall, a kitchen east of that, and a study south of the hall that is NOT connected to the hall: its only door
// opens into the living room. So the study is close on the map and far on foot. Garden lamps stand west of the front door. Coordinates are plan metres.
import type { HAState } from "./ha.ts";
import { STATES as BASE } from "./sceneFixture.ts";
import type { Item, Opening, Plan, Room, Wall } from "./types.ts";

const room = (id: string, name: string, x: number, y: number, w: number, h: number): Room => ({ id, name, x, y, w, h, color: "#888888", floor: "wood" });
const wall = (id: string, ax: number, ay: number, bx: number, by: number, style: Wall["style"] = "plaster"): Wall => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, style });
const door = (id: string, wallId: string, t: number): Opening => ({ id, wallId, t, width: 0.9, type: "door", sill: 0, height: 2.1 });
// a catalog kind that does not exist: the walking grid ignores it, so a lamp never blocks a path
const lamp = (id: string, entity: string, x: number, y: number): Item => ({ id, kind: "test_light", x, y, rot: 0, w: 0.3, d: 0.3, h: 0.3, entity });

export const HOUSE: Plan = {
  rooms: [room("hall", "Hall", 0, 0, 3, 4), room("study", "Study", 0, 4.12, 3, 4), room("liv", "Living room", 3.12, 0, 5, 8.12), room("kit", "Kitchen", 8.24, 0, 4, 4)],
  walls: [
    wall("w_front", -0.06, 0, -0.06, 4),
    wall("w_hall_liv", 3.06, 0, 3.06, 8.12),
    wall("w_liv_kit", 8.18, 0, 8.18, 4),
    wall("w_hall_study", 0, 4.06, 3, 4.06),
    wall("w_gate", -8, -3, -8, 7, "fence_picket"),
  ],
  openings: [door("front", "w_front", 0.5), door("hall_liv", "w_hall_liv", 0.25), door("study_liv", "w_hall_liv", 0.75), door("liv_kit", "w_liv_kit", 0.5), door("gate", "w_gate", 0.5)],
  items: [
    lamp("l1", "light.hall", 1.5, 2),
    lamp("l2", "light.study", 1.5, 6),
    lamp("l3", "light.living", 5.5, 2),
    lamp("l4", "light.kitchen", 10, 2),
    lamp("l5", "light.path_far", -6, 2),
    lamp("l6", "light.path_near", -3, 2),
    lamp("l7", "light.hall", 2, 3), // the same light linked twice: it counts once
    { ...lamp("l8", "switch.hall_plug", 1, 1) }, // a plug is not a light
  ],
  paths: [{ id: "road", points: [{ x: -12, y: 2 }, { x: -9, y: 2 }], width: 4, kind: "asphalt", name: "Street" }],
};

const st = (entity_id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id, state, attributes: { friendly_name: entity_id.slice(entity_id.indexOf(".") + 1).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), ...attributes } });
const DIM = { supported_color_modes: ["brightness"], brightness: 200 };

export const ARRIVAL_STATES: Record<string, HAState> = {
  ...BASE,
  ...Object.fromEntries(
    [
      st("light.hall", "off", DIM),
      st("light.study", "off", DIM),
      st("light.living", "off", DIM),
      st("light.kitchen", "off", DIM),
      st("light.path_far", "off", DIM),
      st("light.path_near", "off", DIM),
      st("switch.hall_plug", "off"),
      st("person.anna", "home", { friendly_name: "Anna" }),
      st("person.sam", "not_home", { friendly_name: "Sam" }),
      st("zone.home", "1", { friendly_name: "Home" }),
      st("zone.gate", "0", { friendly_name: "Garden gate zone" }),
      st("sun.sun", "below_horizon", { elevation: -12 }),
      st("lock.front_door", "locked"),
      st("binary_sensor.front_door", "off", { device_class: "door", friendly_name: "Front door" }),
    ].map((s) => [s.entity_id, s]),
  ),
};
