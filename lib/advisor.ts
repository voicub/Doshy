// The cost and comfort advisor's engine: from prices, solar and weather forecasts, the sun analysis of each room and what the home measures, it works out a short list of advice
// cards ("run the dishwasher 13:00-15:00", "close the west curtains at 14:30"). Advisory only: it returns words and numbers; nothing here, or anywhere in the advisor, runs a device.
// Every card carries the numbers behind it (`why`). Pure: the clock is passed in, nothing reads a store or the network.
import type { DeviceAction } from "./deviceAction.ts";
import { compassWord, kwhWords, kwWords, lengthWords, type Fmt } from "./advisorFormat.ts";
import { averagePrice, coveredUntil, type PriceSlot } from "./advisorPrices.ts";
import type { HourPoint, PvSlot } from "./advisorForecast.ts";
import { addDays, dayStart, dayWord, hhmm, minuteOfDay, windowWords } from "./advisorTime.ts";

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

export type AdviceKind = "cheap-run" | "solar-surplus" | "sun-curtains" | "ventilate" | "warm-outside" | "weather-change";

/** What "Make it a routine" hands to the existing automation builder: do this to this device at this time. The person confirms it there; the advisor never creates it. */
export type RoutineSeed = { entity: string; name: string; action: DeviceAction; time: string };

export type Advice = {
  /** stable for the same advice on the same day, so "Not now" and reminders stick */
  id: string;
  kind: AdviceKind;
  title: string;
  detail: string;
  /** the numbers behind it, one plain sentence each */
  why: string[];
  start: number;
  end: number;
  /** higher is shown first */
  score: number;
  /** when "Remind me" would speak up, or null when there is no good moment left */
  remindAt: number | null;
  routine: RoutineSeed | null;
};

// ---- the cheapest stretch ---------------------------------------------------------------------------------------------------------------------------

export type PriceWindow = { start: number; end: number; avg: number };

/**
 * The cheapest stretch of `durationMs` that starts at or after `from` and lies inside the prices that run without a gap (and before `until`). Candidate starts are every slot start
 * and every slot end minus the length: a price that is constant per slot makes the average linear between those, so the best start is always one of them. The earliest wins a tie.
 */
export function cheapestWindow(slots: readonly PriceSlot[], from: number, durationMs: number, until = Infinity): PriceWindow | null {
  const covered = Math.min(until, coveredUntil(slots, from));
  if (durationMs <= 0 || covered - from < durationMs) return null;
  const starts = [...new Set([from, ...slots.flatMap((s) => [s.start, s.end - durationMs])])].filter((t) => t >= from && t + durationMs <= covered).sort((a, b) => a - b);
  let best: PriceWindow | null = null;
  for (const start of starts) {
    const avg = averagePrice(slots, start, start + durationMs);
    if (avg !== null && (!best || avg < best.avg - 1e-9)) best = { start, end: start + durationMs, avg };
  }
  return best;
}

// ---- sun for the panels -----------------------------------------------------------------------------------------------------------------------------

export type SurplusWindow = { start: number; end: number; peakKw: number; kwh: number };

/** Stretches (at least `minLengthMs` long) of consecutive solar slots whose power, less what the house always draws, stays above `minKw`; the part before `from` is cut off. */
export function surplusWindows(pv: readonly PvSlot[], baseKw: number, minKw: number, from: number, until: number, minLengthMs = HOUR_MS): SurplusWindow[] {
  const out: SurplusWindow[] = [];
  let cur: SurplusWindow | null = null;
  const close = () => {
    if (cur && cur.end - cur.start >= minLengthMs) out.push(cur);
    cur = null;
  };
  for (const s of [...pv].sort((a, b) => a.start - b.start)) {
    const start = Math.max(s.start, from);
    const end = Math.min(s.end, until);
    const surplus = s.kw - baseKw;
    if (end <= start || surplus < minKw) {
      close();
      continue;
    }
    if (cur && start - cur.end > 1000) close();
    const kwh = (surplus * (end - start)) / HOUR_MS;
    cur = cur ? { start: cur.start, end, peakKw: Math.max(cur.peakKw, surplus), kwh: cur.kwh + kwh } : { start, end, peakKw: surplus, kwh };
  }
  close();
  return out;
}

// ---- outside temperature ----------------------------------------------------------------------------------------------------------------------------

