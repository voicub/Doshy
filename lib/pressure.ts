// Atmospheric (barometric) pressure: units, which Home Assistant entity carries it, the 3 hour tendency, the sea-level correction and the Zambretti "what is the weather
// about to do" indication. Pure: the node test runner loads this file directly (relative .ts imports, type-only otherwise). Sources and the maths are in docs/pressure.md.
/** What this module reads of a Home Assistant state: any `HAState` fits, and so does a bare `{ entity_id, state, attributes }` from a test or the history route. */
export type PressureEntity = { entity_id: string; state: string; attributes: Readonly<Record<string, unknown>> };
type Ent = PressureEntity;

// ---- units -----------------------------------------------------------------------------------------------------------------------------------

/** The units a person can read pressure in. Home Assistant's other pressure units (Pa, bar, cbar, psi) are converted but never offered for display. */
export type PressureUnit = "hPa" | "kPa" | "inHg" | "mmHg";
export const PRESSURE_UNITS: readonly PressureUnit[] = ["hPa", "kPa", "inHg", "mmHg"];
/** "auto" shows the unit the chosen Home Assistant entity reports in. */
export type PressurePref = "auto" | PressureUnit;
export const PRESSURE_PREFS: readonly PressurePref[] = ["auto", ...PRESSURE_UNITS];
export const isPressurePref = (v: unknown): v is PressurePref => typeof v === "string" && (PRESSURE_PREFS as readonly string[]).includes(v);

/** hPa in one of each unit Home Assistant uses for pressure (1 mmHg = 133.322387415 Pa, 1 inHg = 3386.38866667 Pa, 1 psi = 6894.757293168 Pa). Keys are lower case. */
const HPA_PER: Record<string, number> = {
  hpa: 1, mbar: 1, mb: 1, millibar: 1, millibars: 1, kpa: 10, pa: 0.01, bar: 1000, cbar: 10, mmhg: 1.33322387415, inhg: 33.8638866667, psi: 68.94757293168,
};
/** The unit a native one is shown as when the choice is "auto". */
const SHOWN_AS: Record<string, PressureUnit> = { hpa: "hPa", mbar: "hPa", mb: "hPa", millibar: "hPa", millibars: "hPa", pa: "hPa", bar: "hPa", cbar: "hPa", psi: "hPa", kpa: "kPa", mmhg: "mmHg", inhg: "inHg" };
/** Units a barometer or weather station reports in. `bar` and `psi` are what pipes and tyres use, so a name alone never makes them atmospheric. */
const ATMOSPHERIC_UNITS: readonly string[] = ["hpa", "mbar", "mb", "millibar", "millibars", "kpa", "pa", "mmhg", "inhg"];

const unitKey = (unit: unknown): string | undefined => {
  const k = typeof unit === "string" ? unit.trim().toLowerCase() : "";
  return Object.hasOwn(HPA_PER, k) ? k : undefined;
};

/** The unit Home Assistant's text names (case-insensitive, "mbar" and "hPa" alike), or undefined when it is not a pressure unit. */
export const isPressureUnit = (unit: unknown): boolean => unitKey(unit) !== undefined;

/** A reading in hectopascals; undefined for a unit that is not a pressure unit or a value that is not a number. */
export function toHpa(value: number, unit: unknown): number | undefined {
  const k = unitKey(unit);
  return k && Number.isFinite(value) ? value * HPA_PER[k] : undefined;
}

export const fromHpa = (hpa: number, unit: PressureUnit): number => hpa / HPA_PER[unit.toLowerCase()];

/** The unit to show: the choice, or for "auto" the entity's own unit (hPa when it has none Doshy knows). */
export function displayUnit(pref: PressurePref, native?: unknown): PressureUnit {
  if (pref !== "auto") return pref;
  const k = unitKey(native);
  return (k && SHOWN_AS[k]) || "hPa";
}

const DECIMALS: Record<PressureUnit, number> = { hPa: 0, kPa: 1, inHg: 2, mmHg: 0 };
const DELTA_DECIMALS: Record<PressureUnit, number> = { hPa: 1, kPa: 2, inHg: 2, mmHg: 1 };

/** "1013 hPa", "101.3 kPa", "29.92 inHg", "760 mmHg". */
export function formatPressure(hpa: number, pref: PressurePref = "hPa", native?: unknown): string {
  const u = displayUnit(pref, native);
  return `${fromHpa(hpa, u).toFixed(DECIMALS[u])} ${u}`;
}

