"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { fmtAxisTime, fmtDuration, fmtNum, fmtStamp, niceTicks, timeTicks, totalMs, type Interval } from "@/lib/stats";

export type Pt = { t: number; v: number };
export type Line = { id: string; label: string; color: string; pts: Pt[]; dash?: string; step?: boolean; area?: boolean; width?: number };

/** Width of the element in px (ResizeObserver), 0 until measured. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Extend a series so its last value holds to `to` (sensors only report changes). */
export const holdTo = (pts: Pt[], to: number): Pt[] => (pts.length && pts[pts.length - 1].t < to ? [...pts, { t: to, v: pts[pts.length - 1].v }] : pts);

/** Value at `t`, holding the previous point. */
function valueAt(pts: Pt[], t: number): Pt | undefined {
  let hit: Pt | undefined;
  for (const p of pts) { if (p.t > t) break; hit = p; }
  return hit;
}

const M = { l: 34, r: 8, t: 16, b: 18 };
const px = (n: number) => Math.round(n) + 0.5;

function path(pts: Pt[], x: (t: number) => number, y: (v: number) => number, step?: boolean) {
  return pts.map((p, i) => (i === 0 ? `M${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}` : step ? `L${x(p.t).toFixed(1)} ${y(pts[i - 1].v).toFixed(1)}L${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}` : `L${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)).join("");
}

/** Hover / keyboard crosshair state shared by the chart components. */
function useCursor(from: number, to: number) {
  const [t, setT] = useState<number | null>(null);
  const move = (e: KeyboardEvent) => {
    const step = (to - from) / 60;
    if (e.key === "ArrowLeft") setT((c) => Math.max(from, (c ?? to) - step));
    else if (e.key === "ArrowRight") setT((c) => Math.min(to, (c ?? from) + step));
    else if (e.key === "Home") setT(from);
    else if (e.key === "End") setT(to);
    else if (e.key === "Escape" && t !== null) { e.stopPropagation(); setT(null); }
    else return;
    e.preventDefault();
  };
  return { t, setT, move };
}

type TimeChartProps = {
  from: number;
  to: number;
  lines: Line[];
  unit: string;
  digits?: number;
  /** Shaded spans (e.g. heating). */
  bands?: Interval[];
  bandLabel?: string;
  /** Include zero on the y axis (power). */
  zero?: boolean;
  height?: number;
  summary: string;
};

export function TimeChart({ from, to, lines, unit, digits = 1, bands, bandLabel, zero, height = 150, summary }: TimeChartProps) {
  const [wrap, width] = useWidth();
  const clip = useId().replace(/\W/g, "");
  const cur = useCursor(from, to);
  const pw = Math.max(0, width - M.l - M.r);
  const ph = height - M.t - M.b;
  const all = lines.flatMap((l) => l.pts.map((p) => p.v));
  const { ticks, lo, hi } = niceTicks(Math.min(...(zero ? [0, ...all] : all)), Math.max(...all), 4);
  const x = (t: number) => M.l + ((t - from) / (to - from)) * pw;
  const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * ph;
  const span = to - from;
  const hoverX = cur.t === null ? 0 : x(cur.t);
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    cur.setT(from + (Math.min(Math.max(e.clientX - r.left, 0), r.width) / r.width) * span);
  };
  const t = cur.t;
  const rows = t === null ? [] : lines.map((l) => ({ l, p: valueAt(l.pts, t) }));
  const inBand = t !== null && !!bands?.some((b) => t >= b.start && t <= b.end);

  return (
    <div className="sc-wrap" ref={wrap}>
      {width > 0 && (
        <svg className="sc" width={width} height={height} role="img" aria-label={summary} tabIndex={0} onKeyDown={cur.move} onBlur={() => cur.setT(null)}>
          <defs><clipPath id={clip}><rect x={M.l} y={M.t - 2} width={pw} height={ph + 4} /></clipPath></defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + pw} y1={px(y(v))} y2={px(y(v))} className="sc-grid" />
              <text x={M.l - 6} y={y(v) + 3.5} textAnchor="end" className="sc-ax">{fmtNum(v, Number.isInteger(v) ? 0 : digits)}</text>
            </g>
          ))}
          <text x={M.l - 6} y={9} textAnchor="end" className="sc-unit">{unit}</text>
          {timeTicks(from, to, Math.max(3, Math.floor(pw / 55))).map((t) => (
            <g key={t}>
              <line x1={px(x(t))} x2={px(x(t))} y1={M.t} y2={M.t + ph} className="sc-grid v" />
              <text x={x(t)} y={height - 4} textAnchor="middle" className="sc-ax">{fmtAxisTime(t, span)}</text>
            </g>
          ))}
          <g clipPath={`url(#${clip})`}>
            {bands?.map((b) => <rect key={b.start} x={x(b.start)} y={M.t} width={Math.max(1, x(b.end) - x(b.start))} height={ph} className="sc-band" />)}
            {lines.map((l) => l.pts.length > 0 && (
              <g key={l.id}>
                {l.area && <path d={`${path(l.pts, x, y, l.step)}L${x(l.pts[l.pts.length - 1].t)} ${y(lo)}L${x(l.pts[0].t)} ${y(lo)}Z`} fill={l.color} fillOpacity={0.14} />}
                <path d={path(l.pts, x, y, l.step)} fill="none" stroke={l.color} strokeWidth={l.width ?? 1.5} strokeDasharray={l.dash} strokeLinejoin="round" />
              </g>
            ))}
          </g>
          {cur.t !== null && (
            <g pointerEvents="none">
              <line x1={px(hoverX)} x2={px(hoverX)} y1={M.t} y2={M.t + ph} className="sc-cross" />
              {rows.map(({ l, p }) => p && <circle key={l.id} cx={hoverX} cy={y(p.v)} r={3} fill="var(--bg)" stroke={l.color} strokeWidth={1.5} />)}
            </g>
          )}
          <rect x={M.l} y={M.t} width={pw} height={ph} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => cur.setT(null)} />
        </svg>
      )}
      {cur.t !== null && (
        <div className="sc-tip" style={{ left: hoverX, top: M.t }} data-flip={hoverX > width / 2 ? "" : undefined} role="status">
          <b>{fmtStamp(cur.t)}</b>
          {rows.map(({ l, p }) => (
            <span key={l.id}><i style={{ background: l.color }} />{l.label}<em>{p ? `${fmtNum(p.v, digits)} ${unit}` : "--"}</em></span>
          ))}
          {bandLabel && <span><i className="sw-band" />{bandLabel}<em>{inBand ? "YES" : "NO"}</em></span>}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dash?: string; band?: boolean; off?: boolean }[] }) {
  return (
    <ul className="sc-legend">
      {items.map((i) => (
        <li key={i.label} className={i.off ? "off" : ""}>
          {i.band ? <i className="sw-band" /> : <svg width="16" height="6" aria-hidden><line x1="0" x2="16" y1="3" y2="3" stroke={i.color} strokeWidth="2" strokeDasharray={i.dash} /></svg>}
          {i.label}
          {i.off && <small>NO DATA</small>}
        </li>
      ))}
    </ul>
  );
}