/** The forecast temperature at `t`: between the two nearest hours, or null when the forecast has nothing within three hours of it. */
export function tempAt(hours: readonly HourPoint[], t: number): number | null {
  let before: HourPoint | undefined;
  let after: HourPoint | undefined;
  for (const h of hours) {
    if (h.tempC === null) continue;
    if (h.t <= t) before = h;
    else {
      after = h;
      break;
    }
  }
  if (before && after && after.t - before.t <= 4 * HOUR_MS) return before.tempC! + ((after.tempC! - before.tempC!) * (t - before.t)) / (after.t - before.t);
  const near = [before, after].filter((h): h is HourPoint => !!h && Math.abs(h.t - t) <= 3 * HOUR_MS);
  return near.length ? near.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0].tempC : null;
}

/** The warmest forecast temperature in [start, end], sampled every half hour. */
export function maxTemp(hours: readonly HourPoint[], start: number, end: number): number | null {
  let top: number | null = null;
  for (let t = start; t <= end; t += 30 * MIN_MS) {
    const v = tempAt(hours, t);
    if (v !== null && (top === null || v > top)) top = v;
  }
  return top;
}

// ---- the inputs and the result ----------------------------------------------------------------------------------------------------------------------

export type Appliance = {
  kind: "dishwasher" | "washer" | "dryer";
  name: string;
  /** how long a cycle runs, minutes, and what it draws, kWh */
  minutes: number;
  kwh: number;
  /** true when the figures come from the appliance's own last cycle, false for the typical values */
  measured: boolean;
  /** the plug or switch that starts it, when the plan links one (it only matters for "Make it a routine") */
  entity?: string;
};

export type RoomSun = {
  roomId: string;
  room: string;
  /** floor area, m2 */
  areaM2: number;
  /** stretches of direct sun on the room's floor (10% or more of it lit), already on the real time line */
  intervals: { start: number; end: number; /** where the sun is from, compass degrees, in the middle of the stretch */ azimuth: number; /** the share of the floor lit, averaged over the stretch */ lit: number }[];
  /** curtains or blinds of the room that Doshy may move */
  curtains: { entity: string; name: string }[];
};

export type WeatherChange = { title: string; detail: string; why: string[]; start: number; end: number };

export type AdvisorInput = {
  now: number;
  fmt: Fmt;
  prices: PriceSlot[];
  /** the price source publishes tomorrow in the afternoon: when tomorrow is missing and it is late enough, say so */
  tomorrowExpected: boolean;
  pv: PvSlot[];
  hours: HourPoint[];
  indoorC: number | null;
  comfort: { min: number; max: number };
  baseLoadKw: number;
  appliances: Appliance[];
  rooms: RoomSun[];
  /** names of the appliances and the car the solar card may suggest */
  solarUses: string[];
  weatherChange: WeatherChange | null;
};

export type AdvisorResult = { advice: Advice[]; notes: string[] };

// Thresholds, named so a person tuning them knows what they are tuning.
const MIN_SAVING_SHARE = 0.08; // a cheaper time must be at least 8% under running it now
const MIN_SAVING_PRICE = 0.005; // and at least this much per kWh (so a flat tariff with rounding noise gives no advice)
const SURPLUS_MIN_KW = 0.8; // a washing machine heats at about this much
const HOT_MARGIN_C = 2; // sun matters when it is this far over the top of the comfort band
const CURTAIN_LEAD_MS = 30 * MIN_MS;
const COOL_BY_C = 3; // opening the windows cools only when outside is this much cooler than inside
const COOLEST_OK_C = 8; // and not so cold that it chills the house through
const MAX_VENT_POINTS = 3;
const GAIN_FACTOR = 0.6; // share of the straight sunlight that comes through ordinary double glazing as heat

const roundTo = (ms: number, minutes: number) => Math.ceil(ms / (minutes * MIN_MS)) * minutes * MIN_MS;
const remindFor = (start: number, now: number): number | null => (start - 5 * MIN_MS > now + MIN_MS ? start - 5 * MIN_MS : null);

/** Cards ahead of now first, soon ones first, then by what they are worth. */
function scored(score: number, start: number, end: number, now: number): number {
  if (end <= now) return -1;
  const soon = start - now <= 3 * HOUR_MS ? 10 : start - now > 24 * HOUR_MS ? -10 : 0;
  return Math.round((score + soon) * 10) / 10;
}

const idOf = (kind: AdviceKind, subject: string, start: number, zone: string) => `${kind}:${subject}:${dayStart(start, zone)}`;

// ---- cards ------------------------------------------------------------------------------------------------------------------------------------------

