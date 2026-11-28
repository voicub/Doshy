"use client";
import { clock } from "@/lib/daylight";

const W = 240;
const H = 84;
const HORIZON = 62; // y of the horizon line: the sky above it, a little room below for the night part of the curve
const TOP = 8;
const FLOOR_EL = -16; // the curve is drawn down to here and no further

/** The day's path: height of the sun across the 24 hours (`curve` = degrees every half hour from 00:00 to 24:00, 49 values) with a dot where the sun is now. */
export default function DaylightSunPath({ curve, hour, elevation, label }: { curve: readonly number[]; hour: number; elevation: number; label: string }) {
  const peak = Math.max(60, ...curve);
  const x = (h: number) => 4 + (h / 24) * (W - 8);
  const y = (e: number) => HORIZON - (Math.max(FLOOR_EL, e) / peak) * (HORIZON - TOP);
  const d = curve.map((e, i) => `${i ? "L" : "M"}${x(i / 2).toFixed(1)} ${y(e).toFixed(1)}`).join("");
  return (
    <svg className="dl-path" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <rect x="0" y={HORIZON} width={W} height={H - HORIZON} className="dl-ground" />
      <line x1="0" x2={W} y1={HORIZON} y2={HORIZON} className="dl-horizon" />
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={Math.min(W - 10, Math.max(10, x(h)))} y={H - 3} textAnchor="middle" className="dl-tick">
          {clock(h).slice(0, 2)}
        </text>
      ))}
      <path d={d} className="dl-curve" />
      <line x1={x(hour)} x2={x(hour)} y1={TOP - 4} y2={HORIZON} className="dl-now" />
      <circle cx={x(hour)} cy={y(elevation)} r="5" className={elevation > 0 ? "dl-sun" : "dl-sun dl-down"} />
    </svg>
  );
}