/** A change in pressure with its sign: "+1.2 hPa", "-0.04 inHg". */
export function formatChange(deltaHpa: number, pref: PressurePref = "hPa", native?: unknown): string {
  const u = displayUnit(pref, native);
  const v = Number(fromHpa(deltaHpa, u).toFixed(DELTA_DECIMALS[u]));
  return `${v > 0 ? "+" : ""}${v.toFixed(DELTA_DECIMALS[u])} ${u}`;
}

// ---- plausible values ---------------------------------------------------------------------------------------------------------------------------

/** Sea-level pressure on Earth has stayed between 870 hPa (typhoon Tip, 1979) and 1084.8 hPa (Siberian high, 2001). Anything else from a heuristic match is not a barometer. */
export const SEA_LEVEL_RANGE = { min: 870, max: 1085 } as const;
/** A reading at the station's own altitude can be lower (Denver 840 hPa, La Paz 650 hPa): the wider range for an entity Home Assistant itself calls atmospheric pressure. */
export const STATION_RANGE = { min: 300, max: 1100 } as const;
const inRange = (hpa: number, r: { min: number; max: number }) => hpa >= r.min && hpa <= r.max;

// ---- sea-level correction ---------------------------------------------------------------------------------------------------------------------

/**
 * Pressure reduced to sea level from a reading at `elevationM` metres: P0 = P * (1 - 0.0065 h / (T + 0.0065 h + 273.15)) ^ -5.257, the WMO-style barometric formula
 * (the one on the Wikipedia "Atmospheric pressure" page and in the SAS Zambretti example). `tempC` is the air temperature at the station; without it the International
 * Standard Atmosphere's 15 C at sea level (T = 15 - 0.0065 h) is used, which also keeps the corrected value free of the temperature's daily swing.
 */
export function seaLevelFromStation(hpa: number, elevationM: number, tempC?: number): number {
  if (!Number.isFinite(hpa) || !Number.isFinite(elevationM) || elevationM === 0) return hpa;
  const h = Math.min(9000, Math.max(-500, elevationM));
  const t = tempC !== undefined && Number.isFinite(tempC) ? tempC : 15 - 0.0065 * h;
  return hpa * (1 - (0.0065 * h) / (t + 0.0065 * h + 273.15)) ** -5.257;
}

// ---- which entity is the barometer --------------------------------------------------------------------------------------------------------------

/** Whether a value is at sea level, at the station's own altitude, or the entity does not say. */
export type PressureLevel = "sea" | "station" | "unknown";

const edge = (alts: string) => new RegExp(`(?<![a-z0-9])(?:${alts})(?![a-z0-9])`);
/** The words that make a sensor a barometer: BME280, BMP280 ... are the chips ESPHome and Tasmota users name their pressure sensors after. */
const NAMES_PRESSURE = /pressure|barometer|barometric|(?<![a-z0-9])baro(?![a-z0-9])|bm[pe]\d{3}/;
/** Pipes, tyres, boilers, blood and vapour have pressure too. Only a device class of atmospheric_pressure overrules these words. */
const NAMES_OTHER = /tyre|tire|water|gas|pipe|oil|boiler|heating|cylinder|compressor|blood|differential|filter|pump|hydraulic|steam|vapou?r|dew|osmosis|well|pool|irrigation|brake|fuel|vacuum|systolic|diastolic|tank/;
const NAMES_SEA = edge("sea[ _-]?level|slp|mslp|qnh|msl|relative|reduced");
const NAMES_STATION = edge("station|absolute|abs|qfe|raw");

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const nameOf = (st: Ent): string => `${st.entity_id} ${text(st.attributes.friendly_name)}`.toLowerCase();
const isNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));
const UNKNOWN_STATE = ["unavailable", "unknown", ""];
/** Home Assistant's two device classes that can be this: `pressure` is for anything from a gas line to a barometer. */
const CLASS_ATMOSPHERIC = "atmospheric_pressure";
const CLASS_PRESSURE = "pressure";

type Match = { level: PressureLevel; byClass: boolean };

/** What the metadata of a `sensor.*` says (class, unit, name); the value is checked by the caller. Undefined = not a barometer. */
function sensorMatch(st: Ent): Match | undefined {
  const name = nameOf(st);
  const cls = text(st.attributes.device_class);
  const unit = unitKey(st.attributes.unit_of_measurement);
  const level: PressureLevel = NAMES_SEA.test(name) ? "sea" : NAMES_STATION.test(name) ? "station" : "unknown";
  if (cls === CLASS_ATMOSPHERIC) return { level, byClass: true };
  if (NAMES_OTHER.test(name) || !NAMES_PRESSURE.test(name)) return undefined;
  // `pressure` (ESPHome's BME280 uses it) and no class at all: only a unit a barometer reports in, never bar or psi
  if (cls !== "" && cls !== CLASS_PRESSURE) return undefined;
  if (!unit || !ATMOSPHERIC_UNITS.includes(unit)) return undefined;
  return { level, byClass: false };
}

