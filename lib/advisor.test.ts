import assert from "node:assert/strict";
import { test } from "node:test";
import { advise, cheapestWindow, surplusWindows, tempAt, type AdvisorInput } from "./advisor.ts";
import { parseAwattar, parseEntsoe } from "./advisorFeeds.ts";
import { entityPrices, tariffSlots, averagePrice } from "./advisorPrices.ts";
import { parseOpenMeteo, parseWeatherForecast, pvFromDailyTotal, pvFromForecast } from "./advisorForecast.ts";
import { parseSettings } from "./advisorSettings.ts";
import { makeFmt } from "./advisorFormat.ts";
import { addDays, dayStart, hhmm, localTime } from "./advisorTime.ts";

const H = 3_600_000;
const now = Date.parse("2026-07-01T08:00:00Z");
const prices = [0.24, 0.24, 0.24, 0.09, 0.09, 0.24].map((price, i) => ({ start: now + i * H, end: now + (i + 1) * H, price }));
const input = (): AdvisorInput => ({ now, fmt: makeFmt("EUR", "metric", "UTC"), prices, tomorrowExpected: true, pv: [], hours: [], indoorC: null, comfort: { min: 20, max: 24 }, baseLoadKw: 0.3, appliances: [{ kind: "dishwasher", name: "Dishwasher", minutes: 120, kwh: 1, measured: false, entity: "switch.dishwasher" }], rooms: [], solarUses: [], weatherChange: null });
const xml = (curve = "A01", points = "<Point><position>1</position><price.amount>-20</price.amount></Point><Point><position>2</position><price.amount>90</price.amount></Point>") => `<?xml version="1.0"?><Publication_MarketDocument xmlns="urn:iec"><TimeSeries><currency_Unit.name>EUR</currency_Unit.name><price_Measure_Unit.name>MWH</price_Measure_Unit.name><curveType>${curve}</curveType><Period><timeInterval><start>2026-07-01T08:00Z</start><end>2026-07-01T10:00Z</end></timeInterval><resolution>PT60M</resolution>${points}</Period></TimeSeries></Publication_Mar ketDocument>`.replace("Mar ket", "Market");

test("cheapest contiguous window integrates partial slots, negative prices and earliest ties", () => {
  assert.deepEqual(cheapestWindow(prices, now, 2 * H), { start: now + 3 * H, end: now + 5 * H, avg: 0.09 });
  assert.equal(cheapestWindow(prices.map((s) => ({ ...s, price: -0.1 })), now, H)?.start, now);
  assert.equal(cheapestWindow(prices, now + H / 2, 1.5 * H)?.start, now + 3 * H);
  assert.equal(cheapestWindow([prices[0], prices[2]], now, 2 * H), null);
  assert.equal(averagePrice(prices, now, now + 2 * H), 0.24);
  assert.equal(cheapestWindow(prices, now, 0), null);
});

test("advice has explained savings, stable ids and only a routine seed", () => {
  const a = advise(input());
  assert.equal(a.advice[0].kind, "cheap-run");
  assert.match(a.advice[0].detail, /0.15/);
  assert.ok(a.advice[0].why.length >= 3);
  assert.equal(a.advice[0].routine?.time, "11:00");
  assert.equal(a.advice[0].id, advise(input()).advice[0].id);
  assert.ok(a.notes.length > 0);
  assert.equal(advise({ ...input(), prices: prices.map((s) => ({ ...s, price: 0.2 })) }).advice.length, 0);
  assert.equal(advise({ ...input(), prices: [] }).advice.length, 0);
});

test("surplus clips now and separates gaps", () => {
  const pv = [0, 1, 2, 4].map((h) => ({ start: now + h * H, end: now + (h + 1) * H, kw: 2 }));
  const windows = surplusWindows(pv, 0.3, 0.8, now + H / 2, now + 6 * H);
  assert.equal(windows.length, 2);
  assert.equal(windows[0].kwh, 4.25);
  assert.equal(advise({ ...input(), pv }).advice.some((a) => a.kind === "solar-surplus"), true);
});

test("comfort advice uses forecast and real room sun; missing feeds leave no invented advice", () => {
  const hours = [17, 17, 18, 28, 29, 29].map((tempC, i) => ({ t: now + i * H, tempC, cloud: 0, ghi: 700, rainChance: null, pressureHpa: null }));
  const result = advise({ ...input(), indoorC: 26, hours, rooms: [{ roomId: "living", room: "Living room", areaM2: 20, intervals: [{ start: now + 3 * H, end: now + 5 * H, azimuth: 270, lit: 0.5 }], curtains: [{ entity: "cover.west", name: "West curtains" }] }] });
  assert.ok(result.advice.some((a) => a.kind === "ventilate"));
  const shade = result.advice.find((a) => a.kind === "sun-curtains");
  assert.equal(shade?.routine?.time, "10:30");
  assert.ok(shade?.why.some((line) => line.includes("heat")));
  assert.equal(tempAt(hours, now + H / 2), 17);
  assert.equal(tempAt([], now), null);
  assert.ok(advise({ ...input(), indoorC: 16, hours }).advice.some((a) => a.kind === "warm-outside"));
});

test("aWATTar converts EUR/MWh without losing negatives and rejects wrong units", () => {
  const slots = parseAwattar({ data: [{ start_timestamp: now, end_timestamp: now + H, marketprice: -20, unit: "Eur/MWh" }, { start_timestamp: now + H, end_timestamp: now + 2 * H, marketprice: 90, unit: "GBP/kWh" }] }, { vat: 20, add: 0.01 });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].price, -0.014);
  assert.deepEqual(parseAwattar(null), []);
});

