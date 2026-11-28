// "What is up tonight": twilight times, rise/set/transit of the Moon and planets and a one-night summary. Pure. Altitude is sampled every few minutes and each crossing
// of a threshold is then bisected to a second: slow but trivially robust (no polar-day special cases in the maths, no iteration that can fail to converge).
// All results are real instants (Date); the UI shows them in the browser's timezone. There is no timezone in here: a "night" is anchored on local MEAN SOLAR time
// (longitude / 15 hours from UTC), which is within a couple of hours of the clock and never splits a night in two.
import { bodiesAt, limitingMagnitude, raDecToAltAz, type SkyBody } from "./nightsky.ts";
import { moonPhase } from "./moon.ts";
import { sunPositionEq, type PlanetId } from "./planets.ts";

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

/** Altitudes (degrees) at which the Sun counts as up/down: its upper edge on the horizon after refraction, and the three twilight depths. */
const SUN_HORIZON = -0.833;
const CIVIL = -6;
const NAUTICAL = -12;
const ASTRONOMICAL = -18;
/** The Moon's upper edge on the horizon with refraction, for its (topocentric) altitude; planets are points so only refraction counts. */
const MOON_HORIZON = -0.833;
const PLANET_HORIZON = -0.567;
/** A planet counts as "up tonight" from this altitude: below it the air and any roofline hide it. */
const MIN_USEFUL_ALT = 8;

const SUN_STEP = 10 * MIN;
const BODY_STEP = 5 * MIN;

type Crossing = { at: number; rising: boolean };

/** Every time in [from, to] (ms) at which f passes through `level`, bisected to about a second. */
function crossings(f: (t: number) => number, from: number, to: number, step: number, level: number): Crossing[] {
  const out: Crossing[] = [];
  let t0 = from;
  let v0 = f(t0) - level;
  while (t0 < to) {
    const t1 = Math.min(to, t0 + step);
    const v1 = f(t1) - level;
    if ((v0 <= 0) !== (v1 <= 0)) {
      let lo = t0;
      let hi = t1;
      for (let k = 0; k < 20 && hi - lo > 1000; k++) {
        const mid = (lo + hi) / 2;
        if (f(mid) - level <= 0 === v0 <= 0) lo = mid;
        else hi = mid;
      }
      out.push({ at: (lo + hi) / 2, rising: v1 > 0 });
    }
    t0 = t1;
    v0 = v1;
  }
  return out;
}

/** The local solar noon that starts the "night" for `date`: the last one before 6 hours from now, so from 06:00 solar time on it means the coming night. */
export function nightAnchor(date: Date, lonDeg: number): Date {
  const noonOffset = (12 - lonDeg / 15) * HOUR;
  return new Date(Math.floor((date.getTime() + 6 * HOUR - noonOffset) / DAY) * DAY + noonOffset);
}

const sunAlt = (lat: number, lon: number) => (t: number) => {
  const d = new Date(t);
  const s = sunPositionEq(d);
  return raDecToAltAz(s.ra, s.dec, d, lat, lon).alt;
};

export type SunTimes = {
  sunrise: Date | null;
  sunset: Date | null;
  civilDawn: Date | null;
  civilDusk: Date | null;
  nauticalDawn: Date | null;
  nauticalDusk: Date | null;
  astroDawn: Date | null;
  astroDusk: Date | null;
  /** 'day' when the Sun does not set in the whole 36 hours, 'night' when it does not rise, otherwise null */
  polar: "day" | "night" | null;
};

/**
 * The evening and morning events of the night for `date`, found in the 36 hours from the anchor noon (see nightAnchor): the dusk is the first time the Sun goes
 * below a level and the dawn the first time it comes back up after that. A level the Sun never reaches that night (midsummer at 55 N has no astronomical dusk) is null.
 */
export function sunTimes(date: Date, latDeg: number, lonDeg: number): SunTimes {
  const from = nightAnchor(date, lonDeg).getTime();
  const to = from + 36 * HOUR;
  const f = sunAlt(latDeg, lonDeg);
  const pair = (level: number): [Date | null, Date | null] => {
    const all = crossings(f, from, to, SUN_STEP, level);
    const down = all.find((c) => !c.rising);
    const up = down ? all.find((c) => c.rising && c.at > down.at) : undefined;
    return [down ? new Date(down.at) : null, up ? new Date(up.at) : null];
  };
  const [sunset, sunrise] = pair(SUN_HORIZON);
  const [civilDusk, civilDawn] = pair(CIVIL);
  const [nauticalDusk, nauticalDawn] = pair(NAUTICAL);
  const [astroDusk, astroDawn] = pair(ASTRONOMICAL);
  let polar: SunTimes["polar"] = null;
  if (!sunset) polar = f(from) > SUN_HORIZON ? "day" : "night";
  return { sunrise, sunset, civilDawn, civilDusk, nauticalDawn, nauticalDusk, astroDawn, astroDusk, polar };
}

const bodyOf = (id: SkyBody["id"], t: number, lat: number, lon: number): SkyBody => {
  const body = bodiesAt(new Date(t), lat, lon).find((b) => b.id === id);
  if (!body) throw new Error(`no such body: ${id}`);
  return body;
};