/** The pressure in hPa a `sensor.*` state reports, or undefined (no number, unknown unit, implausible). A sensor Home Assistant classes as atmospheric_pressure may read as low as a mountain station, any other the sea-level range. */
function sensorHpa(st: Ent, byClass: boolean): number | undefined {
  if (UNKNOWN_STATE.includes(st.state) || !isNum(st.state)) return undefined;
  const rawUnit = st.attributes.unit_of_measurement;
  // Home Assistant insists on a unit with the class, but an old template sensor may lack one: assume hPa and let the range decide
  const hpa = toHpa(Number(st.state), rawUnit === undefined || rawUnit === "" ? "hPa" : rawUnit);
  if (hpa === undefined) return undefined;
  return inRange(hpa, byClass ? STATION_RANGE : SEA_LEVEL_RANGE) ? hpa : undefined;
}

/** A weather entity's `pressure` in hPa and the unit it reports in. Without a `pressure_unit` (older integrations) the unit is guessed from the value: 20 to 35 is inHg, 640 to 815 mmHg, else hPa. */
function weatherRead(st: Ent): { hpa: number; unit: PressureUnit } | undefined {
  if (UNKNOWN_STATE.includes(st.state)) return undefined;
  const v = st.attributes.pressure;
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const given = st.attributes.pressure_unit;
  const unit = given !== undefined ? given : v >= 20 && v <= 35 ? "inHg" : v >= 640 && v <= 815 ? "mmHg" : "hPa";
  const hpa = toHpa(v, unit);
  return hpa !== undefined && inRange(hpa, SEA_LEVEL_RANGE) ? { hpa, unit: displayUnit("auto", unit) } : undefined;
}

const domainOf = (id: string) => id.slice(0, id.indexOf("."));

/**
 * Whether an entity is a barometer by what it is (device class, unit, name), whatever it reads right now: the entity picker lists these under "Pressure sensors"
 * and an `unavailable` one is still one. A reading that is a number but not a plausible pressure is not.
 */
export function isPressureEntity(st: Ent): boolean {
  const domain = domainOf(st.entity_id);
  if (domain === "weather") return st.attributes.pressure !== undefined && (UNKNOWN_STATE.includes(st.state) || weatherRead(st) !== undefined);
  if (domain !== "sensor") return false;
  const m = sensorMatch(st);
  if (!m) return false;
  return UNKNOWN_STATE.includes(st.state) || sensorHpa(st, m.byClass) !== undefined;
}

/** A barometer reading, before the sea-level correction. */
export type PressureSensor = { entity: string; name: string; hpa: number; level: PressureLevel; byClass: boolean; source: "sensor" | "weather"; unit: PressureUnit };

const friendly = (st: Ent) => text(st.attributes.friendly_name) || st.entity_id;

/** The pressure an entity reports right now in hPa, whether it is a sensor or a weather entity; undefined when it has no usable number. A hand-picked entity gets the wide range. */
export function entityHpa(st: Ent | undefined): number | undefined {
  if (!st) return undefined;
  const domain = domainOf(st.entity_id);
  if (domain === "weather") return weatherRead(st)?.hpa;
  return domain === "sensor" ? sensorHpa(st, true) : undefined;
}

function readOne(st: Ent): PressureSensor | undefined {
  const domain = domainOf(st.entity_id);
  if (domain === "weather") {
    const w = weatherRead(st);
    return w && { entity: st.entity_id, name: friendly(st), hpa: w.hpa, level: "sea", byClass: false, source: "weather", unit: w.unit };
  }
  const m = domain === "sensor" ? sensorMatch(st) : undefined;
  const hpa = m && sensorHpa(st, m.byClass);
  return m && hpa !== undefined ? { entity: st.entity_id, name: friendly(st), hpa, level: m.level, byClass: m.byClass, source: "sensor", unit: displayUnit("auto", st.attributes.unit_of_measurement) } : undefined;
}