test("ENTSO-E reads hourly and quarter-hour prices and acknowledgement", () => {
  assert.deepEqual(parseEntsoe(xml())?.slots.map((s) => s.price), [-0.02, 0.09]);
  const quarter = xml("A03", "<Point><position>1</position><price.amount>50</price.amount></Point>").replace("PT60M", "PT15M");
  assert.equal(parseEntsoe(quarter)?.slots.length, 8);
  assert.equal(parseEntsoe("<Acknowledgement_MarketDocument><Reason><text>No matching data found</text></Reason></Acknowledgement_MarketDocument>")?.note, "No matching data found");
  assert.equal(parseEntsoe("<broken>"), null);
});

test("ENTSO-E does not invent missing A01 points, accept DTD or combine currencies", () => {
  const sparse = xml("A01", "<Point><position>1</position><price.amount>50</price.amount></Point>");
  assert.equal(parseEntsoe(sparse)?.slots.length, 1);
  assert.equal(parseEntsoe(`<!DOCTYPE a [<!ENTITY leak SYSTEM 'file:///tmp/no'>]>${xml()}`), null);
  const mixed = xml().replace("</TimeSeries>", "</TimeSeries><TimeSeries><currency_Unit.name>GBP</currency_Unit.name><price_Measure_Unit.name>MWH</price_Measure_Unit.name></TimeSeries>");
  assert.equal(parseEntsoe(mixed), null);
});

test("HA Nord Pool, Tibber, forecast and timestamp-keyed shapes normalize units", () => {
  for (const key of ["raw_today", "raw_tomorrow", "prices", "forecast"]) {
    assert.equal(entityPrices({ [key]: [{ start: now, end: now + H, value: 90 }], unit_of_measurement: "EUR/MWh" }, now, "UTC").slots[0].price, 0.09);
  }
  assert.equal(entityPrices({ prices: [{ startsAt: "2026-07-01T08:00:00Z", total: 0.15 }], currency: "EUR" }, now, "UTC").slots[0].price, 0.15);
  assert.equal(entityPrices({ today: Array(24).fill(9), unit: "ct/kWh" }, now, "UTC").slots[0].price, 0.09);
  assert.equal(entityPrices({ prices: { "2026-07-01T08:00:00Z": 0.1 } }, now, "UTC").slots[0]?.price, 0.1);
});

test("DST price arrays never invent evenly stretched hours; explicit slots preserve repeated hour", () => {
  const spring = localTime(2026, 3, 29, 12, 0, "Europe/Berlin");
  const autumn = localTime(2026, 10, 25, 12, 0, "Europe/Berlin");
  assert.equal(addDays(dayStart(spring, "Europe/Berlin"), 1, "Europe/Berlin") - dayStart(spring, "Europe/Berlin"), 23 * H);
  assert.equal(tariffSlots({ peak: 0.3, offPeak: 0.1, offFrom: "22:00", offTo: "06:00", weekendOffPeak: false }, autumn, 1, "Europe/Berlin").length, 50);
  assert.equal(entityPrices({ today: Array(24).fill(0.1) }, spring, "Europe/Berlin").slots.length, 0);
  const first = Date.parse("2026-10-25T02:00:00+02:00");
  const second = Date.parse("2026-10-25T02:00:00+01:00");
  assert.equal(hhmm(first, "Europe/Berlin"), hhmm(second, "Europe/Berlin"));
  assert.equal(cheapestWindow([{ start: first, end: second, price: 0.1 }, { start: second, end: second + H, price: -0.1 }], first, H)?.start, second);
});

test("forecast parsers validate columns and Fahrenheit; PV energy follows the source total", () => {
  const forecast = parseOpenMeteo({ hourly: { time: [now / 1000, now / 1000 + 3600], temperature_2m: [20, 21], cloud_cover: [0], shortwave_radiation: [600, 700] } });
  assert.equal(forecast?.hours[0].cloud, null);
  assert.equal(forecast?.hours[1].tempC, 21);
  assert.equal(parseWeatherForecast([{ datetime: now, temperature: 68 }], "UTC", true)?.hours[0].tempC, 20);
  assert.equal(parseOpenMeteo({ hourly: {} }), null);
  const pv = pvFromDailyTotal(10, "kWh", dayStart(now, "UTC"), "UTC", 45, 25);
  assert.ok(Math.abs(pv.reduce((sum, s) => sum + s.kw * (s.end - s.start) / H, 0) - 10) < 0.02);
  assert.ok(pvFromForecast(forecast?.hours ?? [], { kwp: 5, tilt: 30, azimuth: 180, efficiency: 0.8 }, 45, 25).every((s) => s.kw >= 0));
});

test("settings discard secrets and invalid entities and bound all physical settings", () => {
  const settings = parseSettings({ token: "do-not-store", price: { source: "bad", entity: "https://bad", zone: "bad", vat: 1000 }, climate: { min: 30, max: 10 }, solar: { pv: { kwp: Infinity, tilt: 200 } }, place: { lat: NaN, lon: 0 } });
  assert.equal(settings.price.source, "none");
  assert.equal(settings.price.entity, "");
  assert.equal(settings.price.vat, 100);
  assert.ok(settings.climate.min < settings.climate.max);
  assert.equal(settings.solar.pv.tilt, 90);
  assert.equal(settings.place, null);
  assert.ok(!("token" in settings));
});