function cheapRun(i: AdvisorInput, a: Appliance): Advice | null {
  const { now, fmt, prices } = i;
  const length = roundTo(a.minutes * MIN_MS, 30);
  const best = cheapestWindow(prices, now, length);
  if (!best) return null;
  const nowAvg = averagePrice(prices, now, now + length);
  const reach = coveredUntil(prices, now);
  const compare = nowAvg ?? averagePrice(prices, now, reach);
  if (compare === null) return null;
  const perKwh = compare - best.avg;
  if (best.start - now < 10 * MIN_MS || perKwh < MIN_SAVING_PRICE || perKwh < Math.abs(compare) * MIN_SAVING_SHARE) return null;
  const saving = perKwh * a.kwh;
  const when = windowWords(best.start, best.end, now, fmt.zone);
  const against = nowAvg !== null ? "starting now" : "the average of the prices ahead";
  const why = [
    `The cheapest ${lengthWords(length / MIN_MS)} in the prices that are known (until ${dayWord(reach - 1, now, fmt.zone)} ${hhmm(reach, fmt.zone)}) starts at ${hhmm(best.start, fmt.zone)}: ${fmt.perKwh(best.avg)} on average.`,
    `${against === "starting now" ? "Starting now" : "The average of the prices ahead"} would cost ${fmt.perKwh(compare)}.`,
    `${a.measured ? `Its last cycle used ${kwhWords(a.kwh)} (WashData)` : `A typical ${a.kind === "washer" ? "washing machine" : a.kind} cycle uses about ${kwhWords(a.kwh)}`}: ${fmt.price(perKwh)} x ${a.kwh.toFixed(1)} = ${fmt.money(saving)} saved.`,
  ];
  if (best.avg < 0) why.push("The price is negative then: the grid pays for using power.");
  const share = Math.min(1, perKwh / Math.max(Math.abs(compare), 1e-9));
  return {
    id: idOf("cheap-run", a.kind, best.start, fmt.zone),
    kind: "cheap-run",
    title: `Best time to run the ${a.name.toLowerCase()}: ${when}`,
    detail: `${fmt.price(best.avg)} vs ${fmt.price(compare)} ${fmt.currency}/kWh: saves about ${fmt.money(saving)}`,
    why,
    start: best.start,
    end: best.end,
    score: scored(30 + 60 * share, best.start, best.end, now),
    remindAt: remindFor(best.start, now),
    routine: a.entity ? { entity: a.entity, name: a.name, action: { verb: "turn_on" }, time: hhmm(best.start, fmt.zone) } : null,
  };
}

function solarSurplus(i: AdvisorInput): Advice | null {
  const { now, fmt } = i;
  const horizon = dayStart(now, fmt.zone);
  const windows = surplusWindows(i.pv, i.baseLoadKw, SURPLUS_MIN_KW, now, addDays(horizon, 2, fmt.zone));
  if (!windows.length) return null;
  const firstDay = dayStart(windows[0].start, fmt.zone);
  const sameDay = windows.filter((x) => dayStart(x.start, fmt.zone) === firstDay);
  const w = sameDay.reduce((best, x) => (x.kwh > best.kwh ? x : best), sameDay[0]);
  const uses = i.solarUses.length ? i.solarUses.join(" or ") : "the washing machine or the car";
  const ongoing = w.start <= now + MIN_MS;
  return {
    id: idOf("solar-surplus", "sun", w.start, fmt.zone),
    kind: "solar-surplus",
    title: `Solar surplus ${ongoing ? "now until" : "expected"} ${ongoing ? `${hhmm(w.end, fmt.zone)}` : windowWords(w.start, w.end, now, fmt.zone)}: good time for ${uses}`,
    detail: `Peak about ${kwWords(w.peakKw)} to spare, about ${kwhWords(w.kwh)} in all`,
    why: [
      `The panels are forecast to make more than the house's ${kwWords(i.baseLoadKw)} base load plus ${kwWords(SURPLUS_MIN_KW)} from ${hhmm(w.start, fmt.zone)} to ${hhmm(w.end, fmt.zone)} (${dayWord(w.start, now, fmt.zone)}).`,
      `The most to spare in that time is ${kwWords(w.peakKw)}; over the whole stretch about ${kwhWords(w.kwh)}.`,
      "Running something then uses your own sun instead of the grid.",
    ],
    start: w.start,
    end: w.end,
    score: scored(45 + Math.min(20, w.kwh), w.start, w.end, now),
    remindAt: remindFor(w.start, now),
    routine: null,
  };
}