/** Every barometer with a usable reading: sensors with the atmospheric class, sensors named like one with a pressure unit, and weather entities with a `pressure`. Sorted by entity id. */
export function pressureSensors(states: Readonly<Record<string, Ent>>): PressureSensor[] {
  return Object.values(states)
    .map(readOne)
    .filter((p): p is PressureSensor => p !== undefined)
    .sort((a, b) => a.entity.localeCompare(b.entity));
}

/** The best entity when the owner has not chosen one: sea level first (it is what weather maps and the Zambretti forecaster use), then the weather entity, then a class-checked sensor, then the rest. */
const rank = (p: PressureSensor): number => {
  if (p.source === "sensor" && p.level === "sea") return 0;
  if (p.source === "weather") return 1;
  if (p.level === "unknown" && p.byClass) return 2;
  if (p.level === "unknown") return 3;
  return 4;
};

export type PressureOpts = {
  /** The entity the owner chose; used when it reads a usable value, else the automatic choice is. */
  entity?: string;
  /** The home's height above sea level in metres, and whether to reduce a station reading to sea level with it. A sensor that says it is at sea level is never corrected. */
  elevationM?: number;
  correct?: boolean;
};

export type PressureReading = {
  entity: string;
  name: string;
  /** The pressure to show and to forecast with: at sea level when it was corrected. */
  hpa: number;
  /** What the entity reported. */
  rawHpa: number;
  level: PressureLevel;
  source: "sensor" | "weather";
  corrected: boolean;
  /** The unit Auto shows. */
  unit: PressureUnit;
};

/** The barometer reading the Live views show, or null when the home has none. */
export function pressureReading(states: Readonly<Record<string, Ent>>, opts: PressureOpts = {}): PressureReading | null {
  const chosen = opts.entity ? states[opts.entity] : undefined;
  // a hand-picked sensor skips the name heuristics: the owner said it is the barometer
  const picked = chosen && (readOne(chosen) ?? (domainOf(chosen.entity_id) === "sensor" ? manualSensor(chosen) : undefined));
  const best = picked ?? [...pressureSensors(states)].sort((a, b) => rank(a) - rank(b) || a.entity.localeCompare(b.entity))[0];
  if (!best) return null;
  const correct = !!opts.correct && best.source === "sensor" && best.level !== "sea" && typeof opts.elevationM === "number" && opts.elevationM !== 0;
  const hpa = correct ? seaLevelFromStation(best.hpa, opts.elevationM ?? 0) : best.hpa;
  return { entity: best.entity, name: best.name, hpa, rawHpa: best.hpa, level: correct ? "sea" : best.level, source: best.source, corrected: correct, unit: best.unit };
}

function manualSensor(st: Ent): PressureSensor | undefined {
  const hpa = sensorHpa(st, true);
  return hpa === undefined ? undefined : { entity: st.entity_id, name: friendly(st), hpa, level: "unknown", byClass: true, source: "sensor", unit: displayUnit("auto", st.attributes.unit_of_measurement) };
}

// ---- tendency ---------------------------------------------------------------------------------------------------------------------------------

export type Sample = { t: number; hpa: number };
export type TendencyLabel =
  | "steady"
  | "rising slowly" | "rising" | "rising quickly" | "rising very rapidly"
  | "falling slowly" | "falling" | "falling quickly" | "falling very rapidly";
export type Tendency = {
  /** Change over the last three hours in hPa: positive = rising. */
  deltaHpa3h: number;
  label: TendencyLabel;
  direction: "rising" | "falling" | "steady";
  /** 0 steady, 1 slowly, 2 plain, 3 quickly, 4 very rapidly. */
  level: 0 | 1 | 2 | 3 | 4;
};

/**
 * The Met Office's and WMO's words for a three hour pressure change (Met Office "Marine forecasts glossary", "Pressure tendency in station reports"):
 * slowly 0.1 to 1.5 hPa, plain 1.6 to 3.5, quickly 3.6 to 6.0, very rapidly more than 6.0; less than 0.1 is steady. Station reports give tenths, so the change is
 * rounded to 0.1 first: 1.55 is "1.6", which closes the gaps between the published bands.
 */
const LABELS = {
  rising: ["rising slowly", "rising", "rising quickly", "rising very rapidly"],
  falling: ["falling slowly", "falling", "falling quickly", "falling very rapidly"],
} as const satisfies Record<"rising" | "falling", readonly TendencyLabel[]>;

