// The two public day-ahead price feeds the advisor can read, as plain parsers (the server fetches, these check what came back): aWATTar's JSON (Germany and Austria, no key) and
// ENTSO-E Transparency Platform's XML (most of Europe, a free security token). Both answer prices per MWh; the slots here are per kWh. Pure: nothing here touches the network.
import { isRecord } from "./guards.ts";
import { cleanSlots, type PriceSlot } from "./advisorPrices.ts";

export const AWATTAR_HOSTS = { de: "https://api.awattar.de", at: "https://api.awattar.at" } as const;
export type AwattarCountry = keyof typeof AWATTAR_HOSTS;

/** What the feed's market price becomes: VAT on top (percent), then a fixed amount per kWh (grid fees, taxes). Both default to nothing: the feeds publish the bare market price. */
export type Markup = { vat: number; add: number };
const applyMarkup = (perKwh: number, m: Markup): number => perKwh * (1 + m.vat / 100) + m.add;

// ---- aWATTar ----------------------------------------------------------------------------------------------------------------------------------------

/**
 * `{ object: "list", data: [{ start_timestamp, end_timestamp, marketprice, unit: "Eur/MWh" }] }` (timestamps in epoch milliseconds, the price without VAT; the feed publishes the next day
 * at 14:00 CET). An entry that is not a number pair, or whose unit is not Eur/MWh, is dropped: a different unit would put every price off by a factor of a thousand.
 */
export function parseAwattar(json: unknown, markup: Markup = { vat: 0, add: 0 }): PriceSlot[] {
  if (!isRecord(json) || !Array.isArray(json.data)) return [];
  const slots: PriceSlot[] = [];
  for (const row of json.data.slice(0, 1000)) {
    if (!isRecord(row)) continue;
    const { start_timestamp: start, end_timestamp: end, marketprice, unit } = row;
    if (typeof start !== "number" || typeof end !== "number" || typeof marketprice !== "number") continue;
    if (typeof unit === "string" && !/^eur\s*\/\s*mwh$/i.test(unit.trim())) continue;
    slots.push({ start, end, price: applyMarkup(marketprice / 1000, markup) });
  }
  return cleanSlots(slots);
}

// ---- ENTSO-E ----------------------------------------------------------------------------------------------------------------------------------------

/** The bidding zones the picker offers: name, and the EIC code the API wants as `in_Domain` and `out_Domain` (from ENTSO-E's own area list). */
export const ENTSOE_ZONES: readonly { code: string; name: string }[] = [
  { code: "10YRO-TEL------P", name: "Romania" },
  { code: "10Y1001A1001A82H", name: "Germany and Luxembourg" },
  { code: "10YAT-APG------L", name: "Austria" },
  { code: "10YFR-RTE------C", name: "France" },
  { code: "10YNL----------L", name: "Netherlands" },
  { code: "10YBE----------2", name: "Belgium" },
  { code: "10YES-REE------0", name: "Spain" },
  { code: "10YPT-REN------W", name: "Portugal" },
  { code: "10Y1001A1001A73I", name: "Italy, North" },
  { code: "10YCH-SWISSGRIDZ", name: "Switzerland" },
  { code: "10YPL-AREA-----S", name: "Poland" },
  { code: "10YCZ-CEPS-----N", name: "Czechia" },
  { code: "10YSK-SEPS-----K", name: "Slovakia" },
  { code: "10YHU-MAVIR----U", name: "Hungary" },
  { code: "10YSI-ELES-----O", name: "Slovenia" },
  { code: "10YHR-HEP------M", name: "Croatia" },
  { code: "10YCA-BULGARIA-R", name: "Bulgaria" },
  { code: "10YGR-HTSO-----Y", name: "Greece" },
  { code: "10YDK-1--------W", name: "Denmark, west (DK1)" },
  { code: "10YDK-2--------M", name: "Denmark, east (DK2)" },
  { code: "10Y1001A1001A46L", name: "Sweden, SE3" },
  { code: "10Y1001A1001A47J", name: "Sweden, SE4" },
  { code: "10YNO-1--------2", name: "Norway, NO1" },
  { code: "10YFI-1--------U", name: "Finland" },
  { code: "10Y1001A1001A39I", name: "Estonia" },
  { code: "10YLV-1001A00074", name: "Latvia" },
  { code: "10YLT-1001A0008Q", name: "Lithuania" },
];
export const DEFAULT_ENTSOE_ZONE = "10YRO-TEL------P";
export const isEntsoeZone = (code: unknown): code is string => typeof code === "string" && ENTSOE_ZONES.some((z) => z.code === code);

