// Sun, Moon and the five naked-eye planets with Paul Schlyter's low-precision method (https://stjarnhimlen.se/comp/ppcomp.html): orbital elements as straight lines
// in the day number, Kepler's equation, the few big perturbations of the Moon, Jupiter and Saturn, then heliocentric -> geocentric -> RA/Dec.
// Accuracy (his words, checked in lib/planets.test.ts against his worked example): a fraction of an arc minute for the Sun and inner planets, about one for the outer
// ones, 1-2 for the Moon, growing with the square of the distance in time from 2000 (about 2 arc minutes per 1000 years for the planets). Light travel time, nutation and
// aberration are ignored. Everything is "of date" (the equinox of the moment), as raDecToAltAz in lib/nightsky.ts wants it. Angles in DEGREES. Pure, imports nothing.

export type PlanetId = "mercury" | "venus" | "mars" | "jupiter" | "saturn";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6378.14;
/** Schlyter's day 0 is 1999-12-31 00:00 UT = JD 2451543.5 (Unix day 10956). */
const UNIX_DAYS_AT_DAY0 = 10956;

const norm360 = (a: number) => ((a % 360) + 360) % 360;
const sin = (deg: number) => Math.sin(deg * RAD);
const cos = (deg: number) => Math.cos(deg * RAD);

/** Schlyter's day number `d`, with the time of day as a fraction. */
export const schlyterDay = (date: Date): number => date.getTime() / 86400000 - UNIX_DAYS_AT_DAY0;

type Elements = { N: number; i: number; w: number; a: number; e: number; M: number };

/** The six orbital elements for a planet at day `d` (degrees, AU), straight from the page. */
function elements(id: PlanetId, d: number): Elements {
  switch (id) {
    case "mercury":
      return { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.0e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d };
    case "venus":
      return { N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d };
    case "mars":
      return { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d };
    case "jupiter":
      return { N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d };
    case "saturn":
      return { N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d };
  }
}

