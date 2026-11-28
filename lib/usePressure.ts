"use client";
// The barometer as the Live views see it: the reading, its tendency over the last three hours and the Zambretti indication. One store for the whole page, kept up to date by
// subscriptions (Home Assistant states, the owner's pressure choices, the ground height) so every chip, card and the 3D scene share one scan of the entities and one history
// request. The rules are lib/pressure.ts (tested); this file is the wiring. Nothing is fetched while the home has no barometer.
import { create } from "zustand";
import { onHomeChange } from "./haHome";
import { readInputs } from "./liveSky";
import { pressureReading, seaLevelFromStation, trend3h, zambretti, type PressureReading, type Sample, type Tendency, type Zambretti } from "./pressure";
import { pressureSamples } from "./pressureHistory";
import { homeAltitude } from "./pressurePrefs";
import { usePressurePrefs } from "./pressureStore";
import { useSiteState } from "./siteStore";
import { fetchHistory } from "./stats";
import { useStore } from "./store";
import { useQuality } from "./quality";
import { isReplaying } from "./replayGate";

type View = {
  reading: PressureReading | null;
  /** Undefined until the history reaches back three hours. */
  tendency: Tendency | undefined;
  forecast: Zambretti | undefined;
};

const NONE: View = { reading: null, tendency: undefined, forecast: undefined };
/** The barometer view (reading, tendency, forecast) as a hook: this module keeps it current once something imports it. */
export const usePressure = create<View>(() => NONE);

const HISTORY_HOURS = 5; // three for the tendency, the rest so the start of the window is never the first sample
const HISTORY_POINTS = 100;
const RELOAD_MS = 10 * 60_000; // the history is a base; live readings are added on top between reloads
const RETRY_MS = 60_000;
const LIVE_GAP_MS = 60_000; // a reading a minute is plenty for a quantity that moves hPa an hour
const TICK_MS = 60_000;

let history: Sample[] = [];
let live: Sample[] = [];
let owner = "";
let loadedAt = 0;
let epoch = 0; // counts resets (another barometer, another home): a history that arrives from before is dropped

function reset() {
  epoch++;
  history = [];
  live = [];
  owner = "";
  loadedAt = 0;
}

/** The unit the entity's own values are in: what the history series are in. */
function nativeUnit(entity: string): unknown {
  const a = useStore.getState().states[entity]?.attributes;
  return entity.startsWith("weather.") ? a?.pressure_unit : a?.unit_of_measurement;
}

async function loadHistory(entity: string) {
  loadedAt = Date.now(); // one request at a time: a failure waits RETRY_MS below, a success RELOAD_MS
  const mine = epoch;
  try {
    const r = await fetchHistory([entity], HISTORY_HOURS, { points: HISTORY_POINTS, attrs: entity.startsWith("weather.") ? ["pressure"] : undefined });
    if (mine !== epoch) return;
    const hist = pressureSamples(r.series, entity, nativeUnit(entity) ?? "hPa");
    history = hist;
    live = live.filter((s) => s.t > (hist.at(-1)?.t ?? 0));
  } catch {
    if (mine === epoch) loadedAt = Date.now() - RELOAD_MS + RETRY_MS; // the tendency waits for the next try; the chip still shows the reading
  }
  refresh();
}

const month = () => new Date().getMonth() + 1;

const same = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

function refresh() {
  const { states, plan } = useStore.getState();
  if (isReplaying()) return; // replay moves only the analog needle, never the live tendency buffer
  const prefs = usePressurePrefs.getState();
  const elevationM = homeAltitude(prefs, useSiteState.getState().data?.terrain?.base);
  const reading = pressureReading(states, { entity: prefs.entity ?? undefined, elevationM, correct: prefs.correct });
  if (!reading) {
    if (usePressure.getState().reading) usePressure.setState(NONE);
    if (owner) reset();
    return;
  }
  if (owner !== reading.entity) {
    reset();
    owner = reading.entity;
  }
  const now = Date.now();
  if (now - (live.at(-1)?.t ?? 0) >= LIVE_GAP_MS) live = [...live.filter((s) => s.t > now - HISTORY_HOURS * 3_600_000), { t: now, hpa: reading.rawHpa }];
  if ((!loadedAt || useQuality.getState().tier !== "eco") && now - loadedAt >= RELOAD_MS) void loadHistory(reading.entity);
  // history and live readings are as the entity reports them; the correction is applied to every sample alike, so the change over three hours is the sea-level change
  const fix = reading.corrected && elevationM !== undefined ? (s: Sample): Sample => ({ t: s.t, hpa: seaLevelFromStation(s.hpa, elevationM) }) : (s: Sample) => s;
  const tendency = trend3h([...history, ...live].map(fix), now);
  const home = states["zone.home"]?.attributes;
  const lat = typeof home?.latitude === "number" ? home.latitude : plan.site?.lat;
  const wind = readInputs(states).windFrom;
  const forecast = tendency ? zambretti(reading.hpa, tendency.deltaHpa3h, { month: month(), hemisphere: lat !== undefined && lat < 0 ? "south" : "north", windFromDeg: wind }) : undefined;
  const next: View = { reading, tendency, forecast };
  if (!same(usePressure.getState(), next)) usePressure.setState(next);
}

const SOON_MS = 2000;
let pending: number | undefined;
/** A poll changes `states` every few seconds in a busy home, and a barometer moves hPa an hour: one pass every couple of seconds is plenty and keeps the entity scan off the Pi's hot path. */
function soon() {
  pending ??= window.setTimeout(() => {
    pending = undefined;
    refresh();
  }, SOON_MS);
}

if (typeof window !== "undefined") {
  useStore.subscribe((s, p) => { if (s.states !== p.states) soon(); });
  usePressurePrefs.subscribe(soon);
  useSiteState.subscribe((s, p) => { if (s.data?.terrain?.base !== p.data?.terrain?.base) soon(); });
  window.setInterval(() => { if (useQuality.getState().tier !== "eco") refresh(); }, TICK_MS);
  useQuality.subscribe((s, p) => { if (s.tier !== p.tier) soon(); });
  onHomeChange(() => { reset(); usePressure.setState(NONE); soon(); });
  soon();
}