function sunCurtains(i: AdvisorInput, room: RoomSun): Advice | null {
  const { now, fmt } = i;
  const hot = i.comfort.max + HOT_MARGIN_C;
  for (const s of room.intervals) {
    if (s.end <= now || s.end - s.start < 30 * MIN_MS) continue;
    const top = maxTemp(i.hours, s.start, s.end);
    if (top === null || top < hot) continue;
    const dir = compassWord(s.azimuth);
    const lead = s.start - CURTAIN_LEAD_MS;
    const closeAt = lead <= now ? roundTo(now, 5) : Math.floor(lead / (5 * MIN_MS)) * 5 * MIN_MS;
    const time = hhmm(closeAt, fmt.zone);
    const gains = i.hours.filter((h) => h.ghi !== null && h.t - HOUR_MS < s.end && h.t > s.start);
    const ghi = gains.length ? gains.reduce((sum, h) => sum + (h.ghi ?? 0), 0) / gains.length : null;
    const diffuse = 0.2 + 0.8 * ((gains[0]?.cloud ?? 50) / 100);
    const gainKw = ghi === null ? null : (s.lit * room.areaM2 * ghi * (1 - diffuse) * GAIN_FACTOR) / 1000;
    const covering = room.curtains.length ? `close the ${dir} curtains` : `shade the ${dir} windows`;
    const why = [
      `${room.room} gets direct sun ${windowWords(s.start, s.end, now, fmt.zone)} (about ${Math.round(s.lit * 100)}% of the floor), coming from the ${dir}.`,
      `${fmt.temp(top)} is forecast at that time, ${fmt.temp(top - i.comfort.max)} over the top of your comfort band (${fmt.temp(i.comfort.min)} to ${fmt.temp(i.comfort.max)}).`,
    ];
    if (gainKw !== null && gainKw >= 0.1) why.push(`Roughly ${kwWords(gainKw)} of heat comes in through the windows then (floor ${Math.round(room.areaM2)} m2 x sun on the ground x about 60% through the glass): a rough estimate.`);
    why.push(`Closing them about half an hour before the sun arrives keeps the heat out instead of chasing it afterwards.`);
    return {
      id: idOf("sun-curtains", room.roomId, s.start, fmt.zone),
      kind: "sun-curtains",
      title: `${room.room} gets direct sun ${windowWords(s.start, s.end, now, fmt.zone)} and ${fmt.temp(top)} is forecast: ${covering} at ${time}`,
      detail: gainKw !== null && gainKw >= 0.1 ? `About ${kwWords(gainKw)} of sun heat would come in` : `${fmt.temp(top)} outside at the time`,
      why,
      start: s.start,
      end: s.end,
      score: scored(70 + Math.min(15, top - hot), s.start - CURTAIN_LEAD_MS, s.end, now),
      remindAt: remindFor(s.start - CURTAIN_LEAD_MS + 5 * MIN_MS, now),
      routine: room.curtains[0] ? { entity: room.curtains[0].entity, name: room.curtains[0].name, action: { verb: "close" }, time } : null,
    };
  }
  return null;
}

function ventilate(i: AdvisorInput): Advice | null {
  const { now, fmt, indoorC } = i;
  if (indoorC === null || indoorC <= i.comfort.max) return null;
  const ok = i.hours.filter((h) => h.tempC !== null && h.t >= now && h.t <= now + 24 * HOUR_MS && h.tempC <= indoorC - COOL_BY_C && h.tempC >= COOLEST_OK_C);
  if (!ok.length) return null;
  // the best run of up to three consecutive forecast hours: the one that cools the most in total
  let best: { from: number; to: number; gain: number; low: number } | null = null;
  for (let a = 0; a < ok.length; a++) {
    let gain = 0;
    let low = Infinity;
    for (let b = a; b < ok.length && b < a + MAX_VENT_POINTS && (b === a || ok[b].t - ok[b - 1].t <= HOUR_MS + MIN_MS); b++) {
      gain += indoorC - (ok[b].tempC ?? indoorC);
      low = Math.min(low, ok[b].tempC ?? low);
      if (!best || gain > best.gain + 1e-9) best = { from: ok[a].t, to: ok[b].t, gain, low };
    }
  }
  if (!best) return null;
  const start = Math.max(now, best.from);
  const end = best.to + HOUR_MS;
  const atStart = i.hours.find((h) => h.t === best.from)?.tempC ?? best.low;
  return {
    id: idOf("ventilate", "windows", start, fmt.zone),
    kind: "ventilate",
    title: `Open the windows ${windowWords(start, end, now, fmt.zone)} to cool down: ${fmt.temp(best.low)} outside vs ${fmt.temp(indoorC)} inside`,
    detail: `Inside is over your comfort band (${fmt.temp(i.comfort.max)}); outside is ${fmt.temp(indoorC - best.low)} cooler`,
    why: [
      `The house reads ${fmt.temp(indoorC)} now, above the top of your comfort band (${fmt.temp(i.comfort.max)}).`,
      `The forecast outside is ${fmt.temp(atStart)} at ${hhmm(best.from, fmt.zone)} and as low as ${fmt.temp(best.low)}: at least ${COOL_BY_C} degrees cooler than inside, and not cold enough to chill the house (above ${fmt.temp(COOLEST_OK_C)}).`,
      "Opening windows on opposite sides lets the cool air through. Close them again before it warms up.",
    ],
    start,
    end,
    score: scored(65 + Math.min(15, indoorC - i.comfort.max), start, end, now),
    remindAt: remindFor(start, now),
    routine: null,
  };
}

