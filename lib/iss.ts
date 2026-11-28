// The International Space Station: validate a fix from the wheretheiss.at API, where it is in the sky of a place, and a simple orbit model for passes and a trail.
// Pure: no React, no network. The orbit model is a CIRCULAR orbit at the fix's altitude with the ISS's inclination, the Earth's rotation and the orbit plane's slow drift
// (J2 nodal regression). It is anchored on one fix, so it is honest to a few minutes for the next few hours (the real orbit is slightly elliptical and the ISS is
// re-boosted), and wanders by many minutes after a day: pass lists should be refreshed whenever a new fix arrives. Elevation is geometric (the station above the horizon);
// whether it is also lit by the Sun against a dark sky is the caller's business (see lib/nightsky.ts).
import { gmstDegrees } from "./nightsky.ts";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
/** Mean Earth radius for the sphere used everywhere here (a 0.3% flattening error is far below what a sky chart shows). */
const EARTH_RADIUS_KM = 6371;
/** Earth's gravitational parameter, km^3/s^2. */
const MU = 398600.4418;
const J2 = 1.08263e-3;
/** The ISS orbit's inclination to the equator. */
const INCLINATION_DEG = 51.64;
/** Earth's rotation, degrees per second (sidereal). */
const EARTH_SPIN_DEG_PER_S = 360.98564736629 / 86400;

export type IssFix = {
  /** degrees, -90..90 */
  lat: number;
  /** degrees, -180..180 east positive */
  lon: number;
  altitudeKm: number;
  velocityKmh: number;
  /** Unix seconds */
  timestamp: number;
  /** diameter of the part of the Earth that can see the station, km */
  footprintKm: number;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => isNum(v) && v >= lo && v <= hi;

/** Diameter in km of the circle on the ground from which something at `altitudeKm` is above the horizon. */
const footprintForAltitude = (altitudeKm: number) => 2 * EARTH_RADIUS_KM * Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm));

/**
 * One reply of the wheretheiss.at satellites endpoint as an IssFix, or null when it is not trustworthy: not an object, a missing or non-finite number, a position that is not
 * on the Earth, an altitude or speed no station in low orbit has, a time outside 2001..2100, or units that are not kilometres. `footprint` is optional (worked out from the altitude).
 */
export function parseIssFix(raw: unknown): IssFix | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { latitude, longitude, altitude, velocity, timestamp, footprint, units } = r;
  if (units !== undefined && units !== "kilometers") return null;
  if (!inRange(latitude, -90, 90) || !inRange(longitude, -180, 180)) return null;
  if (!inRange(altitude, 150, 2000) || !inRange(velocity, 10000, 40000)) return null;
  if (!inRange(timestamp, 1e9, 4.1e9)) return null;
  if (footprint !== undefined && !inRange(footprint, 100, 20000)) return null;
  return { lat: latitude, lon: longitude, altitudeKm: altitude, velocityKmh: velocity, timestamp, footprintKm: footprint ?? footprintForAltitude(altitude) };
}

type Vec = [number, number, number];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where something at (lat, lon, radius) is, in Earth-fixed x/y/z km. */
const ecef = (latDeg: number, lonDeg: number, radiusKm: number): Vec => [
  radiusKm * Math.cos(latDeg * RAD) * Math.cos(lonDeg * RAD),
  radiusKm * Math.cos(latDeg * RAD) * Math.sin(lonDeg * RAD),
  radiusKm * Math.sin(latDeg * RAD),
];

/** Where the station is in the sky of a place on the ground (spherical Earth, the station's altitude included). Elevation above the horizon and azimuth clockwise from north, degrees. */
export function issLook(fix: Pick<IssFix, "lat" | "lon" | "altitudeKm">, homeLatDeg: number, homeLonDeg: number): { elevation: number; azimuth: number; rangeKm: number } {
  const home = ecef(homeLatDeg, homeLonDeg, EARTH_RADIUS_KM);
  const sat = ecef(fix.lat, fix.lon, EARTH_RADIUS_KM + fix.altitudeKm);
  const range: Vec = [sat[0] - home[0], sat[1] - home[1], sat[2] - home[2]];
  const rangeKm = Math.hypot(...range);
  const la = homeLatDeg * RAD;
  const lo = homeLonDeg * RAD;
  const up: Vec = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east: Vec = [-Math.sin(lo), Math.cos(lo), 0];
  const north: Vec = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const elevation = Math.asin(Math.max(-1, Math.min(1, dot(range, up) / rangeKm))) * DEG;
  const azimuth = ((Math.atan2(dot(range, east), dot(range, north)) * DEG) % 360 + 360) % 360;
  return { elevation, azimuth, rangeKm };
}

