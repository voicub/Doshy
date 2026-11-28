import type { Def, Part } from "./catalog";
import { withMaterials } from "./partsKit.ts";
import { BLACK, DARK, GREY, LGREY, STEEL, WHITE, WOOD, b, cx, cy, cz, sp } from "./partKit.ts";

// Home Assistant sensors as small devices, at their real size (3-10 cm). Every one carries a glowing LED (or display) so it stays readable:
// ItemMesh lights it in the colour of the linked sensor's state (lib/sensors.ts) and SensorFx adds the badge, radar rings, halo and drips.
// Wall / ceiling pieces: `wall: true` pieces hang on a wall (h = height of the top edge above the floor); kinds with "ceiling" hang from it (see lib/placement.ts).
const LED = "#8fdcff"; // idle tint: glow parts are recoloured at run time
const GLASSY = "#14171d";
const RADAR = "#2a2d33";

/** A small status LED (sphere), the minimum visible marker of every sensor. */
const led = (x: number, y: number, z: number, d = 0.012): Part => sp(x, y, z, d, LED, { glow: true });
/** A glowing strip: a display, a light bar. */
const bar = (x: number, y: number, z: number, w: number, h: number, depth = 0.004): Part => b(x, y, z, w, h, depth, LED, { glow: true });

const def = (label: string, w: number, d: number, h: number, parts: Part[], extra: Partial<Def> = {}): Def => ({ label, brand: "Generic", cat: "Sensors", w, d, h, parts, ...extra });

