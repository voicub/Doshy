// Time, sidereal time and sky coordinates for the night-sky view, plus "how faint can you see tonight". Pure: no React, no browser globals. Angles in DEGREES;
// azimuth is clockwise from north (0 = north, 90 = east). Positions of the Sun, Moon and planets come from lib/planets.ts (Schlyter).
import { moonMagnitude, moonPosition, planetPositions, sunPositionEq } from "./planets.ts";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6378.14;
const norm360 = (a: number) => ((a % 360) + 360) % 360;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Julian day (days since noon, 1 Jan 4713 BC, UT) of an instant. Unix time is UTC and leap seconds are ignored, which is far below what the sky needs. */
export const julianDay = (date: Date): number => date.getTime() / 86400000 + 2440587.5;

/** Greenwich mean sidereal time in degrees 0..360 (IAU 1982 polynomial, the one the Astronomical Almanac prints). 18.697374558 h at J2000.0. */
export function gmstDegrees(date: Date): number {
  const d = julianDay(date) - 2451545.0;
  const t = d / 36525;
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000);
}

/** Local sidereal time in degrees: the right ascension that is on the meridian. East longitudes are positive. */
export const lstDegrees = (date: Date, lonDeg: number): number => norm360(gmstDegrees(date) + lonDeg);

/**
 * J2000 -> equinox of `date` with the IAU 1976 precession angles (rigorous rotation, good to a fraction of an arc minute for centuries).
 * Returns a function that keeps the date's trigonometry, so a whole catalogue costs only the per-star part: use this per frame instead of `precess` per star.
 */
export function precessor(date: Date): (raDeg: number, decDeg: number) => { ra: number; dec: number } {
  const t = (julianDay(date) - 2451545.0) / 36525;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) / 3600;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) / 3600;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) / 3600;
  const cosT = Math.cos(theta * RAD);
  const sinT = Math.sin(theta * RAD);
  return (raDeg, decDeg) => {
    const dec = decDeg * RAD;
    const a = (raDeg + zeta) * RAD;
    const A = Math.cos(dec) * Math.sin(a);
    const B = cosT * Math.cos(dec) * Math.cos(a) - sinT * Math.sin(dec);
    const C = sinT * Math.cos(dec) * Math.cos(a) + cosT * Math.sin(dec);
    return { ra: norm360(Math.atan2(A, B) * DEG + z), dec: Math.asin(clamp(C, -1, 1)) * DEG };
  };
}

/** One J2000 position moved to the equinox of `date` (roughly 0.35 degrees after 25 years, depending on direction). */
export const precess = (raDeg: number, decDeg: number, date: Date): { ra: number; dec: number } => precessor(date)(raDeg, decDeg);

/**
 * Altitude (above the horizon, geometric: no refraction) and azimuth of a point for an observer. The RA/Dec MUST be "of date": the Sun, Moon and planets from
 * lib/planets.ts already are, catalogue stars (J2000) go through `precess`/`precessor` first. Precession is NOT applied in here on purpose: it would cost a
 * dozen trig calls per star per frame for nothing when the caller can do it once.
 */
export function raDecToAltAz(raDeg: number, decDeg: number, date: Date, latDeg: number, lonDeg: number): { alt: number; az: number } {
  const h = (lstDegrees(date, lonDeg) - raDeg) * RAD;
  const dec = decDeg * RAD;
  const lat = latDeg * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const north = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(h) * Math.sin(lat);
  const east = -Math.cos(dec) * Math.sin(h);
  return { alt: Math.asin(clamp(sinAlt, -1, 1)) * DEG, az: norm360(Math.atan2(east, north) * DEG) };
}

