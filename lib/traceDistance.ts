// A length typed by a person ("4.2", "4,2", "4.2 m", "420 cm") and a length shown to one. Metric only: the app has no units setting yet, so this is the one place to add it. Pure.

const FACTOR = { mm: 0.001, cm: 0.01, m: 1, metre: 1, metres: 1, meter: 1, meters: 1 } as const;
const TYPED = /^(\d+[.,]?\d*|[.,]\d+)\s*(mm|cm|m|metres?|meters?)?$/i;
const LONGEST_M = 1000; // a flat plan is metres, a garden tens of metres: more than a kilometre is a typo

/** Metres from what was typed, or null when it is not a length (no number, an unknown unit, zero, absurdly long). A comma is a decimal comma. No unit means metres. */
export function parseDistance(text: string): number | null {
  const m = TYPED.exec(text.trim());
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  const metres = value * FACTOR[(m[2]?.toLowerCase() ?? "m") as keyof typeof FACTOR];
  return Number.isFinite(metres) && metres > 0 && metres <= LONGEST_M ? metres : null;
}

/** A length for people: two decimals under 10 m, one above ("4.20 m", "12.4 m"). */
export const lenText = (metres: number): string => `${metres.toFixed(Math.abs(metres) < 10 ? 2 : 1)} m`;