/**
 * Rise, set and highest point of the Moon, Sun or a planet in the 24 hours from `date` (first of each; null when it does not happen in that time).
 * `maxAlt` is the highest altitude in the window; `transit` is when it is reached, or null when the highest point is the edge of the window (the body is only climbing or only sinking).
 */
export function bodyEvents(id: SkyBody["id"], date: Date, latDeg: number, lonDeg: number): { rise: Date | null; set: Date | null; transit: Date | null; maxAlt: number } {
  const alt = (t: number) => bodyOf(id, t, latDeg, lonDeg).alt;
  const from = date.getTime();
  const to = from + DAY;
  const horizon = id === "sun" ? SUN_HORIZON : id === "moon" ? MOON_HORIZON : PLANET_HORIZON;
  const all = crossings(alt, from, to, BODY_STEP, horizon);
  const rise = all.find((c) => c.rising);
  const set = all.find((c) => !c.rising);
  // Highest sample, then a golden-section search for the top between its neighbours.
  const n = Math.round((to - from) / BODY_STEP);
  let best = 0;
  let bestAlt = -Infinity;
  for (let i = 0; i <= n; i++) {
    const a = alt(from + i * BODY_STEP);
    if (a > bestAlt) {
      bestAlt = a;
      best = i;
    }
  }
  if (best === 0 || best === n) return { rise: rise ? new Date(rise.at) : null, set: set ? new Date(set.at) : null, transit: null, maxAlt: bestAlt };
  let lo = from + (best - 1) * BODY_STEP;
  let hi = from + (best + 1) * BODY_STEP;
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 30; k++) {
    const a = hi - phi * (hi - lo);
    const b = lo + phi * (hi - lo);
    if (alt(a) < alt(b)) lo = a;
    else hi = b;
  }
  const top = (lo + hi) / 2;
  return { rise: rise ? new Date(rise.at) : null, set: set ? new Date(set.at) : null, transit: new Date(top), maxAlt: Math.max(bestAlt, alt(top)) };
}

export type TonightPlanet = { id: PlanetId; name: string; mag: number; from: Date | null; to: Date | null; bestAlt: number; bestAz: number; visible: boolean };

const PLANET_IDS: readonly PlanetId[] = ["mercury", "venus", "mars", "jupiter", "saturn"];

/**
 * The night in one go. `dusk`/`dawn` are the end/start of civil twilight (the Sun 6 degrees down): where there is none (polar day or night) dusk and dawn fall back to
 * sunset/sunrise, and with no sunset at all they are the solar midnight (a zero-length night) or the whole 24 hours.
 * Each planet's `from`/`to` are the first and last 5-minute step in that window at which it is above 8 degrees and brighter than the naked-eye limit with the Sun and the
 * Moon as they are then (no clouds); `bestAlt`/`bestAz` are where it is at its highest in the window (even if that is too faint to see), `mag` is its brightness at that moment.
 */
export function tonight(
  date: Date,
  latDeg: number,
  lonDeg: number,
): {
  dusk: Date;
  dawn: Date;
  planets: TonightPlanet[];
  moon: { phase: number; illumination: number; name: string; rise: Date | null; set: Date | null };
} {
  const anchor = nightAnchor(date, lonDeg);
  const sun = sunTimes(date, latDeg, lonDeg);
  const midnight = new Date(anchor.getTime() + 12 * HOUR);
  const dusk = sun.civilDusk ?? sun.sunset ?? (sun.polar === "night" ? anchor : midnight);
  const dawn = sun.civilDawn ?? sun.sunrise ?? (sun.polar === "night" ? new Date(anchor.getTime() + 24 * HOUR) : midnight);
  const moon = moonPhase(dusk);
  const moonEv = bodyEvents("moon", anchor, latDeg, lonDeg);
  const best = new Map<PlanetId, { alt: number; az: number; mag: number }>();
  const span = new Map<PlanetId, { from: number; to: number }>();
  for (let t = dusk.getTime(); t <= Math.max(dawn.getTime(), dusk.getTime()); t += BODY_STEP) {
    const bodies = bodiesAt(new Date(t), latDeg, lonDeg);
    const sunAltNow = bodies.find((b) => b.id === "sun")?.alt ?? 0;
    const moonAltNow = bodies.find((b) => b.id === "moon")?.alt ?? -90;
    const limit = limitingMagnitude(sunAltNow, moonAltNow, moon.illumination, 0);
    for (const b of bodies) {
      if (b.id === "sun" || b.id === "moon") continue;
      const top = best.get(b.id);
      if (!top || b.alt > top.alt) best.set(b.id, { alt: b.alt, az: b.az, mag: b.mag });
      if (b.alt >= MIN_USEFUL_ALT && b.mag <= limit) {
        const s = span.get(b.id);
        span.set(b.id, { from: s?.from ?? t, to: t });
      }
    }
  }
  const planets = PLANET_IDS.map((id): TonightPlanet => {
    const top = best.get(id) ?? { alt: -90, az: 0, mag: 99 };
    const s = span.get(id);
    return { id, name: id[0].toUpperCase() + id.slice(1), mag: top.mag, from: s ? new Date(s.from) : null, to: s ? new Date(s.to) : null, bestAlt: top.alt, bestAz: top.az, visible: !!s };
  });
  return { dusk, dawn, planets, moon: { phase: moon.phase, illumination: moon.illumination, name: moon.name, rise: moonEv.rise, set: moonEv.set } };
}
