// Where the sky is for one instant at one place, as one small matrix: turns a star's J2000 equatorial direction into a direction in the 3D scene (x east, y up, -z the
// plan's "up"), which the star shader applies to thousands of points in one go instead of the processor converting every star on every change. Pure: the node test runner loads this file directly.
import { lstDegrees } from "./nightsky.ts";

/** Row-major 3x3. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const RAD = Math.PI / 180;
const ARCSEC = RAD / 3600;

const mul = (a: Mat3, b: Mat3): Mat3 => {
  const o = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o as unknown as Mat3;
};

/** J2000 -> mean equator and equinox of `date` (Meeus, Astronomical Algorithms, 21.2 and 21.4). A rotation, so it composes with the other two. */
export function precessionMatrix(date: Date): Mat3 {
  const t = (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * ARCSEC;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * ARCSEC;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * ARCSEC;
  const [cz, sz, cx, sx, ct, st] = [Math.cos(z), Math.sin(z), Math.cos(zeta), Math.sin(zeta), Math.cos(theta), Math.sin(theta)];
  return [cx * ct * cz - sx * sz, -sx * ct * cz - cx * sz, -st * cz, cx * ct * sz + sx * cz, -sx * ct * sz + cx * cz, -st * sz, cx * st, -sx * st, ct];
}

/**
 * The matrix that takes a J2000 equatorial unit vector (cos dec cos ra, cos dec sin ra, sin dec) to a scene direction at `date` for an observer at `latDeg`, `lonDeg`.
 * The scene's up direction points at compass `bearingDeg` (the plan's `bearing`), so a star due north of the house is drawn toward the plan's up only when the bearing is 0.
 */
export function equatorialToScene(date: Date, latDeg: number, lonDeg: number, bearingDeg: number): Mat3 {
  const [sl, cl] = [Math.sin(lstDegrees(date, lonDeg) * RAD), Math.cos(lstDegrees(date, lonDeg) * RAD)];
  const [sp, cp] = [Math.sin(latDeg * RAD), Math.cos(latDeg * RAD)];
  const [sb, cb] = [Math.sin(bearingDeg * RAD), Math.cos(bearingDeg * RAD)];
  // the sky turns once a day: rotate by the local sidereal time so x points at the meridian (the hour angle 0 line) and y at the east
  const spin: Mat3 = [cl, sl, 0, -sl, cl, 0, 0, 0, 1];
  // tilt by the latitude into north, east, up
  const horizon: Mat3 = [-sp, 0, cp, 0, 1, 0, cp, 0, sp];
  // north, east, up -> the scene (x east, y up, z south) where the plan's up is compass `bearing`: x = east cos b - north sin b, z = -(north cos b + east sin b)
  const scene: Mat3 = [-sb, cb, 0, 0, 0, 1, -cb, -sb, 0];
  return mul(scene, mul(horizon, mul(spin, precessionMatrix(date))));
}

/** The scene direction of a horizon position (degrees, azimuth clockwise from north) for a plan whose up is at compass `bearingDeg`. */
export function sceneDirection(altDeg: number, azDeg: number, bearingDeg: number): [number, number, number] {
  const a = (azDeg - bearingDeg) * RAD;
  const e = altDeg * RAD;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

/** `m` applied to the unit vector of a right ascension and declination (degrees). */
export function applyToRaDec(m: Mat3, raDeg: number, decDeg: number): [number, number, number] {
  const [x, y, z] = [Math.cos(decDeg * RAD) * Math.cos(raDeg * RAD), Math.cos(decDeg * RAD) * Math.sin(raDeg * RAD), Math.sin(decDeg * RAD)];
  // the scene frame is (x east, y up, z south): the matrix's rows are (x, y, z) of that frame
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}
