import type { ReactNode } from "react";
import type { DoorSwing } from "@/lib/placement";
import type { OpeningStyle, OpeningType, Pt } from "@/lib/types";

/** A point (s, n) in the opening's wall frame: `s` metres along the wall from the opening's centre, `n` along the wall normal. */
export type Q = [number, number];

type LineExtra = { color?: string; width?: number; opacity?: number; dashed?: boolean };
type PolyExtra = { fill?: string; fillOpacity?: number; width?: number; dashed?: boolean };

export type SymbolProps = {
  o: { type: OpeningType; style?: OpeningStyle; width: number; hinge?: "start" | "end"; swing?: "left" | "right" };
  /** Plan point `s` metres along the wall from the opening centre and `n` metres along the wall normal. */
  P: (s: number, n?: number) => Pt;
  sw: DoorSwing;
  /** Normal side the leaf opens to. */
  side: 1 | -1;
  /** +1: the room is on the +n side of the wall. */
  inward: 1 | -1;
  edge: string;
  accent: string;
  warn: string;
  blocked: boolean;
  hair: number;
  u: number;
  wallW: number;
};

/** The drawing tools and measurements one opening's symbol is made from. */
export type Kit = {
  /** Opening width, its half, and the hinge jamb's s (and that jamb's direction along s). */
  w: number;
  h: number;
  hs: number;
  hd: 1 | -1;
  side: 1 | -1;
  inward: 1 | -1;
  wallW: number;
  edge: string;
  warn: string;
  hair: number;
  blocked: boolean;
  /** A window only shows its hinge when one was chosen. */
  hinged: boolean;
  dash: string;
  P: SymbolProps["P"];
  sw: DoorSwing;
  line: (a: Q, b: Q, extra?: LineExtra) => ReactNode;
  poly: (qs: Q[], closed?: boolean, extra?: PolyExtra) => ReactNode;
  arc: (c: Q, a: Q, b: Q, r: number, mid?: Q, dashed?: boolean) => ReactNode;
  /** A hinged leaf: leaf line plus dashed quarter arc, `r` long, hinged at s = hingeS and opening to `side`. */
  leaf: (hingeS: number, r: number, double?: boolean) => ReactNode;
  arrow: (s1: number, s2: number, n: number) => ReactNode;
  rect: (s1: number, s2: number, n: number, t: number, fill?: string) => ReactNode;
  hairlines: (n?: number, width?: number, dashed?: boolean) => ReactNode;
  centre: (dashed?: boolean) => ReactNode;
  hingeTick: (s: number) => ReactNode;
  rails: (ticks: boolean) => ReactNode;
  archGlyph: (cs: number, r: number, n: number) => ReactNode;
};

