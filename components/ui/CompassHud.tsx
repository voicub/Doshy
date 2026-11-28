"use client";
import { memo, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { planDirOf, screenAngleOf, useCameraYaw } from "@/lib/cameraYaw";
import { useStore } from "@/lib/store";
import type { SkyState } from "@/lib/sky";
import { useSky } from "@/lib/useSky";
import { useClickAway } from "./useDismiss";
import { beaufort, compass8 } from "@/lib/wind";
import MonoLabel from "./MonoLabel";
import "./CompassHud.css";

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const MAJOR = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const pointOf = (deg: number) => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) % 360).padStart(3, "0");

const R = 46; // outer tick radius, viewBox -50..50
/** Point at clockwise screen angle `deg` (0 = up) and radius `r`. */
const at = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
};

/** Popover: type the compass bearing of the plan's up direction. */
function BearingForm({ bearing, onClose }: { bearing: number; onClose: () => void }) {
  const setBearing = useStore((s) => s.setBearing);
  const [text, setText] = useState(String(bearing));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const commit = (t: string) => {
    setText(t);
    const n = Number(t);
    if (t.trim() !== "" && Number.isFinite(n)) setBearing(n);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "Enter") { e.preventDefault(); onClose(); }
  };
  return (
    <div className="compass-pop hud brackets" role="dialog" aria-label="Plan north" onKeyDown={onKey}>
      <MonoLabel>Plan up points to</MonoLabel>
      <label className="field num">
        <input ref={input} type="number" inputMode="numeric" min={0} max={359} step={1} value={text} onChange={(e) => commit(e.target.value)} aria-label="Plan bearing in degrees" />
        <i>deg</i>
      </label>
      <p className="field-note">{"Compass bearing of the plan's up direction. The starter plan uses 156."}</p>
    </div>
  );
}

/** The ring's 72 ticks and the north tip in the ring's own frame (north at the top). They never change, so a turning camera rotates one <g> around them instead of rewriting 72 lines every frame. */
const RingMarks = memo(function RingMarks() {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const deg = i * 5;
    const major = deg % 45 === 0;
    const a = at(deg, R);
    const b = at(deg, R - (major ? 6 : deg % 15 === 0 ? 4 : 2.5));
    return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={major ? "ct major" : "ct"} />;
  });
  // north tip: a cyan triangle on the ring, base inside the tick band, apex outside
  const tip = [at(-5, R - 1), at(5, R - 1), at(0, R + 6)];
  return (
    <>
      {ticks}
      <path d={`M ${tip.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ")} Z`} className="cn" />
    </>
  );
});

/** The rotating ring: ticks, north tip, cardinal letters, wind arrow, the sun at its azimuth and the fixed "forward" marker. */
function CompassRing({ north, sky }: { north: number; sky: SkyState }) {
  const screenOf = (compass: number) => north + compass;

  const up = sky.elevation >= 0;
  const sun = at(screenOf(sky.azimuth), R + 8);
  const sunAlpha = 1 - 0.55 * sky.weather.cloud;

  const windFrom = sky.weather.windFrom;
  const wl = Math.min(1, sky.weather.wind / 14);
  const windA = windFrom ?? 0;
  const windTail = at(screenOf(windA), R - 7);
  const windHead = at(screenOf(windA), R - 20 - 14 * wl);
  const wa = (screenOf(windA) * Math.PI) / 180;
  const wing = (s: number) => ({ // arrowhead wing: the inward direction turned by s radians, drawn back from the tip
    x: windHead.x - (-Math.sin(wa) * Math.cos(s) - Math.cos(wa) * Math.sin(s)) * 5,
    y: windHead.y - (-Math.sin(wa) * Math.sin(s) + Math.cos(wa) * Math.cos(s)) * 5,
  });
  const windHeadL = wing(0.5);
  const windHeadR = wing(-0.5);

  return (
    <svg viewBox="-60 -60 120 120" width="116" height="116" aria-hidden>
      <circle r={R} className="cr" />
      <circle r={R - 17} className="cr inner" />
      <g transform={`rotate(${north})`}><RingMarks /></g>
      {MAJOR.map((l) => {
        const p = at(screenOf(POINTS.indexOf(l) * 22.5), 31);
        return (
          <text key={l} x={p.x} y={p.y} className={l === "N" ? "cl n" : "cl"} textAnchor="middle" dominantBaseline="central">{l}</text>
        );
      })}
      {windFrom !== undefined && sky.weather.wind > 0.3 && (
        // the wind arrow: starts on the ring at the bearing the wind comes FROM and points through the flat, longer and bolder the harder it blows
        <g className="cwind" stroke="#9ad1ff" fill="none" strokeLinecap="round" opacity={0.45 + 0.5 * Math.min(1, sky.weather.wind / 12)}>
          <line x1={windTail.x} y1={windTail.y} x2={windHead.x} y2={windHead.y} strokeWidth={1 + Math.min(1.6, sky.weather.wind / 8)} />
          <path d={`M ${windHeadL.x} ${windHeadL.y} L ${windHead.x} ${windHead.y} L ${windHeadR.x} ${windHeadR.y}`} strokeWidth={1.2} />
        </g>
      )}
      <circle cx={sun.x} cy={sun.y} r={3.6} className={up ? "cs up" : "cs"} opacity={sunAlpha} />
      <path d="M 0 -3.5 L 2.4 2.5 L 0 1 L -2.4 2.5 Z" className="cfwd" />
    </svg>
  );
}

/** Rotating compass ring: true north stays true on screen as the camera orbits; the sun rides the ring at its real azimuth. */
export default function CompassHud() {
  const yaw = useCameraYaw();
  const bearing = useStore((s) => s.plan.bearing ?? 0);
  const sky = useSky();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useClickAway(root, () => setOpen(false), open);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) btn.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const north = screenAngleOf(planDirOf(0, bearing), yaw); // where true north points on screen
  const facing = -north; // compass bearing of the screen-up direction
  const facingText = `${pad3(facing)} ${pointOf(facing)}`;
  const sunText = `${pad3(sky.azimuth)} ${sky.elevation >= 0 ? "+" : "-"}${Math.abs(Math.round(sky.elevation))}`;
  const windFrom = sky.weather.windFrom;

  return (
    <div className="compass hud brackets" ref={root}>
      <button ref={btn} className="compass-btn" aria-haspopup="dialog" aria-expanded={open} aria-label={`Compass. Facing ${facingText}. Sun azimuth ${pad3(sky.azimuth)}, elevation ${Math.round(sky.elevation)}. Set plan north`} title={`Plan up = ${pad3(bearing)} deg. Click to change.`} onClick={() => setOpen((o) => !o)}>
        <CompassRing north={north} sky={sky} />
      </button>
      <div className="compass-read">
        <div className="cread">
          <MonoLabel>Facing</MonoLabel>
          <span className="t-val">{facingText}</span>
        </div>
        <div className="cread" title={`Sun azimuth and elevation (${sky.source === "sun.sun" ? "Home Assistant sun.sun" : sky.source})`}>
          <MonoLabel>Sun</MonoLabel>
          <span className="t-val">{sunText}</span>
        </div>
        {windFrom !== undefined && (
          <div className="cread" title={`${beaufort(sky.weather.wind).name}: wind from ${pad3(windFrom)} degrees`}>
            <MonoLabel>Wind</MonoLabel>
            <span className="t-val">{`${sky.weather.wind.toFixed(1)} m/s ${compass8(windFrom)}`}</span>
          </div>
        )}
      </div>
      {open && <BearingForm bearing={bearing} onClose={() => setOpen(false)} />}
    </div>
  );
}