export type GanttRow = { id: string; label: string; ivs: Interval[] | null; sub?: ReactNode; alert?: boolean; unit?: string };

const ROW_H = 20;

/** One strip per entity with its on / open intervals, a shared time axis and a hover read-out. */
export function Gantt({ from, to, rows, onLabel, summary }: { from: number; to: number; rows: GanttRow[]; onLabel: string; summary: string }) {
  const [strip, sw] = useWidth();
  const [hover, setHover] = useState<{ row: string; t: number; px: number; py: number } | null>(null);
  const span = to - from;
  const x = (t: number) => ((t - from) / span) * sw;
  const move = (row: string) => (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const host = e.currentTarget.closest(".gantt");
    if (!host) return;
    const hostBox = host.getBoundingClientRect();
    setHover({ row, t: from + (Math.min(Math.max(e.clientX - r.left, 0), r.width) / r.width) * span, px: e.clientX - hostBox.left, py: r.top - hostBox.top });
  };
  const h = hover ? rows.find((r) => r.id === hover.row) : undefined;
  const hit = hover ? h?.ivs?.find((i) => hover.t >= i.start && hover.t <= i.end) : undefined;
  const ticks = timeTicks(from, to, Math.max(3, Math.floor(sw / 80)));

  return (
    <div className="gantt" role="group" aria-label={summary}>
      {rows.map((r) => (
        <div className={`g-row ${r.alert ? "alert" : ""}`} key={r.id}>
          <span className="g-label"><span className="g-name" title={r.label}>{r.label}</span>{r.sub}</span>
          <div className="g-strip">
            {r.ivs === null ? <span className="g-none">NO DATA</span> : (
              <svg width={sw} height={ROW_H} onPointerMove={move(r.id)} onPointerLeave={() => setHover(null)} role="img" aria-label={`${r.label}: ${r.ivs.length} ${onLabel} periods`}>
                {ticks.map((t) => <line key={t} x1={px(x(t))} x2={px(x(t))} y1={0} y2={ROW_H} className="sc-grid v" />)}
                <rect x={0.5} y={ROW_H - 1.5} width={Math.max(0, sw - 1)} height={1} className="g-base" />
                {r.ivs.map((i) => <rect key={i.start} x={x(i.start)} y={3} width={Math.max(2, x(i.end) - x(i.start))} height={ROW_H - 8} className={r.alert && i.end >= to - 1 ? "g-on now" : "g-on"} />)}
                {hover && <line x1={px(x(hover.t))} x2={px(x(hover.t))} y1={0} y2={ROW_H} className="sc-cross" />}
              </svg>
            )}
          </div>
          <span className="g-total mono">{r.ivs === null ? "--" : fmtDuration(totalMs(r.ivs))}</span>
        </div>
      ))}
      <div className="g-row g-axis">
        <span />
        <div className="g-strip" ref={strip}>
          {sw > 0 && (
            <svg width={sw} height={14} aria-hidden>
              {ticks.filter((t) => x(t) > 16 && x(t) < sw - 16).map((t) => <text key={t} x={x(t)} y={10} textAnchor="middle" className="sc-ax">{fmtAxisTime(t, span)}</text>)}
            </svg>
          )}
        </div>
        <span />
      </div>
      {hover && h && (
        <div className="sc-tip" style={{ left: hover.px, top: hover.py }} data-flip={hover.px > 300 ? "" : undefined} role="status">
          <b>{h.label}</b>
          <span>{fmtStamp(hover.t)}</span>
          <span>{hit ? <>{onLabel.toUpperCase()} <em>{fmtStamp(hit.start)} - {fmtStamp(hit.end)} ({fmtDuration(hit.end - hit.start)})</em></> : "OFF"}</span>
        </div>
      )}
    </div>
  );
}