/** Relative air mass by Kasten & Young (1989): 1 at the zenith, about 38 at the horizon, finite below it (clamped there). */
const airMass = (altDeg: number): number => {
  const h = Math.max(0, altDeg);
  return 1 / (Math.sin(h * RAD) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
};

/** How much fainter a star looks because of the air it shines through: about 0.2 magnitudes per air mass (a typical clear-sky V band value). */
export const extinctionMag = (altDeg: number): number => 0.2 * airMass(altDeg);

/** Naked-eye limit by how far the Sun is below the horizon: only Venus-bright things in daylight, the first stars in civil twilight, the full sky past astronomical twilight. */
const TWILIGHT_LIMIT: readonly (readonly [number, number])[] = [
  [0, -1.5],
  [-3, 0],
  [-6, 1.5],
  [-9, 3],
  [-12, 4.2],
  [-15, 5.3],
  [-18, 6],
];
const DARK_LIMIT = 6;
/** What "nothing is visible" means: fainter than the brightest planet can be. */
const NOTHING_VISIBLE = -6;

function twilightLimit(sunAlt: number): number {
  if (sunAlt >= TWILIGHT_LIMIT[0][0]) return TWILIGHT_LIMIT[0][1];
  for (let i = 1; i < TWILIGHT_LIMIT.length; i++) {
    const [a0, l0] = TWILIGHT_LIMIT[i - 1];
    const [a1, l1] = TWILIGHT_LIMIT[i];
    if (sunAlt >= a1) return l0 + ((l1 - l0) * (sunAlt - a0)) / (a1 - a0);
  }
  return DARK_LIMIT;
}

/**
 * The faintest magnitude a person sees with the naked eye: 6 in a dark sky, brighter limits through twilight (about -1.5 with the Sun up, 1.5 at the end of civil
 * twilight, 6 at the end of astronomical twilight), up to 2.5 magnitudes lost to a bright Moon that is well above the horizon, and the whole sky gone as cloud goes to 1.
 */
export function limitingMagnitude(sunAltDeg: number, moonAltDeg: number, moonIllumination: number, cloud01: number): number {
  const sky = twilightLimit(sunAltDeg);
  // Moonlight only matters once the sky is dark enough for it to be the brightest thing in it.
  const darkness = clamp((sky - TWILIGHT_LIMIT[0][1]) / (DARK_LIMIT - TWILIGHT_LIMIT[0][1]), 0, 1);
  const glare = 2.5 * clamp(moonIllumination, 0, 1) * smoothstep((moonAltDeg + 2) / 17) * darkness;
  const cloud = clamp(cloud01, 0, 1);
  return (sky - glare) * (1 - cloud) + NOTHING_VISIBLE * cloud;
}

/** 0..1 how clearly a thing of magnitude `mag` shows when the limit is `limit`: 1 about a magnitude brighter than the limit, 0 just past it, smooth between. */
export const magnitudeFade = (mag: number, limit: number): number => smoothstep((limit - mag + 0.3) / 1.5);

export type SkyBody = { id: "mercury" | "venus" | "mars" | "jupiter" | "saturn" | "moon" | "sun"; name: string; alt: number; az: number; mag: number };

/** The Sun's apparent magnitude. */
const SUN_MAG = -26.74;

/**
 * Sun, Moon and the five planets as seen from a place. The Moon's altitude is topocentric (parallax applied: alt - asin(1/r) * cos(alt), up to about a degree,
 * Schlyter section 13) because it is near enough for the observer's place on the Earth to show; the Sun and planets are geocentric (their parallax is under
 * 33 arc seconds, below what is drawn). No refraction.
 */
export function bodiesAt(date: Date, latDeg: number, lonDeg: number): SkyBody[] {
  const out: SkyBody[] = [];
  const sun = sunPositionEq(date);
  out.push({ id: "sun", name: "Sun", ...raDecToAltAz(sun.ra, sun.dec, date, latDeg, lonDeg), mag: SUN_MAG });
  const moon = moonPosition(date);
  const m = raDecToAltAz(moon.ra, moon.dec, date, latDeg, lonDeg);
  const parallax = Math.asin(EARTH_RADIUS_KM / moon.distanceKm) * DEG;
  out.push({ id: "moon", name: "Moon", alt: m.alt - parallax * Math.cos(m.alt * RAD), az: m.az, mag: moonMagnitude(date) });
  for (const p of planetPositions(date)) out.push({ id: p.id, name: p.name, ...raDecToAltAz(p.ra, p.dec, date, latDeg, lonDeg), mag: p.mag });
  return out;
}