/** Kepler's equation M = E - e sin E by Newton's method (his first guess, then iterate: needed for Mercury's e of 0.2). Radians in and out. */
function eccentricAnomaly(mRad: number, e: number): number {
  let big = mRad + e * Math.sin(mRad) * (1 + e * Math.cos(mRad));
  for (let k = 0; k < 12; k++) {
    const step = (big - e * Math.sin(big) - mRad) / (1 - e * Math.cos(big));
    big -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  return big;
}

/** True anomaly (degrees) and distance from the focus for an orbit with semi-major axis `a`, eccentricity `e`, mean anomaly `mDeg`. */
function trueAnomaly(a: number, e: number, mDeg: number): { v: number; r: number } {
  const big = eccentricAnomaly(norm360(mDeg) * RAD, e);
  const xv = a * (Math.cos(big) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(big);
  return { v: Math.atan2(yv, xv) * DEG, r: Math.hypot(xv, yv) };
}

/** Obliquity of the ecliptic, degrees. */
const obliquity = (d: number) => 23.4393 - 3.563e-7 * d;

type Spherical = { lon: number; lat: number; r: number };

/** The Sun's ecliptic longitude (true, of date) and distance in AU, plus its mean longitude (for sidereal time elsewhere, not needed here). */
function sunEcliptic(d: number): { lon: number; r: number } {
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = 356.047 + 0.9856002585 * d;
  const { v, r } = trueAnomaly(1, e, M);
  return { lon: norm360(v + w), r };
}

/** Ecliptic rectangular -> RA/Dec in degrees (RA 0..360). */
function eclipticToEquatorial(x: number, y: number, z: number, d: number): { ra: number; dec: number } {
  const ecl = obliquity(d);
  const ye = y * cos(ecl) - z * sin(ecl);
  const ze = y * sin(ecl) + z * cos(ecl);
  return { ra: norm360(Math.atan2(ye, x) * DEG), dec: Math.atan2(ze, Math.hypot(x, ye)) * DEG };
}

const toRect = (s: Spherical): [number, number, number] => [s.r * cos(s.lon) * cos(s.lat), s.r * sin(s.lon) * cos(s.lat), s.r * sin(s.lat)];

/** Equatorial position of the Sun for the date (degrees, of date) and its distance in AU. */
export function sunPositionEq(date: Date): { ra: number; dec: number; distanceAu: number } {
  const d = schlyterDay(date);
  const { lon, r } = sunEcliptic(d);
  const [x, y, z] = toRect({ lon, lat: 0, r });
  return { ...eclipticToEquatorial(x, y, z, d), distanceAu: r };
}

/** Heliocentric ecliptic position of a planet with the big Jupiter/Saturn perturbations added (section 10 of the page). */
function heliocentric(id: PlanetId, d: number): Spherical {
  const el = elements(id, d);
  const { v, r } = trueAnomaly(el.a, el.e, el.M);
  const vw = v + el.w;
  const x = r * (cos(el.N) * cos(vw) - sin(el.N) * sin(vw) * cos(el.i));
  const y = r * (sin(el.N) * cos(vw) + cos(el.N) * sin(vw) * cos(el.i));
  const z = r * (sin(vw) * sin(el.i));
  let lon = Math.atan2(y, x) * DEG;
  let lat = Math.atan2(z, Math.hypot(x, y)) * DEG;
  if (id === "jupiter" || id === "saturn") {
    const Mj = elements("jupiter", d).M;
    const Ms = elements("saturn", d).M;
    if (id === "jupiter") {
      lon +=
        -0.332 * sin(2 * Mj - 5 * Ms - 67.6) -
        0.056 * sin(2 * Mj - 2 * Ms + 21) +
        0.042 * sin(3 * Mj - 5 * Ms + 21) -
        0.036 * sin(Mj - 2 * Ms) +
        0.022 * cos(Mj - Ms) +
        0.023 * sin(2 * Mj - 3 * Ms + 52) -
        0.016 * sin(Mj - 5 * Ms - 69);
    } else {
      lon += 0.812 * sin(2 * Mj - 5 * Ms - 67.6) - 0.229 * cos(2 * Mj - 4 * Ms - 2) + 0.119 * sin(Mj - 2 * Ms - 3) + 0.046 * sin(2 * Mj - 6 * Ms - 69) + 0.014 * sin(Mj - 3 * Ms + 32);
      lat += -0.02 * cos(2 * Mj - 4 * Ms - 2) + 0.018 * sin(2 * Mj - 6 * Ms - 49);
    }
  }
  return { lon, lat, r };
}

/** Apparent magnitude from the page's formulas: `fv` is the phase angle in degrees, `r` the distance from the Sun and `big` from the Earth in AU. */
function planetMagnitude(id: PlanetId, r: number, big: number, fv: number, ringTiltDeg: number): number {
  const dist = 5 * Math.log10(r * big);
  switch (id) {
    case "mercury":
      return -0.36 + dist + 0.027 * fv + 2.2e-13 * fv ** 6;
    case "venus":
      return -4.34 + dist + 0.013 * fv + 4.2e-7 * fv ** 3;
    case "mars":
      return -1.51 + dist + 0.016 * fv;
    case "jupiter":
      return -9.25 + dist + 0.014 * fv;
    case "saturn": {
      const ring = -2.6 * Math.abs(sin(ringTiltDeg)) + 1.2 * sin(ringTiltDeg) ** 2;
      return -9.0 + dist + 0.044 * fv + ring;
    }
  }
}

const PLANETS: readonly { id: PlanetId; name: string }[] = [
  { id: "mercury", name: "Mercury" },
  { id: "venus", name: "Venus" },
  { id: "mars", name: "Mars" },
  { id: "jupiter", name: "Jupiter" },
  { id: "saturn", name: "Saturn" },
];

/** Where the five planets are (RA/Dec of date, degrees), how bright (apparent magnitude) and how far (AU), for an instant. */
export function planetPositions(date: Date): { id: PlanetId; name: string; ra: number; dec: number; mag: number; distanceAu: number }[] {
  const d = schlyterDay(date);
  const sun = sunEcliptic(d);
  const [xs, ys] = toRect({ lon: sun.lon, lat: 0, r: sun.r });
  return PLANETS.map(({ id, name }) => {
    const helio = heliocentric(id, d);
    const [xh, yh, zh] = toRect(helio);
    const xg = xh + xs;
    const yg = yh + ys;
    const big = Math.hypot(xg, yg, zh);
    const fv = Math.acos(Math.min(1, Math.max(-1, (helio.r * helio.r + big * big - sun.r * sun.r) / (2 * helio.r * big)))) * DEG;
    // Saturn's ring tilt (section 15): ring plane inclination 28.06 deg, node 169.51 deg + 3.82e-5 d.
    const los = Math.atan2(yg, xg) * DEG;
    const las = Math.atan2(zh, Math.hypot(xg, yg)) * DEG;
    const tilt = Math.asin(sin(las) * cos(28.06) - cos(las) * sin(28.06) * sin(los - (169.51 + 3.82e-5 * d))) * DEG;
    const eq = eclipticToEquatorial(xg, yg, zh, d);
    return { id, name, ra: eq.ra, dec: eq.dec, mag: planetMagnitude(id, helio.r, big, fv, tilt), distanceAu: big };
  });
}

/** The Moon's geocentric ecliptic position with the perturbation terms of section 9 (all of them: about 2 arc minutes). Distance in Earth radii. */
function moonEcliptic(d: number): Spherical {
  const N = 125.1228 - 0.0529538083 * d;
  const w = 318.0634 + 0.1643573223 * d;
  const Mm = 115.3654 + 13.0649929509 * d;
  const { v, r } = trueAnomaly(60.2666, 0.0549, Mm);
  const vw = v + w;
  const i = 5.1454;
  const x = r * (cos(N) * cos(vw) - sin(N) * sin(vw) * cos(i));
  const y = r * (sin(N) * cos(vw) + cos(N) * sin(vw) * cos(i));
  const z = r * (sin(vw) * sin(i));
  const Ms = 356.047 + 0.9856002585 * d;
  const ws = 282.9404 + 4.70935e-5 * d;
  const Ls = Ms + ws;
  const Lm = Mm + w + N;
  const D = Lm - Ls;
  const F = Lm - N;
  const dLon =
    -1.274 * sin(Mm - 2 * D) +
    0.658 * sin(2 * D) -
    0.186 * sin(Ms) -
    0.059 * sin(2 * Mm - 2 * D) -
    0.057 * sin(Mm - 2 * D + Ms) +
    0.053 * sin(Mm + 2 * D) +
    0.046 * sin(2 * D - Ms) +
    0.041 * sin(Mm - Ms) -
    0.035 * sin(D) -
    0.031 * sin(Mm + Ms) -
    0.015 * sin(2 * F - 2 * D) +
    0.011 * sin(Mm - 4 * D);
  const dLat = -0.173 * sin(F - 2 * D) - 0.055 * sin(Mm - F - 2 * D) - 0.046 * sin(Mm + F - 2 * D) + 0.033 * sin(F + 2 * D) + 0.017 * sin(2 * Mm + F);
  const dDist = -0.58 * cos(Mm - 2 * D) - 0.46 * cos(2 * D);
  return { lon: Math.atan2(y, x) * DEG + dLon, lat: Math.atan2(z, Math.hypot(x, y)) * DEG + dLat, r: Math.hypot(x, y, z) + dDist };
}

/** The Moon as seen from the centre of the Earth (RA/Dec of date, degrees; distance in km). The parallax for a real observer is applied in lib/nightsky.ts. */
export function moonPosition(date: Date): { ra: number; dec: number; distanceKm: number } {
  const d = schlyterDay(date);
  const m = moonEcliptic(d);
  const [x, y, z] = toRect({ lon: m.lon, lat: m.lat, r: 1 });
  return { ...eclipticToEquatorial(x, y, z, d), distanceKm: m.r * EARTH_RADIUS_KM };
}

/** The Moon's apparent magnitude from his formula: about -12.7 at full moon, fainter as the lit part shrinks. */
export function moonMagnitude(date: Date): number {
  const d = schlyterDay(date);
  const m = moonEcliptic(d);
  const sun = sunEcliptic(d);
  const elong = Math.acos(Math.min(1, Math.max(-1, cos(sun.lon - m.lon) * cos(m.lat)))) * DEG;
  const fv = 180 - elong;
  return -21.62 + 5 * Math.log10(sun.r * m.r) + 0.026 * fv + 4.0e-9 * fv ** 4;
}