export const SENSORS: Record<string, Def> = {
  // ---- presence and motion
  sn_ceiling_presence: def("mmWave presence sensor (ceiling)", 0.11, 0.11, 2.6, [
    cy(0, 2.598, 0, 0.11, 0.004, "#dcdcd8"),
    cy(0, 2.58, 0, 0.1, 0.032, WHITE),
    cy(0, 2.562, 0, 0.075, 0.006, RADAR),
    led(0.036, 2.561, 0, 0.014),
  ]),
  sn_presence_wall: def("mmWave presence sensor (wall)", 0.09, 0.03, 1.6, [
    b(0, 1.555, 0, 0.09, 0.09, 0.03, WHITE),
    b(0, 1.56, 0.0155, 0.062, 0.062, 0.004, RADAR),
    led(0.03, 1.518, 0.0165, 0.012),
  ], { wall: true }),
  sn_pir_wall: def("Motion sensor (PIR, wall)", 0.06, 0.06, 2.0, [
    b(0, 1.96, -0.01, 0.06, 0.08, 0.04, WHITE),
    sp(0, 1.975, 0.012, 0.04, "#e8e6dc"),
    led(0, 1.93, 0.011, 0.01),
  ], { wall: true }),
  sn_pir_corner: def("Motion sensor (PIR, corner)", 0.07, 0.08, 2.35, [
    sp(0, 2.27, -0.025, 0.03, GREY),
    b(0, 2.3, 0.0, 0.05, 0.06, 0.05, WHITE, { r: [0.35, 0, 0] }),
    sp(0, 2.29, 0.03, 0.035, "#e8e6dc"),
    led(0.017, 2.325, 0.028, 0.01),
  ], { wall: true }),

  // ---- doors, windows, locks
  sn_contact: def("Door / window contact sensor", 0.07, 0.012, 2.08, [
    b(-0.024, 2.07, 0, 0.04, 0.02, 0.012, WHITE),
    b(0.026, 2.07, 0, 0.02, 0.02, 0.012, WHITE),
    led(-0.036, 2.07, 0.0065, 0.008),
  ], { wall: true }),
  sn_lock: def("Smart door lock", 0.07, 0.05, 1.14, [
    cz(0, 1.1, 0, 0.065, 0.05, "#2a2d33"),
    cz(0, 1.1, 0.026, 0.068, 0.006, STEEL),
    b(0, 1.1, 0.032, 0.032, 0.012, 0.008, LGREY),
    led(0, 1.128, 0.03, 0.01),
  ], { wall: true }),
  sn_garage_tilt: def("Garage door tilt sensor", 0.035, 0.02, 2.0, [
    b(0, 1.975, 0, 0.035, 0.05, 0.02, WHITE),
    led(0, 1.99, 0.0105, 0.01),
  ], { wall: true }),
  sn_fridge_door: def("Fridge door sensor", 0.07, 0.02, 1.76, [
    b(-0.02, 1.74, 0, 0.035, 0.04, 0.02, WHITE),
    b(0.026, 1.74, 0, 0.02, 0.03, 0.02, WHITE),
    led(-0.02, 1.758, 0.0105, 0.01),
  ], { wall: true }),
  sn_mailbox: def("Mailbox sensor", 0.34, 0.16, 0.28, [
    b(0, 0.05, 0, 0.05, 0.1, 0.05, WOOD),
    b(0, 0.17, 0, 0.34, 0.14, 0.16, "#9aa0a6"),
    b(0, 0.25, 0, 0.34, 0.02, 0.16, GREY),
    b(0, 0.17, 0.082, 0.3, 0.12, 0.006, "#7e848a"),
    cy(0, 0.266, 0, 0.04, 0.012, WHITE),
    led(0, 0.275, 0, 0.012),
  ]),

  // ---- water
  sn_leak_puck: def("Water leak sensor", 0.07, 0.07, 0.02, [
    cy(0, 0.01, 0, 0.07, 0.02, WHITE),
    b(-0.015, 0.004, 0.036, 0.008, 0.008, 0.004, STEEL),
    b(0.015, 0.004, 0.036, 0.008, 0.008, 0.004, STEEL),
    cy(0, 0.0205, 0, 0.016, 0.002, LED, { glow: true }),
  ]),
  sn_leak_probe: def("Leak sensor with cable probe", 0.24, 0.06, 0.03, [
    cy(-0.085, 0.01, 0, 0.06, 0.02, WHITE),
    cy(-0.085, 0.0205, 0, 0.014, 0.002, LED, { glow: true }),
    b(-0.01, 0.003, 0, 0.12, 0.004, 0.004, BLACK),
    b(0.085, 0.012, 0, 0.045, 0.024, 0.02, "#3d4046"),
    b(0.112, 0.006, 0.006, 0.012, 0.004, 0.004, STEEL),
    b(0.112, 0.006, -0.006, 0.012, 0.004, 0.004, STEEL),
  ]),
  sn_leak_rope: def("Leak rope sensor", 0.65, 0.45, 0.016, [
    b(0, 0.004, 0.2, 0.6, 0.006, 0.006, "#c8c8c0"),
    b(0, 0.004, -0.2, 0.6, 0.006, 0.006, "#c8c8c0"),
    b(-0.3, 0.004, 0, 0.006, 0.006, 0.4, "#c8c8c0"),
    b(0.3, 0.004, 0, 0.006, 0.006, 0.4, "#c8c8c0"),
    cy(-0.3, 0.008, -0.2, 0.05, 0.016, WHITE),
    cy(-0.3, 0.0165, -0.2, 0.014, 0.002, LED, { glow: true }),
  ]),
  sn_flood_valve: def("Flood sensor with water valve", 0.26, 0.12, 0.15, [
    cx(0, 0.04, 0, 0.04, 0.26, "#b08d4a"),
    b(0, 0.04, 0, 0.06, 0.07, 0.06, "#b08d4a"),
    cy(0, 0.085, 0, 0.03, 0.02, "#b08d4a"),
    cy(0, 0.115, 0, 0.07, 0.06, RADAR),
    cy(0, 0.146, 0, 0.026, 0.004, LED, { glow: true }),
    cy(0.09, 0.012, 0.04, 0.05, 0.024, WHITE),
    led(0.09, 0.026, 0.04, 0.01),
  ]),

  // ---- smoke, CO, gas, alarm
  sn_ceiling_smoke: def("Smoke detector (ceiling)", 0.12, 0.12, 2.6, [
    cy(0, 2.595, 0, 0.12, 0.01, "#dcdcd8"),
    cy(0, 2.575, 0, 0.11, 0.03, WHITE),
    cy(0, 2.558, 0, 0.07, 0.004, "#c4c4c0"),
    cy(0, 2.556, 0, 0.025, 0.004, "#e8e8e4"),
    led(0.04, 2.557, 0, 0.012),
  ]),
  sn_ceiling_co: def("CO detector (ceiling)", 0.1, 0.1, 2.6, [
    cy(0, 2.58, 0, 0.1, 0.04, WHITE),
    cy(0, 2.585, 0, 0.102, 0.008, "#4a7fb0"),
    b(0, 2.559, 0.02, 0.03, 0.004, 0.012, "#223a2e"),
    led(-0.03, 2.558, -0.012, 0.012),
  ]),
  sn_ceiling_smoke_co: def("Smoke and CO detector (ceiling)", 0.13, 0.13, 2.6, [
    cy(0, 2.595, 0, 0.13, 0.01, "#dcdcd8"),
    cy(0, 2.575, 0, 0.12, 0.03, WHITE),
    cy(0, 2.558, 0, 0.09, 0.004, "#c4c4c0"),
    led(-0.035, 2.557, 0.03, 0.01),
    led(0.035, 2.557, 0.03, 0.01),
  ]),
  sn_gas: def("Gas detector", 0.08, 0.04, 1.9, [
    b(0, 1.84, 0, 0.08, 0.12, 0.04, WHITE),
    b(0, 1.87, 0.0205, 0.05, 0.04, 0.004, LGREY),
    led(0, 1.805, 0.021, 0.012),
  ], { wall: true }),
  sn_siren: def("Siren", 0.12, 0.045, 2.2, [
    b(0, 2.14, 0, 0.12, 0.12, 0.045, WHITE),
    b(0, 2.13, 0.0235, 0.08, 0.07, 0.004, "#d0d0cc"),
    bar(0, 2.185, 0.0255, 0.06, 0.016),
  ], { wall: true }),

  // ---- vibration, buttons
  sn_vibration: def("Vibration / shock sensor", 0.035, 0.035, 0.016, [b(0, 0.0075, 0, 0.035, 0.015, 0.035, WHITE), cy(0, 0.0155, 0, 0.012, 0.002, LED, { glow: true })]),
  sn_button: def("Wireless button", 0.04, 0.04, 0.014, [cy(0, 0.006, 0, 0.04, 0.012, WHITE), cy(0, 0.0125, 0, 0.012, 0.002, LED, { glow: true })]),
  sn_dial: def("Rotary dial remote", 0.06, 0.06, 0.04, [
    cy(0, 0.012, 0, 0.06, 0.024, RADAR),
    cy(0, 0.03, 0, 0.05, 0.012, "#e8e8e4"),
    b(0.018, 0.0365, 0, 0.006, 0.002, 0.012, LED, { glow: true }),
  ]),
  sn_bed_pad: def("Bed / chair occupancy pad", 0.6, 0.3, 0.03, [
    b(0, 0.006, 0, 0.6, 0.012, 0.3, "#d8dadb"),
    b(0, 0.0125, 0, 0.5, 0.002, 0.012, "#b8bcc2"),
    b(0, 0.0125, 0.07, 0.5, 0.002, 0.012, "#b8bcc2"),
    b(0, 0.0125, -0.07, 0.5, 0.002, 0.012, "#b8bcc2"),
    cy(0.26, 0.016, 0, 0.05, 0.008, RADAR),
    led(0.26, 0.022, 0, 0.01),
  ]),

  // ---- climate and light
  sn_barometer: def("Analog wall barometer", 0.2, 0.04, 1.6, [
    b(0, 1.5, -0.018, 0.12, 0.12, 0.004, WOOD),
    cz(0, 1.5, -0.003, 0.2, 0.034, WOOD),
    cz(0, 1.5, 0.014, 0.194, 0.006, "#b89550"),
    cz(0, 1.5, 0.017, 0.178, 0.002, "#f4ecd9"),
    led(0, 1.446, 0.0185, 0.006),
  ], { wall: true, tags: "atmospheric pressure hPa rain change fair dial" }),
  sn_temp_eink: def("Temperature and humidity sensor (e-ink)", 0.05, 0.015, 0.06, [
    b(0, 0.03, 0, 0.05, 0.06, 0.012, WHITE),
    b(0, 0.036, 0.0065, 0.038, 0.03, 0.002, LED, { glow: true }),
    b(0, 0.036, 0.0078, 0.022, 0.012, 0.001, BLACK),
    led(0.019, 0.01, 0.0066, 0.006),
  ]),
  sn_temp_aqara: def("Temperature and humidity sensor (Zigbee)", 0.036, 0.036, 0.009, [
    b(0, 0.0045, 0, 0.036, 0.009, 0.036, WHITE),
    b(0, 0.0095, 0, 0.012, 0.001, 0.012, GREY),
    led(0.012, 0.0096, 0.012, 0.005),
  ]),
  sn_temp_puck: def("Temperature sensor puck", 0.045, 0.045, 0.02, [
    cy(0, 0.01, 0, 0.045, 0.02, WHITE),
    cy(0, 0.0205, 0, 0.016, 0.002, LED, { glow: true }),
  ]),
  sn_lux: def("Light level sensor", 0.06, 0.06, 0.05, [
    cy(0, 0.008, 0, 0.06, 0.016, DARK),
    cy(0, 0.018, 0, 0.062, 0.004, LED, { glow: true }),
    sp(0, 0.03, 0, 0.04, "#f4f4ef"),
  ]),
  sn_uv: def("UV sensor", 0.06, 0.04, 0.09, [
    b(0, 0.045, 0, 0.06, 0.09, 0.04, WHITE),
    b(0, 0.062, 0.0205, 0.034, 0.024, 0.003, LED, { glow: true }),
    b(0, 0.03, 0.0205, 0.044, 0.02, 0.003, "#d8d8d4"),
  ]),
  sn_air_desk: def("Air quality monitor (CO2, VOC, PM)", 0.13, 0.05, 0.13, [
    b(0, 0.065, 0, 0.13, 0.13, 0.05, WHITE),
    b(0, 0.095, 0.0255, 0.1, 0.04, 0.004, GLASSY),
    bar(0, 0.095, 0.0275, 0.09, 0.012, 0.002),
    b(0, 0.035, 0.0255, 0.09, 0.03, 0.003, "#d8d8d4"),
  ]),
  sn_air_wall: def("Air quality monitor (wall)", 0.12, 0.03, 1.5, [
    b(0, 1.44, 0, 0.12, 0.12, 0.03, WHITE),
    b(0, 1.46, 0.0155, 0.09, 0.05, 0.004, GLASSY),
    bar(0, 1.46, 0.0175, 0.08, 0.014, 0.002),
    b(0, 1.405, 0.0155, 0.08, 0.02, 0.003, "#d0d0cc"),
  ], { wall: true }),
  sn_noise: def("Noise sensor", 0.07, 0.07, 0.05, [
    cy(0, 0.012, 0, 0.07, 0.024, DARK),
    cy(0, 0.024, 0, 0.072, 0.004, LED, { glow: true }),
    sp(0, 0.034, 0, 0.04, "#6b6f76"),
  ]),
  sn_thermostat_probe: def("Thermostat probe sensor", 0.15, 0.04, 0.035, [
    b(-0.05, 0.015, 0, 0.04, 0.03, 0.03, WHITE),
    led(-0.05, 0.031, 0, 0.008),
    b(-0.005, 0.004, 0, 0.07, 0.004, 0.004, BLACK),
    cx(0.06, 0.01, 0, 0.012, 0.05, STEEL),
  ]),

  // ---- garden and weather
  sn_soil: def("Soil moisture sensor in a plant pot", 0.16, 0.16, 0.32, [
    cy(0, 0.05, 0, 0.14, 0.1, "#b5603a"),
    cy(0, 0.1, 0, 0.15, 0.02, "#a85632"),
    cy(0, 0.108, 0, 0.13, 0.008, "#4a3626"),
    cy(0, 0.17, 0, 0.015, 0.12, "#2f5530"),
    sp(0, 0.23, 0, 0.14, "#3f6b3a"),
    sp(0.04, 0.27, 0.02, 0.1, "#4d7d3d"),
    b(0.05, 0.14, -0.04, 0.03, 0.045, 0.012, WHITE),
    led(0.05, 0.155, -0.033, 0.01),
  ]),
  sn_rain_gauge: def("Rain gauge", 0.13, 0.13, 0.38, [
    cy(0, 0.13, 0, 0.02, 0.26, GREY),
    cy(0, 0.3, 0, 0.12, 0.14, WHITE),
    cy(0, 0.375, 0, 0.13, 0.012, "#dcdcd8"),
    led(0, 0.31, 0.062, 0.012),
  ]),
  sn_weather_station: def("Weather station (wind, rain, sun)", 0.3, 0.3, 2.2, [
    b(0, 0.01, 0, 0.2, 0.02, 0.2, DARK),
    cy(0, 0.9, 0, 0.04, 1.8, GREY),
    b(0, 1.3, 0.04, 0.08, 0.1, 0.045, WHITE),
    led(0, 1.27, 0.065, 0.012),
    ...[0, 1, 2, 3].map((i) => cy(0, 1.5 + i * 0.016, 0, 0.09, 0.008, "#f4f4f0")),
    b(0.07, 1.74, 0, 0.1, 0.006, 0.08, "#1f3a5f", { r: [0, 0, -0.45] }),
    cy(0, 1.97, 0, 0.02, 0.34, GREY),
    b(0, 2.12, 0, 0.28, 0.008, 0.035, DARK, { r: [0.35, 0, 0], spin: { axis: "y", rpm: 80 } }),
    b(0, 2.12, 0, 0.035, 0.008, 0.28, DARK, { r: [0, 0, 0.35], spin: { axis: "y", rpm: 80 } }),
    b(0, 1.86, 0, 0.01, 0.06, 0.2, "#c9ccd0"),
  ]),
  sn_outdoor_temp_shield: def("Outdoor temperature shield", 0.1, 0.1, 1.54, [
    b(0, 1.5, -0.04, 0.03, 0.05, 0.03, GREY),
    ...[0, 1, 2, 3, 4].map((i) => cy(0, 1.46 + i * 0.016, 0.0, 0.09, 0.008, "#f4f4f0")),
    led(0, 1.435, 0.0, 0.01),
  ], { wall: true }),

  // ---- energy
  sn_power_plug: def("Power-monitoring smart plug", 0.06, 0.06, 0.4, [
    b(0, 0.37, 0, 0.06, 0.06, 0.06, WHITE),
    b(0, 0.37, 0.0305, 0.044, 0.044, 0.004, "#e4e4e0"),
    b(-0.008, 0.37, 0.033, 0.006, 0.006, 0.002, BLACK),
    b(0.008, 0.37, 0.033, 0.006, 0.006, 0.002, BLACK),
    bar(0, 0.397, 0.0305, 0.032, 0.005),
  ], { wall: true }),
  sn_din_meter: def("DIN-rail energy meter", 0.036, 0.06, 1.5, [
    b(0, 1.455, 0, 0.036, 0.09, 0.06, "#e2e2de"),
    b(0, 1.47, 0.0305, 0.026, 0.026, 0.004, GLASSY),
    bar(0, 1.47, 0.0325, 0.022, 0.012, 0.002),
    b(0, 1.42, 0.0305, 0.03, 0.01, 0.004, "#3d4046"),
  ], { wall: true }),
  sn_current_clamp: def("Current clamp (CT)", 0.12, 0.08, 1.5, [
    cx(0, 1.46, 0, 0.012, 0.12, BLACK),
    b(0, 1.49, 0, 0.03, 0.012, 0.06, DARK),
    b(0, 1.43, 0, 0.03, 0.012, 0.06, DARK),
    b(0, 1.46, 0.024, 0.03, 0.06, 0.012, DARK),
    b(0, 1.46, -0.024, 0.03, 0.06, 0.012, DARK),
    b(0.045, 1.46, 0, 0.03, 0.05, 0.05, WHITE),
    led(0.045, 1.488, 0.0, 0.01),
  ], { wall: true }),
};
withMaterials(SENSORS);