/** Great-circle angle in degrees between two places. */
function angleBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = ecef(lat1, lon1, 1);
  const b = ecef(lat2, lon2, 1);
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * DEG;
}

const orbitSpeedDegPerS = (altitudeKm: number) => (Math.sqrt(MU / (EARTH_RADIUS_KM + altitudeKm) ** 3) * DEG);

/**
 * Cheap test for "is it worth asking the server about the station": true when the station is above the horizon of the home now, or could be within `minutesAhead`
 * (it covers about 3.9 degrees of orbit a minute, plus the ground turning under it). Only a distance test against the footprint: no orbit model.
 */
export function issCouldBeUp(fix: IssFix, homeLatDeg: number, homeLonDeg: number, minutesAhead = 0): boolean {
  const horizonDeg = (fix.footprintKm / 2 / EARTH_RADIUS_KM) * DEG;
  const reachDeg = (orbitSpeedDegPerS(fix.altitudeKm) + EARTH_SPIN_DEG_PER_S) * 60 * Math.max(0, minutesAhead);
  return angleBetween(fix.lat, fix.lon, homeLatDeg, homeLonDeg) <= horizonDeg + reachDeg;
}

type Orbit = { n: number; u0: number; raan0: number; t0: number; raanRate: number; altitudeKm: number };

/** The circular-orbit model for a fix: argument of latitude and node at the fix time, and their rates (radians, per second). */
function orbitOf(fix: IssFix, prevFix: IssFix | null): Orbit {
  const inc = INCLINATION_DEG * RAD;
  const a = EARTH_RADIUS_KM + fix.altitudeKm;
  const n = Math.sqrt(MU / (a * a * a));
  // Moving north (ascending) or south? Needs the previous fix; without one the station is assumed to be heading north (half of all cases, said so in the docs).
  const dt = prevFix ? fix.timestamp - prevFix.timestamp : 0;
  const ascending = prevFix && dt !== 0 ? (fix.lat - prevFix.lat) * dt >= 0 : true;
  const uAsc = Math.asin(Math.max(-1, Math.min(1, Math.sin(fix.lat * RAD) / Math.sin(inc))));
  const u0 = ascending ? uAsc : Math.PI - uAsc;
  const alpha0 = fix.lon * RAD + gmstDegrees(new Date(fix.timestamp * 1000)) * RAD;
  const raan0 = alpha0 - Math.atan2(Math.cos(inc) * Math.sin(u0), Math.cos(u0));
  const raanRate = -1.5 * J2 * (EARTH_RADIUS_KM / a) ** 2 * n * Math.cos(inc);
  return { n, u0, raan0, t0: fix.timestamp, raanRate, altitudeKm: fix.altitudeKm };
}

function positionAt(o: Orbit, atSeconds: number): { lat: number; lon: number; altitudeKm: number } {
  const inc = INCLINATION_DEG * RAD;
  const dt = atSeconds - o.t0;
  const u = o.u0 + o.n * dt;
  const raan = o.raan0 + o.raanRate * dt;
  const lat = Math.asin(Math.sin(inc) * Math.sin(u)) * DEG;
  const alpha = raan + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u));
  const lon = alpha * DEG - gmstDegrees(new Date(atSeconds * 1000));
  return { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180, altitudeKm: o.altitudeKm };
}

/** The sub-point and altitude of the station at any time, from the orbit model anchored on `fix` (earlier or later; `prevFix` tells which way it is going). */
export function issAt(fix: IssFix, prevFix: IssFix | null, at: Date): { lat: number; lon: number; altitudeKm: number } {
  return positionAt(orbitOf(fix, prevFix), at.getTime() / 1000);
}

/** Where the station is in the sky of a place at any time (the orbit model of `issAt` and `issLook`). */
export function issLookAt(fix: IssFix, prevFix: IssFix | null, at: Date, homeLatDeg: number, homeLonDeg: number): { elevation: number; azimuth: number; rangeKm: number } {
  return issLook(issAt(fix, prevFix, at), homeLatDeg, homeLonDeg);
}

