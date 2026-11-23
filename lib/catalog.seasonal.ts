import type { Def } from "./catalog";
import { HOLIDAYS } from "./catalog.seasonal-holidays.ts";
import { XMAS } from "./catalog.seasonal-xmas.ts";
import { holidayStrength, type EasterRite, type HolidayId } from "./season.ts";

// Seasonal and holiday decoration (Christmas trees and lights, wreaths, pumpkins ...), linkable to Home Assistant lights.
// Every kind is `sz_<holiday>_<name>`. Light-bearing pieces have glow parts and a `light`, so a linked light or switch turns them on and off,
// and an RGB light recolours them. Parts with `twinkle` shimmer while lit (see twinkleLevel). The files: catalog.seasonal-xmas.ts (Christmas),
// catalog.seasonal-holidays.ts (everything else), catalog.seasonal-kit.ts (shared helpers).
export const SEASONAL: Record<string, Def> = { ...XMAS, ...HOLIDAYS };

/** Which of lib/season.ts's holiday windows a kind belongs to; Thanksgiving, Diwali, Eid, Hanukkah, Lunar New Year, birthday and the flags have none. */
const HOLIDAY_OF: Record<string, HolidayId> = { xm: "CHRISTMAS", hw: "HALLOWEEN", ea: "EASTER", vd: "VALENTINE", ny: "NEW_YEAR", mt: "MARTISOR" };
export const holidayOfKind = (kind: string): HolidayId | undefined => (kind.startsWith("sz_") ? HOLIDAY_OF[kind.split("_")[1]] : undefined);

/**
 * True when a piece set to hide outside its season (`params.seasonal`, default off) should be hidden on `date`. Pieces with no window never hide.
 * `forced` is the dashboard's holiday override: forcing a holiday shows its pieces whatever the date.
 */
export function outOfSeason(kind: string, date: Date, rite: EasterRite = "orthodox", forced?: string): boolean {
  const id = holidayOfKind(kind);
  return !!id && forced !== id && holidayStrength(id, date, rite) === 0;
}

const GOLDEN = 2.399;
/** Brightness factor (0.56..1) of bulb number `i` at time `t` seconds: gentle, each bulb on its own phase and a slightly different pace. `speed` 2 = candle flicker. */
export const twinkleLevel = (t: number, i: number, speed = 1): number => 0.78 + 0.22 * Math.sin(t * speed * (1.1 + (0.9 * ((i * 7) % 5)) / 4) + i * GOLDEN);
