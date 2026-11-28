// How the advisor says numbers: amounts in the chosen currency, temperatures in the chosen unit, times on the home's clock. Plain words, no formatting library. Pure.
import { toDisplayTemp, type AdvisorSettings } from "./advisorSettings.ts";

export type Fmt = {
  zone: string;
  currency: string;
  /** "0.09 EUR" */
  money: (v: number) => string;
  /** "0.09" (the unit follows: "EUR/kWh") */
  price: (v: number) => string;
  /** "0.09 EUR/kWh" */
  perKwh: (v: number) => string;
  /** "28 °C" or "82 °F" */
  temp: (c: number) => string;
};

const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function makeFmt(currency: string, units: AdvisorSettings["units"], zone: string): Fmt {
  const price = (v: number) => number.format(Math.abs(v) < 0.0005 ? 0 : v);
  return {
    zone,
    currency,
    price,
    money: (v) => `${price(v)} ${currency}`,
    perKwh: (v) => `${price(v)} ${currency}/kWh`,
    temp: (c) => `${Math.round(toDisplayTemp(c, units))} °${units === "imperial" ? "F" : "C"}`,
  };
}

/** "1.5 kW", "800 W". */
export const kwWords = (kw: number): string => (kw < 1 ? `${Math.round(kw * 1000)} W` : `${(Math.round(kw * 10) / 10).toString()} kW`);

/** "3.2 kWh" with one decimal. */
export const kwhWords = (kwh: number): string => `${(Math.round(kwh * 10) / 10).toString()} kWh`;

/** "1 h 30 min", "45 min", "2 h". */
export function lengthWords(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
/** "west" for a compass bearing in degrees. */
export const compassWord = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