function warmOutside(i: AdvisorInput): Advice | null {
  const { now, fmt, indoorC } = i;
  if (indoorC === null || indoorC >= i.comfort.max - 1) return null;
  const day = i.hours.filter((h) => {
    const m = minuteOfDay(h.t, fmt.zone);
    return h.tempC !== null && h.t >= now && h.t <= now + 36 * HOUR_MS && m >= 9 * 60 && m <= 19 * 60 && h.tempC >= indoorC + 1;
  });
  let run: HourPoint[] = [];
  for (const h of day) {
    if (run.length && h.t - run[run.length - 1].t > HOUR_MS + MIN_MS) {
      if (run.length >= 2) break;
      run = [];
    }
    run.push(h);
  }
  if (run.length < 2) return null;
  const start = run[0].t;
  const end = run[run.length - 1].t;
  const peak = Math.max(...run.map((h) => h.tempC ?? -Infinity));
  const hour = minuteOfDay(start, fmt.zone) / 60;
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const open = peak <= i.comfort.max ? " An open window would warm the rooms for free." : "";
  return {
    id: idOf("warm-outside", "heating", start, fmt.zone),
    kind: "warm-outside",
    title: `Heating: ${dayWord(start, now, fmt.zone)} ${part} is warmer outside than inside`,
    detail: `${fmt.temp(peak)} outside vs ${fmt.temp(indoorC)} inside ${windowWords(start, end, now, fmt.zone)}`,
    why: [
      `The house reads ${fmt.temp(indoorC)} now.`,
      `The forecast outside is ${fmt.temp(peak)} at its warmest, ${windowWords(start, end, now, fmt.zone)}: at least one degree above the house for ${run.length} hours in a row.`,
      `The heating can rest then.${open}`,
    ],
    start,
    end,
    score: scored(35, start, end, now),
    remindAt: remindFor(start, now),
    routine: null,
  };
}

/** The advice for the moment `input.now`, best first. Each source is optional: what is missing leaves its cards out and, where it helps, says why in `notes`. */
export function advise(i: AdvisorInput): AdvisorResult {
  const cards: (Advice | null)[] = [];
  const notes: string[] = [];
  if (i.prices.length) {
    for (const a of i.appliances) cards.push(cheapRun(i, a));
    const reach = coveredUntil(i.prices, i.now);
    const tomorrow = addDays(dayStart(i.now, i.fmt.zone), 1, i.fmt.zone);
    if (i.tomorrowExpected && reach < addDays(tomorrow, 1, i.fmt.zone) && reach - i.now < 12 * HOUR_MS) notes.push("Tomorrow's prices are not out yet (they usually come out in the afternoon). The advice covers the time the prices reach.");
  }
  if (i.pv.length) cards.push(solarSurplus(i));
  if (i.hours.some((h) => h.tempC !== null)) {
    for (const r of i.rooms) cards.push(sunCurtains(i, r));
    cards.push(ventilate(i), warmOutside(i));
  }
  if (i.weatherChange) {
    const w = i.weatherChange;
    cards.push({ id: idOf("weather-change", "pressure", w.start, i.fmt.zone), kind: "weather-change", title: w.title, detail: w.detail, why: w.why, start: w.start, end: w.end, score: scored(85, w.start, w.end, i.now), remindAt: null, routine: null });
  }
  const advice = cards.filter((c): c is Advice => c !== null && c.score >= 0).sort((a, b) => b.score - a.score || a.start - b.start || (a.id < b.id ? -1 : 1));
  return { advice, notes };
}
