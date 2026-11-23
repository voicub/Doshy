"use client";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { clamp } from "@/lib/mathUtil";

const SWEEP = 270; // degrees of dial travel, gap at the bottom
const R = 84;
const TAU = Math.PI / 180;

const point = (deg: number, r: number) => ({ x: r * Math.sin(deg * TAU), y: -r * Math.cos(deg * TAU) });
/** SVG arc along the dial from dial-angle a0 to a1 (0..SWEEP, clockwise from the lower left). */
function arc(a0: number, a1: number, r = R) {
  const s = point(a0 - SWEEP / 2, r);
  const e = point(a1 - SWEEP / 2, r);
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}
export const fmt = (n: number) => n.toFixed(1);
const frac = (v: number, min: number, max: number) => clamp((v - min) / (max - min), 0, 1);

type DialProps = {
  /** thermostat name, for the slider's label */
  name: string;
  current: number | undefined;
  /** HA hvac_action ("heating", "idle", ...) */
  action: string | undefined;
  target: number;
  min: number;
  max: number;
  step: number;
  isOff: boolean;
  onCommit: (v: number) => void;
};

/** The thermostat dial: drag it or use the arrow keys / buttons; the current temperature is a tick on the ring. */
export default function ClimateDial({ name, current, action, target, min, max, step, isOff, onCommit }: DialProps) {
  const dial = useRef<SVGSVGElement>(null);
  const f = (v: number) => frac(v, min, max);

  const fromPointer = (e: PointerEvent) => {
    const box = dial.current?.getBoundingClientRect();
    if (!box) return;
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    let deg = (Math.atan2(dx, -dy) / TAU + 360) % 360; // 0 = up, clockwise
    deg = deg > 180 ? deg - 360 : deg; // -180..180
    const t = clamp((deg + SWEEP / 2) / SWEEP, 0, 1); // the dead zone at the bottom snaps to the nearer end
    onCommit(min + t * (max - min));
  };
  const onKey = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 0.5 : step;
    const delta = { ArrowRight: big, ArrowUp: big, ArrowLeft: -big, ArrowDown: -big, PageUp: 1, PageDown: -1 }[e.key];
    if (delta !== undefined) { e.preventDefault(); onCommit(target + delta); }
    else if (e.key === "Home") { e.preventDefault(); onCommit(min); }
    else if (e.key === "End") { e.preventDefault(); onCommit(max); }
  };

  const heating = action === "heating";
  const actionText = isOff ? "OFF" : heating ? "HEATING" : (action ?? "idle").toUpperCase();
  const thumb = point(f(target) * SWEEP - SWEEP / 2, R);
  const cur = current != null ? point(f(current) * SWEEP - SWEEP / 2, R) : null;
  const curIn = current != null ? point(f(current) * SWEEP - SWEEP / 2, R - 9) : null;

  return (
    <div className={`dial ${heating ? "heating" : ""} ${isOff ? "off" : ""}`}>
      <svg
        ref={dial}
        viewBox="-100 -100 200 200"
        role="slider"
        tabIndex={0}
        aria-label={`Target temperature, ${name}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={target}
        aria-valuetext={`${fmt(target)} degrees`}
        onKeyDown={onKey}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus(); fromPointer(e); }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
      >
        <path d={arc(0, SWEEP)} className="d-track" />
        {f(target) > 0 && <path d={arc(0, Math.max(0.5, f(target) * SWEEP))} className="d-fill" />}
        {Array.from({ length: 28 }, (_, i) => {
          const p0 = point((i / 27) * SWEEP - SWEEP / 2, R + 8);
          const p1 = point((i / 27) * SWEEP - SWEEP / 2, R + (i % 9 === 0 ? 14 : 11));
          return <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} className="d-tick" />;
        })}
        {cur && curIn && <line x1={cur.x} y1={cur.y} x2={curIn.x} y2={curIn.y} className="d-cur" />}
        <circle cx={thumb.x} cy={thumb.y} r={7} className="d-thumb" />
        <text y={2} textAnchor="middle" className="d-val">{fmt(target)}</text>
        <text y={-46} textAnchor="middle" className="d-cap">TARGET</text>
        <text y={26} textAnchor="middle" className="d-now">{current != null ? `NOW ${fmt(current)}` : "NOW --"}</text>
      </svg>
      <div className="d-action" role="status"><i aria-hidden />{actionText}</div>
      <div className="d-btns">
        <button className="icon-btn" aria-label="Lower target" disabled={target <= min} onClick={() => onCommit(target - Math.max(step, 0.5))}><MinusIcon size={16} /></button>
        <button className="icon-btn" aria-label="Raise target" disabled={target >= max} onClick={() => onCommit(target + Math.max(step, 0.5))}><PlusIcon size={16} /></button>
      </div>
    </div>
  );
}