export type IssPass = { start: Date; peak: Date; end: Date; maxElevation: number; startAz: number; endAz: number };

const PASS_STEP_S = 20;
const MAX_HOURS = 48;
/** How far back from `from` to look so that a pass already under way is still reported whole. */
const LOOK_BACK_S = 20 * 60;

/**
 * The times the station is above the horizon of the home in the `hours` after `from` (at most 48), from the circular orbit model: start, highest point, end, the
 * height reached and where it appears and disappears (azimuth). Passes already under way at `from` start before it. Accuracy: see the top of this file.
 * Passes that never get above about 10 degrees are mostly hidden by roofs and trees: the caller decides what to show.
 */
export function predictIssPasses(fix: IssFix, prevFix: IssFix | null, homeLatDeg: number, homeLonDeg: number, from: Date, hours: number): IssPass[] {
  const o = orbitOf(fix, prevFix);
  const elevationAt = (s: number) => issLook(positionAt(o, s), homeLatDeg, homeLonDeg).elevation;
  const t0 = from.getTime() / 1000 - LOOK_BACK_S;
  const t1 = from.getTime() / 1000 + Math.min(MAX_HOURS, Math.max(0, hours)) * 3600;
  const passes: IssPass[] = [];
  let start: number | null = null;
  let peak = 0;
  let peakElevation = -90;
  const cross = (a: number, b: number): number => {
    // a is below the horizon and b above, or the other way round: bisect to a second.
    const aUp = elevationAt(a) > 0;
    let lo = a;
    let hi = b;
    while (hi - lo > 1) {
      const mid = (lo + hi) / 2;
      if (elevationAt(mid) > 0 === aUp) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let prev = t0;
  let prevUp = elevationAt(t0) > 0;
  // A pass that is up at the very start of the search has no known start: skip it (the look-back makes this only matter for an impossible 20 minute pass).
  let skipFirst = prevUp;
  for (let s = t0 + PASS_STEP_S; s <= t1 + LOOK_BACK_S; s += PASS_STEP_S) {
    const e = elevationAt(s);
    const up = e > 0;
    if (up && !prevUp) {
      start = cross(prev, s);
      peak = s;
      peakElevation = e;
    } else if (up && e > peakElevation) {
      peak = s;
      peakElevation = e;
    } else if (!up && prevUp) {
      if (skipFirst) skipFirst = false;
      else if (start !== null) {
        const end = cross(prev, s);
        const startAz = issLook(positionAt(o, start), homeLatDeg, homeLonDeg).azimuth;
        const endAz = issLook(positionAt(o, end), homeLatDeg, homeLonDeg).azimuth;
        // The peak sample is within one step of the real top; one more local search narrows it to a second.
        let lo = Math.max(start, peak - PASS_STEP_S);
        let hi = Math.min(end, peak + PASS_STEP_S);
        const phi = (Math.sqrt(5) - 1) / 2;
        for (let k = 0; k < 20; k++) {
          const a = hi - phi * (hi - lo);
          const b = lo + phi * (hi - lo);
          if (elevationAt(a) < elevationAt(b)) lo = a;
          else hi = b;
        }
        const top = (lo + hi) / 2;
        if (start <= t1 && end > from.getTime() / 1000) {
          passes.push({
            start: new Date(start * 1000),
            peak: new Date(top * 1000),
            end: new Date(end * 1000),
            maxElevation: Math.min(90, Math.max(0, elevationAt(top))),
            startAz,
            endAz,
          });
        }
      }
      start = null;
    }
    prev = s;
    prevUp = up;
  }
  return passes;
}

/** Points along the orbit from `fromSecondsAgo` before the fix to `toSecondsAhead` after it, every `stepS` seconds, for drawing a trail. `dt` is the seconds from the fix (negative = past). */
export function trail(fix: IssFix, fromSecondsAgo: number, toSecondsAhead: number, stepS: number, prevFix: IssFix | null = null): { lat: number; lon: number; altitudeKm: number; dt: number }[] {
  const o = orbitOf(fix, prevFix);
  const step = Math.max(1, stepS);
  const out: { lat: number; lon: number; altitudeKm: number; dt: number }[] = [];
  for (let dt = -Math.abs(fromSecondsAgo); dt <= toSecondsAhead + 1e-9; dt += step) out.push({ ...positionAt(o, fix.timestamp + dt), dt });
  return out;
}
