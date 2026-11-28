/**
 * Seasons, holidays and the garden palettes that follow them. Pure: no React, no three.js, so it runs under `node --test`.
 * Dates are read in the machine's local time zone (the dashboard runs in the flat); Bucharest is the default home.
 */
export type Season = "spring" | "summer" | "autumn" | "winter";
export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];
export const nextSeason = (s: Season): Season => SEASONS[(SEASONS.indexOf(s) + 1) % 4];

export type SeasonBlend = { season: Season; next: Season; mix: number };

/** The palettes cross-fade over the last BLEND_DAYS days of a season. */
const BLEND_DAYS = 10;
const DAY_MS = 86_400_000;
/** Calendar day number (UTC epoch days) of a local calendar date. */
const dayNum = (y: number, m0: number, d: number) => Date.UTC(y, m0, d) / DAY_MS;
/** Local calendar position of `date`: whole days since the epoch plus the fraction of the local day. */
const position = (d: Date) => dayNum(d.getFullYear(), d.getMonth(), d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;

const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Meteorological season of the northern hemisphere by 0-based month (Dec-Feb winter), flipped for the southern one. */
export function seasonOf(date: Date, lat: number): Season {
  const north: Season[] = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
  const s = north[date.getMonth()];
  return lat < 0 ? SEASONS[(SEASONS.indexOf(s) + 2) % 4] : s;
}

/** The season, the one after it and how far the palette has moved toward it (0 outside the last BLEND_DAYS days). */
export function seasonBlend(date: Date, lat: number): SeasonBlend {
  const season = seasonOf(date, lat);
  const y = date.getFullYear();
  // first day of the next season: the next month boundary (Mar, Jun, Sep, Dec) after today
  const boundaries = [2, 5, 8, 11, 14].map((m) => dayNum(y, m, 1));
  const boundary = boundaries.find((b) => b > position(date)) ?? boundaries[boundaries.length - 1];
  return { season, next: nextSeason(season), mix: smooth01(1 - (boundary - position(date)) / BLEND_DAYS) };
}

// ---------------------------------------------------------------- Easter

/** Orthodox Easter (Gregorian calendar date): Meeus' Julian algorithm plus the 13 day offset valid 1900-2099. */
export function orthodoxEaster(year: number): Date {
  const a = year % 4, b = year % 7, c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 March, 4 April (Julian)
  const day = ((d + e + 114) % 31) + 1;
  return new Date(year, month - 1, day + 13);
}

/** Western Easter (anonymous Gregorian algorithm). */
export function westernEaster(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export type EasterRite = "orthodox" | "western";
export const easterDate = (year: number, rite: EasterRite = "orthodox") => (rite === "western" ? westernEaster(year) : orthodoxEaster(year));

// ---------------------------------------------------------------- holidays

export type HolidayId = "NEW_YEAR" | "VALENTINE" | "MARTISOR" | "EASTER" | "HALLOWEEN" | "NATIONAL_DAY" | "CHRISTMAS";
export const HOLIDAY_IDS: readonly HolidayId[] = ["NEW_YEAR", "VALENTINE", "MARTISOR", "EASTER", "HALLOWEEN", "NATIONAL_DAY", "CHRISTMAS"];
export const HOLIDAY_LABEL: Record<HolidayId, string> = {
  NEW_YEAR: "New year",
  VALENTINE: "Valentine",
  MARTISOR: "Martisor",
  EASTER: "Easter",
  HALLOWEEN: "Halloween",
  NATIONAL_DAY: "National day",
  CHRISTMAS: "Christmas",
};
export type Holiday = { id: HolidayId; strength: number };

/** Decor fades in and out over this many days at either edge of a window. */
const EDGE_DAYS = 0.5;
const SHOULDER = 0.6; // strength outside a holiday's peak days

type Window = { from: number; to: number; peak?: [number, number] }; // day numbers, `to` exclusive

/** Windows of a holiday that can contain a date of `year`, in day numbers; a window may spill into the next year. */
function windows(id: HolidayId, year: number, rite: EasterRite): Window[] {
  const D = (m0: number, d: number, y = year) => dayNum(y, m0, d);
  switch (id) {
    case "NEW_YEAR":
      return [{ from: D(11, 30, year - 1), to: D(0, 3) }, { from: D(11, 30), to: D(0, 3, year + 1) }];
    case "VALENTINE":
      return [{ from: D(1, 13), to: D(1, 16) }];
    case "MARTISOR":
      return [{ from: D(2, 1), to: D(2, 10) }];
    case "EASTER": {
      const e = easterDate(year, rite);
      const n = dayNum(e.getFullYear(), e.getMonth(), e.getDate());
      return [{ from: n - 8, to: n + 2, peak: [n - 1, n + 2] }]; // Saturday before Palm Sunday .. Easter Monday
    }
    case "HALLOWEEN":
      return [{ from: D(9, 24), to: D(10, 2), peak: [D(9, 30), D(10, 2)] }];
    case "NATIONAL_DAY":
      return [{ from: D(10, 30), to: D(11, 2) }];
    case "CHRISTMAS":
      return [
        { from: D(11, 6, year - 1), to: D(0, 7), peak: [D(11, 20, year - 1), D(11, 28, year - 1)] },
        { from: D(11, 6), to: D(0, 7, year + 1), peak: [D(11, 20), D(11, 28)] },
      ];
  }
}

/** 0..1 decor strength of one holiday at day position `pos`: 0 outside its window, eased in and out at the edges, 1 at the peak. */
function strengthOf(id: HolidayId, date: Date, rite: EasterRite): number {
  const pos = position(date);
  let best = 0;
  for (const w of windows(id, date.getFullYear(), rite)) {
    if (pos < w.from || pos >= w.to) continue;
    const edge = smooth01(Math.min(pos - w.from, w.to - pos) / EDGE_DAYS);
    const peak = w.peak ? smooth01(pos - (w.peak[0] - 1)) * smooth01(w.peak[1] + 1 - pos) : 1;
    best = Math.max(best, edge * (w.peak ? SHOULDER + (1 - SHOULDER) * peak : 1));
  }
  return best;
}

/** Strength of `id` on `date`, 0..1 (0 outside its window). */
export const holidayStrength = (id: HolidayId, date: Date, rite: EasterRite = "orthodox") => strengthOf(id, date, rite);

/** The strongest holiday on `date` (several windows can overlap, e.g. Christmas and the new year), or null. */
export function holidayOn(date: Date, rite: EasterRite = "orthodox"): Holiday | null {
  let best: Holiday | null = null;
  for (const id of HOLIDAY_IDS) {
    const strength = strengthOf(id, date, rite);
    if (strength > 0 && (!best || strength > best.strength)) best = { id, strength };
  }
  return best;
}

const FIREWORK_MIN = 20; // minutes either side of midnight
/** 0..1: fireworks around local midnight of 31 December (20 minutes either side, eased at the edges). */
export function fireworksOn(date: Date): number {
  if (date.getMonth() !== 11 && date.getMonth() !== 0) return 0;
  const midnight = dayNum(date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear(), 0, 1);
  const minutes = Math.abs(position(date) - midnight) * 1440;
  return minutes >= FIREWORK_MIN ? 0 : smooth01((FIREWORK_MIN - minutes) / 3);
}

// ---------------------------------------------------------------- palettes

export type SeasonPalette = {
  /** lawn tint (multiplies the grass texture) */
  ground: string;
  /** dark lawn mottling */
  mottle: string;
  grass: [string, string, string];
  canopy: [string, string, string];
  bush: string;
  hedge: string;
  trunk: string;
  flowers: [string, string, string, string];
  leaf: [string, string, string];
  /** share of the canopy that is in leaf: 0 bare winter branches, 1 full */
  leafy: number;
  /** 0..1 how much of the lawn is in flower */
  bloom: number;
  mushrooms: number;
  /** 0..1 snow cover on the ground and on branches */
  snow: number;
};

const PALETTE: Record<Season, SeasonPalette> = {
  spring: {
    ground: "#93c871", mottle: "#2f5a28",
    grass: ["#5fa24a", "#74b955", "#8cc85f"],
    canopy: ["#f4b6cb", "#fbe6ee", "#9bd070"],
    bush: "#6fb04c", hedge: "#52983f", trunk: "#6b4f3a",
    flowers: ["#f4a0c0", "#ffe14a", "#ffffff", "#e8483a"],
    leaf: ["#f4b6cb", "#fbe6ee", "#9bd070"],
    leafy: 0.85, bloom: 1, mushrooms: 0, snow: 0,
  },
  summer: {
    ground: "#78b058", mottle: "#1f3a1c",
    grass: ["#2f6b2c", "#3f8a35", "#4f9a3a"],
    canopy: ["#2f7a2e", "#3c9136", "#256a2a"],
    bush: "#2f7a2e", hedge: "#27682a", trunk: "#5e4432",
    flowers: ["#ffd23a", "#ffffff", "#ff8a3d", "#e04a6a"],
    leaf: ["#3c9136", "#4f9a3a", "#2f7a2e"],
    leafy: 1, bloom: 0.8, mushrooms: 0, snow: 0,
  },
  autumn: {
    ground: "#a79a52", mottle: "#5a4a1c",
    grass: ["#8f8a3c", "#a8913a", "#7a7a34"],
    canopy: ["#d9902b", "#c4521f", "#e6b73a"],
    bush: "#9a7a2c", hedge: "#6f7a30", trunk: "#5a4030",
    flowers: ["#d9902b", "#a6402a", "#e6b73a", "#8a5ab0"],
    leaf: ["#d9902b", "#c4521f", "#e6b73a"],
    leafy: 0.75, bloom: 0.12, mushrooms: 1, snow: 0,
  },
  winter: {
    ground: "#eef4f9", mottle: "#9fb4c6",
    grass: ["#cfd9d2", "#c3cfc8", "#dbe5e0"],
    canopy: ["#5a4a40", "#4a3f38", "#6a5a50"],
    bush: "#46604a", hedge: "#3f5a44", trunk: "#3a2f2a",
    flowers: ["#cfd9d2", "#cfd9d2", "#cfd9d2", "#cfd9d2"],
    leaf: ["#cfd9d2", "#dbe5e0", "#c3cfc8"],
    leafy: 0, bloom: 0, mushrooms: 0, snow: 1,
  },
};

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Linear mix of two #rrggbb colours (in sRGB, which is plenty for a palette cross-fade). */
export function mixHex(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

const mixList = <T extends string[]>(a: T, b: T, t: number) => a.map((c, i) => mixHex(c, b[i], t)) as T;

/** Bare winter without snow: a dull, damp lawn and dark branches (a mild winter, or the weeks before the first snow). */
const WINTER_DRY: SeasonPalette = {
  ground: "#7f8a60", mottle: "#3d4a2c",
  grass: ["#8a8f62", "#7f855a", "#979c6e"],
  canopy: ["#5a4a40", "#4a3f38", "#6a5a50"],
  bush: "#4a5e45", hedge: "#3f5a44", trunk: "#3a2f2a",
  flowers: ["#9a9a7a", "#9a9a7a", "#9a9a7a", "#9a9a7a"],
  leaf: ["#7a6a55", "#6b5d4c", "#86755f"],
  leafy: 0, bloom: 0, mushrooms: 0, snow: 0,
};

function mixPalette(a: SeasonPalette, b: SeasonPalette, mix: number): SeasonPalette {
  const n = (x: number, y: number) => x + (y - x) * mix;
  return {
    ground: mixHex(a.ground, b.ground, mix),
    mottle: mixHex(a.mottle, b.mottle, mix),
    grass: mixList(a.grass, b.grass, mix),
    canopy: mixList(a.canopy, b.canopy, mix),
    bush: mixHex(a.bush, b.bush, mix),
    hedge: mixHex(a.hedge, b.hedge, mix),
    trunk: mixHex(a.trunk, b.trunk, mix),
    flowers: mixList(a.flowers, b.flowers, mix),
    leaf: mixList(a.leaf, b.leaf, mix),
    leafy: n(a.leafy, b.leafy),
    bloom: n(a.bloom, b.bloom),
    mushrooms: n(a.mushrooms, b.mushrooms),
    snow: n(a.snow, b.snow),
  };
}

/**
 * The palette of `season` cross-faded `mix` of the way to the next season. `snow` (0..1, default 1) is how much of winter is snow: the winter
 * palette is white at 1 and a bare, damp lawn at 0, so a mild winter day is not shown under snow.
 */
export function seasonPalette(season: Season, mix: number, snow = 1): SeasonPalette {
  const of = (s: Season) => (s === "winter" && snow < 1 ? mixPalette(WINTER_DRY, PALETTE.winter, snow) : PALETTE[s]);
  return mixPalette(of(season), of(nextSeason(season)), mix);
}

/** Lawn tint for the ground plane (the Ground material multiplies it with the grass texture). */
export const seasonGroundColor = (season: Season, mix = 0) => seasonPalette(season, mix).ground;
/** Colour of the dark lawn mottling overlay. */
export const seasonMottleColor = (season: Season, mix = 0) => seasonPalette(season, mix).mottle;
