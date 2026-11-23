"use client";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useId, type PointerEvent as RPE } from "react";
import { CORNERS, type Corner } from "@/lib/ground";
import type { SlabVoid } from "@/lib/types";
import { LINE, PAPER } from "./BlueprintPaper";
import { DimLine } from "./Dimensions";
import { hitOf } from "./hit";
import { ACCENT } from "./planStyle";
import "./StairwellMark.css";

const ARROW_MAX = 2.2;

type Props = {
  v: SlabVoid;
  /** "down": a hole in this floor (hatched). "up": the hole in the floor above, seen from below (dashed outline). */
  mode: "down" | "up";
  selected?: boolean;
  showDims?: boolean;
  /** Screen-constant unit and metres per screen pixel of the plan view; `touch` grows handles on touchscreens. */
  u: number;
  px: number;
  touch?: number;
  onDown?: (e: RPE) => void;
  onCorner?: (e: RPE, c: Corner) => void;
  onTurn?: () => void;
};

/**
 * A stairwell on the blueprint: the rectangle cut out of a floor, hatched, with an arrow showing which way the stairs lead and UP / DN.
 * Hand-drawn ones are selectable, with corner handles and a quarter-turn button; the hole of a stair item is drawn the same but not editable.
 */
export default function StairwellMark({ v, mode, selected, showDims, u, px, touch = 1, onDown, onCorner, onTurn }: Props) {
  const id = useId();
  const down = mode === "down";
  const [cx, cy] = [v.x + v.w / 2, v.y + v.h / 2];
  const vertical = !!v.auto || v.h >= v.w; // a stair item always climbs along its own length; a hand-drawn hole along its longer side
  const len = Math.min(ARROW_MAX, (vertical ? v.h : v.w) * 0.6);
  const sign = down ? 1 : -1; // you walk down toward the front of the stairs, up toward the back
  const [ax, ay] = vertical ? [0, sign] : [sign, 0];
  const tip = { x: cx + (ax * len) / 2, y: cy + (ay * len) / 2 };
  const tail = { x: cx - (ax * len) / 2, y: cy - (ay * len) / 2 };
  const head = 0.16 * Math.min(u, 1.6);
  const side = { x: -ay, y: ax };
  const hs = 10 * px * touch;
  const edge = selected ? ACCENT : LINE;
  const handles: Record<Corner, { x: number; y: number }> = { nw: { x: v.x, y: v.y }, ne: { x: v.x + v.w, y: v.y }, se: { x: v.x + v.w, y: v.y + v.h }, sw: { x: v.x, y: v.y + v.h } };
  const hatch = Math.max(0.08, 7 * px);
  const t = 24 * px * touch;
  const dims = (showDims || selected) && !v.rot && v.w * v.h >= 0.04;
  return (
    <g className="sw-mark">
      <g transform={v.rot ? `rotate(${v.rot} ${cx} ${cy})` : undefined} pointerEvents={onDown ? undefined : "none"}>
        {down && (
          <defs>
            <pattern id={`${id}h`} width={hatch} height={hatch} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={hatch} height={hatch} fill={PAPER} />
              <line x1="0" y1="0" x2="0" y2={hatch} stroke={LINE} strokeOpacity={0.28} strokeWidth={px} />
            </pattern>
          </defs>
        )}
        <g onPointerDown={onDown} style={onDown ? { cursor: "move" } : undefined}>
          <rect x={v.x} y={v.y} width={v.w} height={v.h} fill={down ? `url(#${id}h)` : "none"} stroke={edge} strokeWidth={(selected ? 2.4 : 1.6) * px} strokeDasharray={down ? undefined : `${0.14 * u} ${0.1 * u}`} strokeOpacity={down ? 1 : 0.75} />
          {down && <line x1={v.x} y1={v.y} x2={v.x + v.w} y2={v.y + v.h} stroke={edge} strokeOpacity={0.45} strokeWidth={px} />}
          {down && <line x1={v.x + v.w} y1={v.y} x2={v.x} y2={v.y + v.h} stroke={edge} strokeOpacity={0.45} strokeWidth={px} />}
          {selected && <rect x={v.x} y={v.y} width={v.w} height={v.h} fill={ACCENT} fillOpacity={0.08} pointerEvents="none" />}
          <g pointerEvents="none" stroke={down ? LINE : ACCENT} fill={down ? LINE : ACCENT}>
            <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} strokeWidth={1.6 * px} />
            <polygon points={`${tip.x},${tip.y} ${tip.x - ax * head * 1.6 + side.x * head},${tip.y - ay * head * 1.6 + side.y * head} ${tip.x - ax * head * 1.6 - side.x * head},${tip.y - ay * head * 1.6 - side.y * head}`} stroke="none" />
            <text x={tail.x + side.x * 0.2 * u} y={tail.y + side.y * 0.2 * u + 0.08 * u} textAnchor="middle" fontSize={0.2 * u} stroke={PAPER} strokeWidth={0.07 * u} paintOrder="stroke" style={{ letterSpacing: "0.12em" }}>
              {down ? "DN" : "UP"}
            </text>
          </g>
        </g>
        {selected && onCorner && CORNERS.map((k) => (
          <g key={k} onPointerDown={(e) => onCorner(e, k)} style={{ cursor: k === "nw" || k === "se" ? "nwse-resize" : "nesw-resize" }}>
            <title>Drag to resize the opening</title>
            <rect x={handles[k].x - hitOf(hs * 2, px, touch) / 2} y={handles[k].y - hitOf(hs * 2, px, touch) / 2} width={hitOf(hs * 2, px, touch)} height={hitOf(hs * 2, px, touch)} fill="transparent" />
            <rect x={handles[k].x - hs / 2} y={handles[k].y - hs / 2} width={hs} height={hs} fill={PAPER} stroke={ACCENT} strokeWidth={1.5 * px} />
          </g>
        ))}
        {selected && onTurn && (
          <g onPointerDown={(e) => { e.stopPropagation(); onTurn(); }} style={{ cursor: "pointer" }}>
            <title>Turn the opening a quarter turn (R)</title>
            <rect x={v.x + v.w + 8 * px + t / 2 - hitOf(t, px, touch) / 2} y={v.y - 8 * px - t / 2 - hitOf(t, px, touch) / 2} width={hitOf(t, px, touch)} height={hitOf(t, px, touch)} fill="transparent" />
            <rect x={v.x + v.w + 8 * px} y={v.y - 8 * px - t} width={t} height={t} fill={PAPER} fillOpacity={0.9} stroke={ACCENT} strokeWidth={px} />
            <g transform={`translate(${v.x + v.w + 8 * px + 4 * px} ${v.y - 8 * px - t + 4 * px}) scale(${(t - 8 * px) / 256})`} pointerEvents="none">
              <ArrowClockwiseIcon size={256} color={ACCENT} weight="bold" />
            </g>
          </g>
        )}
      </g>
      {dims && (
        <>
          <DimLine a={{ x: v.x, y: v.y }} b={{ x: v.x + v.w, y: v.y }} off={-0.3 - 8 * px} label={v.w.toFixed(2)} px={px} bold={selected} />
          <DimLine a={{ x: v.x + v.w, y: v.y }} b={{ x: v.x + v.w, y: v.y + v.h }} off={-0.3 - 8 * px} label={v.h.toFixed(2)} px={px} bold={selected} />
        </>
      )}
    </g>
  );
}
