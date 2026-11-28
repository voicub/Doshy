// Electricity prices as the advisor reads them: one list of time slots, each with a price per kWh, whatever the source looked like. Home Assistant price entities (Nord Pool,
// Energi Data Service, ENTSO-E, Tibber and Octopus add-ons ... each names its forecast attributes its own way), a fixed peak / off-peak tariff, and the helpers the engine uses.
// Everything that arrives from outside is checked here and bad entries are dropped, never guessed at. Pure.
import { isRecord } from "./guards.ts";
import { addDays, dayStart, minutesOf, parseTime, partsOf } from "./advisorTime.ts";

/** One stretch of time with one price: `start` and `end` are epoch ms, `price` is currency per kWh (may be zero or negative). */
export type PriceSlot = { start: number; end: number; price: number };

/** A slot longer than this is not a price slot (a whole week's average is not advice). */
const MAX_SLOT_MS = 6 * 3_600_000;
/** More slots than this is not a day-ahead list (quarter-hours for four days is 384). */
export const MAX_SLOTS = 800;
/** A price per kWh beyond this (in any currency) is a unit mistake, not a price. */
const MAX_ABS_PRICE = 1000;

/** The slots that are usable, in time order, with no overlaps: where two overlap the one that starts first (and, at the same start, the shorter) stays. */
export function cleanSlots(raw: readonly PriceSlot[]): PriceSlot[] {
  const ok = raw
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && Number.isFinite(s.price) && s.end > s.start && s.end - s.start <= MAX_SLOT_MS && Math.abs(s.price) <= MAX_ABS_PRICE)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: PriceSlot[] = [];
  for (const s of ok) {
    if (out.length && s.start < out[out.length - 1].end) continue;
    out.push({ start: s.start, end: s.end, price: s.price });
    if (out.length >= MAX_SLOTS) break;
  }
  return out;
}

// ---- units ----------------------------------------------------------------------------------------------------------------------------------------

/** How the price unit is read: from the entity's own unit text ("EUR/kWh", "c/kWh", "EUR/MWh"), or forced in the settings. */
export type UnitChoice = "auto" | "kwh" | "mwh" | "cents";

const SUBUNIT = /^(c|ct|cts|cent|cents|¢|p|pence|öre|ore|øre|eurocent|eurocents)$/i;
const CURRENCY_SIGN: Record<string, string> = { "€": "EUR", "$": "USD", "£": "GBP" };

/** What to multiply a reported price by to get currency per kWh, and the currency when the text names one ("EUR/MWh" -> 0.001, "EUR"). */
export function unitFactor(unitText: string | undefined, choice: UnitChoice): { factor: number; currency: string | null } {
  const m = /^\s*([^/\s]+)\s*\/\s*(kwh|mwh|wh)\s*$/i.exec(unitText ?? "");
  const currencyWord = m?.[1] ?? "";
  const subunit = SUBUNIT.test(currencyWord);
  const currency = CURRENCY_SIGN[currencyWord] ?? (/^[A-Za-z]{3}$/.test(currencyWord) && !subunit ? currencyWord.toUpperCase() : null);
  const per = m?.[2].toLowerCase();
  const perFactor = per === "mwh" ? 0.001 : per === "wh" ? 1000 : 1;
  if (choice === "kwh") return { factor: 1, currency };
  if (choice === "mwh") return { factor: 0.001, currency };
  if (choice === "cents") return { factor: 0.01, currency };
  return { factor: perFactor * (subunit ? 0.01 : 1), currency };
}

// ---- Home Assistant price entities ------------------------------------------------------------------------------------------------------------------

const START_KEYS = ["start", "start_time", "startsAt", "starts_at", "from", "valid_from", "period_start", "hour", "datetime", "time", "date"] as const;
const END_KEYS = ["end", "end_time", "endsAt", "ends_at", "to", "valid_to", "period_end"] as const;
const VALUE_KEYS = ["value", "price", "total", "value_inc_vat", "price_per_kwh", "per_kwh", "spot_price", "amount", "energy"] as const;
/** The attribute names the common integrations put their per-slot lists under (Nord Pool: raw_today / raw_tomorrow; Energi Data Service: raw_today / forecast; ENTSO-E add-on: prices_today / prices_tomorrow / prices; Octopus: rates). */
const LIST_KEYS = ["raw_today", "raw_tomorrow", "prices_today", "prices_tomorrow", "prices", "forecast", "forecasts", "rates", "data"] as const;
/** Plain lists of numbers, one per slot of the day (Nord Pool and Tibber add-ons: `today`, `tomorrow`). */
const DAY_ARRAYS = [["today", 0], ["tomorrow", 1]] as const;
const MAX_ITEMS = 1000;