export function classifyTendency(deltaHpa3h: number): Tendency {
  const rounded = Math.round(Math.abs(deltaHpa3h) * 10) / 10;
  if (rounded < 0.1) return { deltaHpa3h, label: "steady", direction: "steady", level: 0 };
  const level = rounded <= 1.5 ? 1 : rounded <= 3.5 ? 2 : rounded <= 6 ? 3 : 4;
  const direction = deltaHpa3h > 0 ? "rising" : "falling";
  return { deltaHpa3h, label: LABELS[direction][level - 1], direction, level };
}

const HOUR_MS = 3_600_000;
const WINDOW_MS = 3 * HOUR_MS;
/** How much of the three hours may be missing at the start before there is no tendency (samples a few minutes late are normal). */
const START_SLACK_MS = 20 * 60_000;

/** The value of a sorted series at `t`: linear between the neighbours, the nearest end outside it. */
function valueAt(pts: readonly Sample[], t: number): number {
  if (t <= pts[0].t) return pts[0].hpa;
  const last = pts[pts.length - 1];
  if (t >= last.t) return last.hpa;
  let i = 1;
  while (pts[i].t < t) i++;
  const a = pts[i - 1];
  const b = pts[i];
  return a.hpa + ((b.hpa - a.hpa) * (t - a.t)) / (b.t - a.t);
}

/**
 * The tendency over the last three hours from irregular, possibly sparse samples (Home Assistant history only records changes). The window ends at `now` (default: the
 * newest sample) with the latest value held up to it; the start is read off by linear interpolation. Undefined when the samples do not reach back about three hours or
 * hold fewer than two plausible readings: a tendency is never guessed from less.
 */
export function trend3h(samples: readonly Sample[], now?: number): Tendency | undefined {
  const pts = samples
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.hpa) && inRange(s.hpa, STATION_RANGE))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return undefined;
  const end = Math.max(now ?? -Infinity, pts[pts.length - 1].t);
  const start = end - WINDOW_MS;
  if (pts[0].t > start + START_SLACK_MS) return undefined;
  return classifyTendency(valueAt(pts, end) - valueAt(pts, start));
}

/** Pairs a history series (times in ms, values in the entity's unit) as hPa samples; values in a unit that is not a pressure unit give none. */
export function samplesFromSeries(t: readonly number[], v: readonly number[], unit: unknown): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i < Math.min(t.length, v.length); i++) {
    const hpa = toHpa(v[i], unit ?? "hPa");
    if (hpa !== undefined) out.push({ t: t[i], hpa });
  }
  return out;
}

const ARROW: Record<Tendency["direction"], readonly [string, string, string]> = { steady: ["→", "→", "→"], rising: ["↗", "↑", "↑↑"], falling: ["↘", "↓", "↓↓"] };
/** A short arrow for the chip: → steady, ↗ slowly, ↑ rising, ↑↑ quickly or faster (↘ ↓ ↓↓ for falling). */
export const tendencyArrow = (t: Tendency): string => ARROW[t.direction][Math.max(0, Math.min(2, t.level - 1))];

/** "Rising slowly" for a sentence start. */
export const tendencyText = (t: Tendency): string => t.label.charAt(0).toUpperCase() + t.label.slice(1);

// ---- Zambretti ----------------------------------------------------------------------------------------------------------------------------------

/** The 26 outcomes of the Negretti & Zambra forecaster's dial, in plain English (letters A to Z). */
const OUTCOMES: Record<string, string> = {
  A: "Settled fine", B: "Fine weather", C: "Becoming fine", D: "Fine, becoming less settled", E: "Fine, possible showers", F: "Fairly fine, improving",
  G: "Fairly fine, possible showers early", H: "Fairly fine, showery later", I: "Showery early, improving", J: "Changeable, mending", K: "Fairly fine, showers likely",
  L: "Rather unsettled, clearing later", M: "Unsettled, probably improving", N: "Showery, bright intervals", O: "Showery, becoming more unsettled", P: "Changeable, some rain",
  Q: "Unsettled, short fine intervals", R: "Unsettled, rain later", S: "Unsettled, rain at times", T: "Very unsettled, finer at times", U: "Rain at times, worse later",
  V: "Rain at times, becoming very unsettled", W: "Rain at frequent intervals", X: "Very unsettled, rain", Y: "Stormy, possibly improving", Z: "Stormy, much rain",
};
/** Forecast number to letter, one row per kind of tendency (Scott 2011, tables 1a to 1c; the SAS example numbers them 1 to 9, 10 to 19 and 20 to 32). */
const FALLING = "ABDHORUVX";
const STEADY = "ABEKNPSWXZ";
const RISING = "ABCFGIJLMQTYZ";

