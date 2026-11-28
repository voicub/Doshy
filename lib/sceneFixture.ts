// A small made-up home and the states Home Assistant would report for it, shared by the scene, automation and command-box tests. Not used by the app.
import type { HAState } from "./ha.ts";
import type { Item, Plan, Room } from "./types.ts";

const room = (id: string, name: string, x: number, y: number, extra: Partial<Room> = {}): Room => ({ id, name, x, y, w: 4, h: 4, color: "#888888", floor: "wood", ...extra });
const item = (id: string, entity: string, x: number, y: number): Item => ({ id, kind: "test_thing", x, y, rot: 0, w: 0.5, d: 0.5, h: 0.5, entity });

export const PLAN: Plan = {
  walls: [{ id: "w1", a: { x: 0, y: 9 }, b: { x: 4, y: 9 }, style: "plaster" }, { id: "w2", a: { x: 10, y: 0 }, b: { x: 10, y: 4 }, style: "plaster" }],
  openings: [{ id: "o1", wallId: "w1", t: 0.5, width: 1, type: "window", sill: 1, height: 1.2, entity: "binary_sensor.bathroom_window" }, { id: "o2", wallId: "w2", t: 0.5, width: 1, type: "window", sill: 1, height: 1.2, entity: "binary_sensor.kitchen_window" }],
  rooms: [
    room("bed", "Bedroom", 0, 0, { tempEntity: "sensor.bedroom_temperature" }),
    room("liv", "Living room", 5, 0, {}),
    room("kit", "Kitchen", 10, 0, {}),
    room("bath", "Bathroom", 0, 5, {}),
    room("mb", "Master bedroom", 0, 10, {}),
    room("kb", "Kids bedroom", 5, 10, {}),
  ],
  items: [
    item("i1", "light.bedroom_ceiling", 1, 1),
    item("i2", "light.bedroom_lamp", 3, 3),
    item("i3", "cover.bedroom_curtain", 2, 0.2),
    item("i4", "light.living_main", 6, 1),
    item("i5", "light.living_strip", 8, 3),
    item("i6", "cover.living_blind", 7, 0.2),
    item("i7", "media_player.living_tv", 9, 2),
    item("i8", "climate.living", 6, 3),
    item("i9", "light.kitchen_ceiling", 11, 1),
    item("i10", "light.desk_lamp", 12, 3),
    item("i11", "switch.server", 13, 3),
    item("i12", "cover.garage_door", 11, 3),
    item("i13", "light.bath_mirror", 1, 6),
    item("i14", "light.master_lamp", 1, 11),
    item("i15", "light.kids_lamp", 6, 11),
  ],
};

/** A state with the friendly name Home Assistant would make from the id ("light.desk_lamp" -> "Desk lamp"). */
const pretty = (id: string) => id.slice(id.indexOf(".") + 1).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const st = (entity_id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id, state, attributes: { friendly_name: pretty(entity_id), ...attributes } });
const DIM = { supported_color_modes: ["brightness"], brightness: 200 };
const TEMP = { supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500, brightness: 128, color_temp_kelvin: 3000 };

export const STATES: Record<string, HAState> = Object.fromEntries(
  [
    st("light.bedroom_ceiling", "on", TEMP),
    st("light.bedroom_lamp", "off", { supported_color_modes: ["onoff"] }),
    st("cover.bedroom_curtain", "open", { current_position: 100, device_class: "curtain" }),
    st("light.living_main", "on", { ...DIM, supported_color_modes: ["rgb", "color_temp"] }),
    st("light.living_strip", "off", DIM),
    st("cover.living_blind", "closed", { current_position: 0 }),
    st("media_player.living_tv", "off", { friendly_name: "Living room TV", volume_level: 0.3 }),
    st("climate.living", "heat", { temperature: 21, current_temperature: 20.4, min_temp: 7, max_temp: 30, target_temp_step: 0.5 }),
    st("light.kitchen_ceiling", "on", DIM),
    st("light.desk_lamp", "off", { ...DIM, friendly_name: "Desk lamp" }),
    st("switch.server", "on", { friendly_name: "Server" }),
    st("cover.garage_door", "closed", { device_class: "garage" }),
    st("light.bath_mirror", "off", DIM),
    st("light.master_lamp", "on", DIM),
    st("light.kids_lamp", "off", DIM),
    st("binary_sensor.bathroom_window", "off", { device_class: "window", friendly_name: "Bathroom window" }),
    st("binary_sensor.kitchen_window", "on", { device_class: "window", friendly_name: "Kitchen window" }),
    st("sensor.bedroom_temperature", "19.5", { unit_of_measurement: "°C" }),
    st("binary_sensor.hall_motion", "off", { device_class: "motion", friendly_name: "Hall motion" }),
    st("sun.sun", "above_horizon", { elevation: 40 }),
    st("scene.evening", "scening", {}),
  ].map((s) => [s.entity_id, s]),
);
