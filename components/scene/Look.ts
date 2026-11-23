import { Color } from "three";
import { lerp } from "@/lib/mathUtil";

/** One lighting stop of the daylight cycle. The scene blends night -> dusk -> day continuously from `sky.daylight`. */
type Stop = {
  hemi: [sky: string, ground: string, intensity: number];
  sun: [color: string, intensity: number]; // the moon at night
  fill: [color: string, intensity: number]; // opposite-side kicker
  env: number; // image-based light strength
  bloom: number;
  grade: { shadowLift: [number, number, number]; highlightTint: [number, number, number]; contrast: number; saturation: number };
  shaft: number; // base light-shaft strength from the sun (lit lamps add to it)
  dust: number; // dust-mote visibility in lit rooms
};

/**
 * day: clean daylight. dusk: golden-hour interior, dark teal ambient, low amber sun.
 * night: moody, only practical lights read.
 */
const STOPS: [night: Stop, dusk: Stop, day: Stop] = [
  {
    hemi: ["#33466a", "#10131b", 0.4],
    sun: ["#8ea3d8", 0.6],
    fill: ["#3a5c9a", 0.15],
    env: 0.2,
    bloom: 0.95,
    grade: { shadowLift: [0, 0.012, 0.028], highlightTint: [1.08, 1, 0.86], contrast: 0.3, saturation: 1 },
    shaft: 0,
    dust: 0.9,
  },
  {
    hemi: ["#5f8fb0", "#23303a", 1.1],
    sun: ["#ffc79a", 1.9],
    fill: ["#4a86a8", 0.5],
    env: 0.45,
    bloom: 0.7,
    grade: { shadowLift: [0, 0.014, 0.026], highlightTint: [1.04, 1, 0.92], contrast: 0.28, saturation: 0.95 },
    shaft: 0.85,
    dust: 1,
  },
  {
    hemi: ["#e4ecff", "#9a8b78", 0.8],
    sun: ["#fff2e0", 3.0],
    fill: ["#bcd0ff", 0.25],
    env: 0.5,
    bloom: 0.3,
    grade: { shadowLift: [0, 0.006, 0.01], highlightTint: [1.03, 1, 0.95], contrast: 0.18, saturation: 1 },
    shaft: 0.35,
    dust: 0.3,
  },
];

/** The look at one instant: preallocated, rewritten in place every frame (no allocations). */
type Look = {
  hemiSky: Color;
  hemiGround: Color;
  hemiI: number;
  sunC: Color;
  sunI: number;
  fillC: Color;
  fillI: number;
  env: number;
  bloom: number;
  shadowLift: [number, number, number];
  highlightTint: [number, number, number];
  contrast: number;
  saturation: number;
  shaft: number;
  dust: number;
};

export const makeLook = (): Look => ({
  hemiSky: new Color(),
  hemiGround: new Color(),
  hemiI: 0,
  sunC: new Color(),
  sunI: 0,
  fillC: new Color(),
  fillI: 0,
  env: 0,
  bloom: 0,
  shadowLift: [0, 0, 0],
  highlightTint: [1, 1, 1],
  contrast: 0,
  saturation: 1,
  shaft: 0,
  dust: 0,
});

const COLORS = STOPS.map((s) => ({ sky: new Color(s.hemi[0]), ground: new Color(s.hemi[1]), sun: new Color(s.sun[0]), fill: new Color(s.fill[0]) }));
const lerp3 = (o: [number, number, number], a: [number, number, number], b: [number, number, number], t: number) => {
  o[0] = lerp(a[0], b[0], t);
  o[1] = lerp(a[1], b[1], t);
  o[2] = lerp(a[2], b[2], t);
};

/** Blend the three stops by daylight (0 night, 0.5 dusk, 1 day) into `out`. */
export function blendLook(daylight: number, out: Look): Look {
  const hi = daylight >= 0.5;
  const t = hi ? (daylight - 0.5) * 2 : daylight * 2;
  const i = hi ? 1 : 0;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const ca = COLORS[i];
  const cb = COLORS[i + 1];
  out.hemiSky.copy(ca.sky).lerp(cb.sky, t);
  out.hemiGround.copy(ca.ground).lerp(cb.ground, t);
  out.sunC.copy(ca.sun).lerp(cb.sun, t);
  out.fillC.copy(ca.fill).lerp(cb.fill, t);
  out.hemiI = lerp(a.hemi[2], b.hemi[2], t);
  out.sunI = lerp(a.sun[1], b.sun[1], t);
  out.fillI = lerp(a.fill[1], b.fill[1], t);
  out.env = lerp(a.env, b.env, t);
  out.bloom = lerp(a.bloom, b.bloom, t);
  lerp3(out.shadowLift, a.grade.shadowLift, b.grade.shadowLift, t);
  lerp3(out.highlightTint, a.grade.highlightTint, b.grade.highlightTint, t);
  out.contrast = lerp(a.grade.contrast, b.grade.contrast, t);
  out.saturation = lerp(a.grade.saturation, b.grade.saturation, t);
  out.shaft = lerp(a.shaft, b.shaft, t);
  out.dust = lerp(a.dust, b.dust, t);
  return out;
}