const pick = <K extends string>(o: Record<string, unknown>, keys: readonly K[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** The slots of a list of `{ start, end?, value }` objects: a missing end is the next item's start (the last one lasts as long as the one before it). */
function slotsOfObjects(list: readonly unknown[], zone: string): PriceSlot[] {
  const rows: { start: number; end: number | null; price: number }[] = [];
  for (const item of list.slice(0, MAX_ITEMS)) {
    if (!isRecord(item)) continue;
    const start = parseTime(pick(item, START_KEYS), zone);
    const price = num(pick(item, VALUE_KEYS));
    const endRaw = pick(item, END_KEYS);
    const end = endRaw === undefined ? null : parseTime(endRaw, zone);
    if (start !== null && price !== null) rows.push({ start, end, price });
  }
  rows.sort((a, b) => a.start - b.start);
  return rows.map((r, i) => {
    const next = rows[i + 1]?.start;
    const prev = rows[i - 1];
    const guess = next ?? (prev ? r.start + (r.start - prev.start) : r.start + 3_600_000);
    return { start: r.start, end: r.end ?? guess, price: r.price };
  });
}

/** Plain day arrays are accepted only at hourly, half-hourly or quarter-hourly resolution on the actual local day. A 24-entry DST day has ambiguous hours: skip it, never stretch prices. */
function slotsOfDayArray(values: readonly unknown[], dayStartMs: number, nextDayMs: number): PriceSlot[] {
  const n = values.length;
  const hours = (nextDayMs - dayStartMs) / 3_600_000;
  if (![hours, hours * 2, hours * 4].includes(n)) return [];
  const length = (nextDayMs - dayStartMs) / n;
  const out: PriceSlot[] = [];
  values.forEach((v, i) => {
    const price = num(v);
    if (price !== null) out.push({ start: Math.round(dayStartMs + i * length), end: Math.round(dayStartMs + (i + 1) * length), price });
  });
  return out;
}

export type EntityPrices = { slots: PriceSlot[]; currency: string | null };

/**
 * The slots an entity's attributes carry. The per-slot lists win over the plain day arrays (they carry their own times); every list found is merged (today and tomorrow often
 * sit in two attributes). `attrs.unit` / `unit_of_measurement` / `price_unit` and `currency` say the unit; `choice` overrides them.
 */
export function entityPrices(attrs: Record<string, unknown>, now: number, zone: string, choice: UnitChoice = "auto"): EntityPrices {
  const unitText = [attrs.unit, attrs.price_unit, attrs.unit_of_measurement].find((u): u is string => typeof u === "string");
  const { factor, currency: fromUnit } = unitFactor(unitText, choice);
  const fromAttr = typeof attrs.currency === "string" && /^[A-Za-z]{3}$/.test(attrs.currency) ? attrs.currency.toUpperCase() : null;
  const found: PriceSlot[] = [];
  for (const key of LIST_KEYS) {
    const list = attrs[key];
    if (Array.isArray(list)) found.push(...slotsOfObjects(list, zone));
    else if (isRecord(list)) found.push(...slotsOfObjects(Object.entries(list).slice(0, MAX_ITEMS).map(([start, value]) => isRecord(value) ? { ...value, start } : { start, value }), zone));
  }
  if (!found.length) {
    const today = dayStart(now, zone);
    for (const [key, offset] of DAY_ARRAYS) {
      const list = attrs[key];
      if (Array.isArray(list)) found.push(...slotsOfDayArray(list, addDays(today, offset, zone), addDays(today, offset + 1, zone)));
    }
  }
  return { slots: cleanSlots(found.map((s) => ({ ...s, price: s.price * factor }))), currency: fromUnit ?? fromAttr };
}

// ---- fixed tariff -----------------------------------------------------------------------------------------------------------------------------------

/** A fixed day / night tariff: the cheap hours are `offFrom` to `offTo` (they may cross midnight), all day at the weekend when `weekendOffPeak`. */
export type Tariff = { peak: number; offPeak: number; offFrom: string; offTo: string; weekendOffPeak: boolean };
export const DEFAULT_TARIFF: Tariff = { peak: 0.3, offPeak: 0.15, offFrom: "22:00", offTo: "06:00", weekendOffPeak: false };

const TARIFF_STEP_MS = 30 * 60_000;

/** Half-hour slots of the tariff from the start of today for `days` days. Stepped in real time and read off the zone's clock, so a 23 or 25 hour day has no gap and no double hour. */
export function tariffSlots(t: Tariff, now: number, days: number, zone: string): PriceSlot[] {
  const from = minutesOf(t.offFrom);
  const to = minutesOf(t.offTo);
  const first = dayStart(now, zone);
  const last = addDays(first, days, zone);
  const out: PriceSlot[] = [];
  for (let start = first; start < last; start += TARIFF_STEP_MS) {
    const p = partsOf(start, zone);
    const min = p.h * 60 + p.mi;
    const weekend = p.wd === 0 || p.wd === 6;
    const cheap = (weekend && t.weekendOffPeak) || (from !== null && to !== null && (from < to ? min >= from && min < to : min >= from || min < to));
    out.push({ start, end: start + TARIFF_STEP_MS, price: cheap ? t.offPeak : t.peak });
  }
  return cleanSlots(out);
}

// ---- reading a curve ----------------------------------------------------------------------------------------------------------------------------------

/** The slot that holds `t`, or undefined. */
export const slotAt = (slots: readonly PriceSlot[], t: number): PriceSlot | undefined => slots.find((s) => s.start <= t && t < s.end);

/** The price averaged over [start, end) by time; null when the slots leave any of it uncovered. */
export function averagePrice(slots: readonly PriceSlot[], start: number, end: number): number | null {
  if (end <= start) return null;
  let covered = 0;
  let sum = 0;
  for (const s of slots) {
    const a = Math.max(s.start, start);
    const b = Math.min(s.end, end);
    if (b > a) {
      covered += b - a;
      sum += s.price * (b - a);
    }
  }
  return Math.abs(covered - (end - start)) < 1000 ? sum / covered : null;
}

/** The end of the prices that run without a gap from `from` on (the day-ahead list ends when tomorrow's prices are not out yet). */
export function coveredUntil(slots: readonly PriceSlot[], from: number): number {
  let t = from;
  for (const s of slots) {
    if (s.end <= t) continue;
    if (s.start > t + 1000) break;
    t = s.end;
  }
  return t;
}

/** Every price in the list, in time order, with the slots clipped to [from, ...): what the "average" and the "highest" lines of a Why? read. */
export function pricesFrom(slots: readonly PriceSlot[], from: number): PriceSlot[] {
  return slots.filter((s) => s.end > from).map((s) => (s.start < from ? { ...s, start: from } : s));
}