/** Pressure steady = less than this change in three hours, rising or falling = at least this (the forecaster's own rule, 1.6 hPa in 3 h). */
export const ZAMBRETTI_STEADY_HPA = 1.6;

export type Zambretti = {
  /** The dial letter A (settled fine) to Z (stormy, much rain). */
  letter: string;
  /** The same in plain English. */
  text: string;
  /** Which of the three scales was read. */
  scale: "falling" | "steady" | "rising";
  /** The pressure is outside the range that scale was calibrated for (falling 985 to 1050, steady 960 to 1033, rising 947 to 1030 hPa): the nearest end is shown. */
  extreme: boolean;
};

/** Winds from the south make it worse by up to 2 steps, from the east or west by 1, from the north 0 (the SAS example's rule for Scott's wind correction). */
function windSteps(fromDeg: number, hemisphere: "north" | "south"): number {
  const d = (((hemisphere === "south" ? fromDeg + 180 : fromDeg) % 360) + 360) % 360;
  return d >= 135 && d <= 225 ? 2 : d >= 315 || d <= 45 ? 0 : 1;
}

export type ZambrettiOpts = {
  /** 1 to 12. */
  month: number;
  hemisphere?: "north" | "south";
  /** Where the wind comes from, degrees; leave out when unknown. */
  windFromDeg?: number;
};

/**
 * The classic Zambretti forecaster: sea-level pressure and its three hour change pick one of 26 short outcomes for the next few hours. Per scale, Z = 127 - 0.12 P
 * (falling), 144 - 0.13 P (steady) or 185 - 0.16 P (rising), rounded down, plus the wind steps, kept inside that scale's rows; a summer reading is one step kinder for a
 * rising and one step worse for a falling barometer (Scott's reading of the instrument). An indication for the next hours, not a forecast. Verified in zambretti.test.ts.
 */
export function zambretti(hpaSeaLevel: number, deltaHpa3h: number, o: ZambrettiOpts): Zambretti {
  const south = o.hemisphere === "south";
  const scale = deltaHpa3h <= -ZAMBRETTI_STEADY_HPA ? "falling" : deltaHpa3h >= ZAMBRETTI_STEADY_HPA ? "rising" : "steady";
  const summer = south ? o.month >= 10 || o.month <= 3 : o.month >= 4 && o.month <= 9;
  const row = scale === "falling" ? FALLING : scale === "steady" ? STEADY : RISING;
  const first = scale === "falling" ? 1 : scale === "steady" ? 10 : 20;
  const z = scale === "falling" ? 127 - 0.12 * hpaSeaLevel : scale === "steady" ? 144 - 0.13 * hpaSeaLevel : 185 - 0.16 * hpaSeaLevel;
  const season = summer ? (scale === "falling" ? 1 : scale === "rising" ? -1 : 0) : 0;
  const wind = o.windFromDeg === undefined || !Number.isFinite(o.windFromDeg) ? 0 : windSteps(o.windFromDeg, south ? "south" : "north");
  const raw = Math.floor(z) + wind + season;
  const index = Math.min(row.length - 1, Math.max(0, raw - first));
  const letter = row[index];
  return { letter, text: OUTCOMES[letter], scale, extreme: raw - first !== index };
}

// ---- the wall barometer's dial ----------------------------------------------------------------------------------------------------------------------

/** The scale of the catalogue barometer: the needle sweeps this range, and the classic dial words sit at these pressures. */
export const DIAL = { min: 960, max: 1060, marks: [{ hpa: 980, word: "RAIN" }, { hpa: 1013, word: "CHANGE" }, { hpa: 1040, word: "FAIR" }] } as const;

/** Where the needle stands, 0 at the bottom of the scale and 1 at the top; clamped, so a freak reading pins it instead of spinning it. */
export const dialFraction = (hpa: number): number => Math.min(1, Math.max(0, (hpa - DIAL.min) / (DIAL.max - DIAL.min)));

/** Rotation about local +z for an upright wall needle: low pressure at lower left, high at lower right, clockwise through 270 degrees. */
export const dialAngle = (hpa: number): number => (0.5 - dialFraction(hpa)) * Math.PI * 1.5;

// ---- heuristics that feed other features -----------------------------------------------------------------------------------------------------

/** A falling barometer fast enough that a storm may be coming: at least "falling very rapidly" (more than 6 hPa in three hours). */
export const stormWarning = (t: Tendency | undefined): boolean => !!t && t.direction === "falling" && t.level >= 4;