// A deliberately small XML reader: elements, attributes skipped, text, no DTD or entities beyond the five basic ones. The document is a Publication_MarketDocument from a known
// host; anything outside what the parser understands makes it give up (`null`), never a half-read price list.
type XmlNode = { name: string; text: string; children: XmlNode[] };
const MAX_XML_BYTES = 2_000_000;
const MAX_NODES = 60_000;
const MAX_DEPTH = 12;
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** Elements of an XML text as a tree (names without their namespace prefix). Null when the text is not well-formed XML of this simple kind. */
function readXml(xml: string): XmlNode | null {
  if (xml.length > MAX_XML_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const root: XmlNode = { name: "", text: "", children: [] };
  const stack: XmlNode[] = [root];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^<>]*?)?)(\/?)>/g;
  let at = 0;
  let nodes = 0;
  const addText = (raw: string) => {
    const top = stack[stack.length - 1];
    top.text += raw.replace(/&(?:amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e] ?? e);
  };
  for (let m = tag.exec(xml); m !== null; m = tag.exec(xml)) {
    const between = xml.slice(at, m.index);
    if (between.includes("<") || /&(?!(?:amp|lt|gt|quot|apos);)/.test(between)) return null;
    addText(between);
    at = m.index + m[0].length;
    if (m[1] !== undefined) {
      stack[stack.length - 1].text += m[1];
    } else if (m[2] !== undefined) {
      if (stack.length < 2 || stack[stack.length - 1].name !== m[2].replace(/^[^:]*:/, "")) return null; // closes something that is not open
      stack.pop();
    } else if (m[3] !== undefined) {
      if (++nodes > MAX_NODES || stack.length > MAX_DEPTH) return null;
      const node: XmlNode = { name: m[3].replace(/^[^:]*:/, ""), text: "", children: [] };
      stack[stack.length - 1].children.push(node);
      if (!m[5]) stack.push(node);
    }
  }
  const trailing = xml.slice(at);
  if (trailing.includes("<")) return null;
  addText(trailing);
  return stack.length === 1 && root.children.length === 1 && !root.text.trim() ? root : null;
}

const child = (n: XmlNode, name: string): XmlNode | undefined => n.children.find((c) => c.name === name);
const kids = (n: XmlNode, name: string): XmlNode[] => n.children.filter((c) => c.name === name);
const textOf = (n: XmlNode | undefined): string => n?.text.trim() ?? "";

/** "PT60M" / "PT15M" / "PT30M" / "PT1H" -> milliseconds; null for anything else. */
function resolutionMs(text: string): number | null {
  const m = /^PT(?:(\d{1,2})H)?(?:(\d{1,3})M)?$/.exec(text);
  const minutes = m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 0;
  return minutes >= 1 && minutes <= 360 ? minutes * 60_000 : null;
}

const isoMs = (text: string): number | null => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(text) ? Date.parse(text) : null);

/** Why an ENTSO-E answer holds no prices: the platform says so with an Acknowledgement document ("No matching data found" is an ordinary answer for a day not published yet). */
export type EntsoeParse = { slots: PriceSlot[]; currency: string | null; note: string | null } | null;

/**
 * An ENTSO-E day-ahead (document type A44) answer. Each `Period` has a start, a resolution (PT60M, or PT15M since the 15-minute market) and `Point`s numbered from 1 with `price.amount`.
 * Curve type A03 leaves out a point whose price did not change: the earlier price carries on until the next point or the end of the period. Where two series cover the same
 * time, the finer slots win. Prices are per MWh in the series' own currency; the result is per kWh with the markup added. Null when the text is not an ENTSO-E price document.
 */
export function parseEntsoe(xml: string, markup: Markup = { vat: 0, add: 0 }): EntsoeParse {
  const doc = readXml(xml);
  const top = doc?.children[0];
  if (!top) return null;
  if (top.name === "Acknowledgement_MarketDocument") return { slots: [], currency: null, note: textOf(child(child(top, "Reason") ?? top, "text")).slice(0, 200) || "ENTSO-E has no prices for that time" };
  if (top.name !== "Publication_MarketDocument") return null;
  const slots: PriceSlot[] = [];
  let currency: string | null = null;
  for (const series of kids(top, "TimeSeries")) {
    const cur = textOf(child(series, "currency_Unit.name"));
    if (!/^[A-Z]{3}$/.test(cur) || (currency !== null && currency !== cur)) return null;
    currency = cur;
    const curve = textOf(child(series, "curveType"));
    if (curve && curve !== "A01" && curve !== "A03") continue;
    const unit = textOf(child(series, "price_Measure_Unit.name")).toUpperCase();
    if (unit && unit !== "MWH") continue; // a unit other than per MWh would be off by a factor
    for (const period of kids(series, "Period")) {
      const interval = child(period, "timeInterval");
      const start = isoMs(textOf(child(interval ?? period, "start")));
      const end = isoMs(textOf(child(interval ?? period, "end")));
      const step = resolutionMs(textOf(child(period, "resolution")));
      if (start === null || end === null || step === null || end <= start) continue;
      const count = (end - start) / step;
      if (!Number.isInteger(count) || count < 1 || count > 400) continue;
      const byPosition = new Map<number, number>();
      for (const point of kids(period, "Point")) {
        const position = Number(textOf(child(point, "position")));
        const amount = textOf(child(point, "price.amount"));
        const price = amount === "" ? NaN : Number(amount);
        if (Number.isInteger(position) && position >= 1 && position <= count && Number.isFinite(price)) byPosition.set(position, price);
      }
      let last: number | undefined;
      for (let position = 1; position <= count; position++) {
        last = byPosition.get(position) ?? (curve === "A03" ? last : undefined);
        if (last !== undefined) slots.push({ start: start + (position - 1) * step, end: start + position * step, price: applyMarkup(last / 1000, markup) });
      }
    }
  }
  return { slots: cleanSlots(slots), currency, note: null };
}

/** `yyyyMMddHHmm` in UTC: the way the API wants `periodStart` and `periodEnd` (minutes must be 00, so the hour is floored). */
export function entsoeStamp(ms: number): string {
  const d = new Date(Math.floor(ms / 3_600_000) * 3_600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}00`;
}