/** Build the drawing tools for one opening. Every length is in metres of the wall frame; line widths follow `hair`, dashes follow `u`. */
export function makeKit(p: SymbolProps): Kit {
  const { o, P, sw, side, inward, edge, accent, warn, blocked, hair, u, wallW } = p;
  const w = o.width;
  const h = w / 2;
  const ink = blocked ? warn : edge;
  const dash = `${0.08 * u} ${0.06 * u}`;
  const hs = o.hinge === "end" ? h : -h;
  const hd = hs > 0 ? 1 : -1;
  const pt = ([s, n]: Q) => P(s, n);

  const line: Kit["line"] = (a, b, extra = {}) => {
    const A = pt(a);
    const B = pt(b);
    return <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={extra.color ?? edge} strokeOpacity={extra.opacity} strokeWidth={extra.width ?? hair} strokeDasharray={extra.dashed ? dash : undefined} />;
  };
  const poly: Kit["poly"] = (qs, closed = false, extra = {}) => (
    <path d={`M${qs.map((q) => `${pt(q).x} ${pt(q).y}`).join("L")}${closed ? "Z" : ""}`} fill={extra.fill ?? "none"} fillOpacity={extra.fillOpacity} stroke={edge} strokeWidth={extra.width ?? hair} strokeLinejoin="round" strokeDasharray={extra.dashed ? dash : undefined} />
  );
  /** Arc of radius r around centre c from a to b; the sweep flag follows the turn direction (b may be the arc's midpoint for half circles). */
  const arc: Kit["arc"] = (c, a, b, r, mid = b, dashed = true) => {
    const C = pt(c);
    const A = pt(a);
    const M = pt(mid);
    const turn = (A.x - C.x) * (M.y - C.y) - (A.y - C.y) * (M.x - C.x) > 0 ? 1 : 0;
    return <path d={`M${A.x} ${A.y}A${r} ${r} 0 0 ${turn} ${pt(b).x} ${pt(b).y}`} fill="none" stroke={ink} strokeOpacity={blocked ? 0.9 : 0.55} strokeWidth={hair} strokeDasharray={dashed ? dash : undefined} />;
  };
  const leaf: Kit["leaf"] = (hingeS, r, double = false) => {
    const d = hingeS > 0 ? 1 : -1;
    const tip: Q = [hingeS, side * r];
    return (
      <>
        {double ? (
          <>
            {line([hingeS - 0.012, 0], [hingeS - 0.012, side * r], { color: ink })}
            {line([hingeS + 0.012, 0], [hingeS + 0.012, side * r], { color: ink })}
          </>
        ) : (
          line([hingeS, 0], tip, { color: ink, width: hair * 1.4 })
        )}
        {arc([hingeS, 0], [hingeS - d * r, 0], tip, r)}
      </>
    );
  };
  const arrow: Kit["arrow"] = (s1, s2, n) => {
    const d = s2 > s1 ? 1 : -1;
    const k = 0.06;
    return (
      <>
        {line([s1, n], [s2, n])}
        {line([s2, n], [s2 - d * k, n + k * 0.6])}
        {line([s2, n], [s2 - d * k, n - k * 0.6])}
        {line([s1, n], [s1 + d * k, n + k * 0.6])}
        {line([s1, n], [s1 + d * k, n - k * 0.6])}
      </>
    );
  };
  const rect: Kit["rect"] = (s1, s2, n, t, fill) => poly([[s1, n - t / 2], [s2, n - t / 2], [s2, n + t / 2], [s1, n + t / 2]], true, { fill, fillOpacity: fill ? 0.35 : undefined });
  const hairlines: Kit["hairlines"] = (n = 0.035, width = hair, dashed = false) => (
    <>
      {line([-h, -n], [h, -n], { width, dashed })}
      {line([-h, n], [h, n], { width, dashed })}
    </>
  );
  const centre: Kit["centre"] = (dashed = false) => line([-h, 0], [h, 0], { color: accent, opacity: 0.6, width: hair * 0.6, dashed });
  const hingeTick: Kit["hingeTick"] = (s) => {
    const A = P(s, 0);
    return <line x1={A.x} y1={A.y} x2={A.x + sw.normal.x * w * 0.35} y2={A.y + sw.normal.y * w * 0.35} stroke={edge} strokeOpacity={0.7} strokeWidth={hair} />;
  };
  const rails: Kit["rails"] = (ticks) => (
    <>
      {[-h, h].map((s) => (
        <g key={s}>
          {line([s, 0], [s, inward * 0.9], { dashed: true, opacity: 0.55 })}
          {ticks && [0.3, 0.6, 0.9].map((n) => line([s - 0.04, inward * n], [s + 0.04, inward * n], { opacity: 0.55 }))}
        </g>
      ))}
    </>
  );
  const archGlyph: Kit["archGlyph"] = (cs, r, n) => arc([cs, 0], [cs - r, 0], [cs + r, 0], r, [cs, n * r], false);

  return { w, h, hs, hd, side, inward, wallW, edge, warn, hair, blocked, hinged: !!(o.hinge || o.swing), dash, P, sw, line, poly, arc, leaf, arrow, rect, hairlines, centre, hingeTick, rails, archGlyph };
}
