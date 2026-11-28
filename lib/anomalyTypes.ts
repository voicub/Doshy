// The shapes of the anomaly watch ("Home health"): what is watched (a Subject), what it finds (an Anomaly) and how it is told. Pure types, no code.

export type AnomalySeverity = "info" | "notice" | "warning";

/** What a watched entity is, as far as the rules care. Hours of history are read for the first group; the rest is judged from its live state. */
export type Kind =
  | "temp" | "fridge" | "freezer" | "humidity" | "power" | "water_meter" | "water_flow"
  | "battery" | "battery_flag" | "window" | "door" | "garage" | "climate";

/** Kinds whose numbers over the last weeks teach what "normal" is. */
export const HISTORY_KINDS: readonly Kind[] = ["temp", "fridge", "freezer", "humidity", "power", "water_meter", "water_flow"];

export type Subject = {
  entity: string;
  kind: Kind;
  name: string;
  /** the sensor's own unit (°C, °F, %, W, kW, L, m³ ...); the engine works in °C, W, % and litres and says things back in this unit */
  unit: string;
  roomId?: string;
  roomName?: string;
  /** the furniture item or door / window that carries the entity: what "Show on the model" points at */
  itemId?: string;
  openingId?: string;
  /** a power sensor that is the whole home (or a whole circuit): the only one whose night-time standby is judged */
  whole: boolean;
};

export type RuleId =
  | "level" | "drift" | "humidity" | "standby" | "water_night" | "stale" | "unavailable" | "battery" | "window_heating" | "garage_night";

/** The last 14 days of one sensor and the band it normally stays in: what the card's little chart draws. Values are in the sensor's own unit. */
export type SparkLine = { t0: number; stepMs: number; v: (number | null)[]; lo: (number | null)[]; hi: (number | null)[]; unit: string };

export type Anomaly = {
  /** `<rule>:<entity>`: the same oddity keeps its id, so snoozing and "This is normal" stick. */
  id: string;
  rule: RuleId;
  entity: string;
  name: string;
  roomId?: string;
  roomName?: string;
  itemId?: string;
  openingId?: string;
  severity: AnomalySeverity;
  /** short headline for a banner or a chip ("Freezer warmer than usual") and the plain sentence */
  title: string;
  message: string;
  /** "What to check": a few plain suggestions */
  hints: string[];
  /** when it started (ms) */
  since: number;
  /** "This is normal" can widen what counts as normal for this one (it has a band); the others are simply hidden */
  teachable: boolean;
  /** how far beyond the allowed band it is: 1 = at its edge. "This is normal" widens the band to cover it. */
  ratio: number;
  spark?: SparkLine;
};

export const SEVERITY_RANK: Record<AnomalySeverity, number> = { warning: 0, notice: 1, info: 2 };
