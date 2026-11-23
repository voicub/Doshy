import type { ReactNode } from "react";
import { clamp } from "@/lib/mathUtil";
import { styleOf } from "@/lib/openings";
import type { OpeningStyle } from "@/lib/types";
import { makeKit, type Kit, type Q, type SymbolProps } from "./openingKit";

type Draw = (k: Kit) => ReactNode;

const FAINT = { dashed: true, opacity: 0.7 } as const; // an opening with no leaf: a dashed line across it

const doubleLeaves = (k: Kit, french: boolean) => <>{k.leaf(-k.h, k.h, french)}{k.leaf(k.h, k.h, french)}</>;

const sidelight: Draw = (k) => {
  const lw = Math.min(0.9, k.w - 0.35);
  const end = k.hs - k.hd * lw; // the leaf's closed tip; the glass panel fills the rest of the span
  return (
    <>
      {k.leaf(k.hs, lw)}
      {k.line([end, -0.03], [-k.hs, -0.03])}
      {k.line([end, 0.03], [-k.hs, 0.03])}
    </>
  );
};

const slidingGlass: Draw = (k) => {
  const pw = k.w * 0.58;
  return (
    <>
      {k.rect(-k.h, -k.h + pw, 0.04, 0.03)}
      {k.rect(k.h - pw, k.h, -0.04, 0.03)}
      {k.arrow(-0.2 * k.w, 0.2 * k.w, k.side * 0.2)}
    </>
  );
};

const pocket: Draw = (k) => {
  const ll = k.w + 0.1;
  const n = k.inward * (k.wallW / 2 + 0.04);
  const out = k.hs + k.hd * ll; // the open leaf lies beyond the jamb on the hinge side
  return (
    <>
      {k.rect(-ll / 2, ll / 2, n, 0.05)}
      {k.poly([[k.hs, n - 0.025], [out, n - 0.025], [out, n + 0.025], [k.hs, n + 0.025]], true, { dashed: true })}
      {k.line([-k.hd * k.h, n + k.inward * 0.05], [out, n + k.inward * 0.05], { opacity: 0.7 })}
    </>
  );
};

const folding: Draw = (k) => {
  const amp = 0.12;
  return k.poly([0, 1, 2, 3, 4].map((i): Q => [-k.h + (k.w * i) / 4, i % 2 ? k.side * amp : 0]), false, { width: k.hair * 1.2 });
};

const arch: Draw = (k) => (
  <>
    {k.line([-k.h, 0], [k.h, 0], FAINT)}
    {k.archGlyph(0, Math.min(k.h, 0.2), k.side)}
  </>
);

const passage: Draw = (k) => k.line([-k.h, 0], [k.h, 0], FAINT);

const garageSectional: Draw = (k) => (
  <>
    {k.line([-k.h, 0], [k.h, 0], FAINT)}
    {k.rails(true)}
  </>
);

const garageRoller: Draw = (k) => (
  <>
    {k.line([-k.h, 0], [k.h, 0], FAINT)}
    {k.rect(-k.h, k.h, k.inward * 0.09, 0.18, k.edge)}
    {k.rails(false)}
  </>
);

const twin: Draw = (k) => (
  <>
    {k.hairlines()}
    {k.centre()}
    {k.line([0, -0.05], [0, 0.05])}
    {k.hinged && <>{k.hingeTick(-k.h)}{k.hingeTick(k.h)}</>}
  </>
);

const plainWindow = (k: Kit, high: boolean) => (
  <>
    {k.hairlines(0.035, k.hair, high)}
    {k.centre(high)}
  </>
);

const sliding: Draw = (k) => (
  <>
    {k.line([-k.h, -0.035], [k.h * 0.1, -0.035])}
    {k.line([-k.h * 0.1, 0.035], [k.h, 0.035])}
    {k.arrow(-0.18 * k.w, 0.18 * k.w, k.inward * 0.13)}
  </>
);

const tiltTurn: Draw = (k) => {
  const apex = k.hs - k.hd * 0.05;
  return (
    <>
      {k.hairlines()}
      {k.centre()}
      {k.hinged && k.hingeTick(k.hs)}
      {k.line([apex, 0], [k.hs - k.hd * k.w * 0.45, -0.07], { opacity: 0.7 })}
      {k.line([apex, 0], [k.hs - k.hd * k.w * 0.45, 0.07], { opacity: 0.7 })}
    </>
  );
};

const bay: Draw = (k) => {
  const d = Math.min(0.5, k.w * 0.22);
  const fw = k.w - 2 * d;
  const n = -k.inward * d; // sticks out away from the room
  return (
    <>
      {k.poly([[-k.h, 0], [-fw / 2, n], [fw / 2, n], [k.h, 0]], false, { width: k.hair * 1.2 })}
      {k.line([-k.h, 0], [k.h, 0], { opacity: 0.7 })}
    </>
  );
};

const arched: Draw = (k) => {
  const r = Math.min(0.12, k.w / 4);
  return (
    <>
      {k.hairlines()}
      {k.centre()}
      {k.archGlyph(-k.h + r + 0.04, r, k.inward)}
      {k.archGlyph(k.h - r - 0.04, r, k.inward)}
    </>
  );
};

const round: Draw = (k) => {
  const C = k.P(0, 0);
  return (
    <>
      {k.hairlines()}
      <circle cx={C.x} cy={C.y} r={Math.min(k.h, 0.18)} fill="none" stroke={k.edge} strokeWidth={k.hair} />
    </>
  );
};

const glassBlock: Draw = (k) => {
  const cells = clamp(Math.round(k.w / 0.19), 1, 25);
  const pitch = k.w / cells;
  const h = Math.min(0.05, pitch * 0.5);
  return (
    <>
      {k.hairlines()}
      {Array.from({ length: cells }, (_, i) => {
        const s = -k.h + pitch * (i + 0.5);
        return <g key={i}>{k.poly([[s - h / 2, -h / 2], [s + h / 2, -h / 2], [s + h / 2, h / 2], [s - h / 2, h / 2]], true, { width: k.hair * 0.6 })}</g>;
      })}
    </>
  );
};

const shopfront: Draw = (k) => {
  const panes = Math.max(1, Math.ceil(k.w / 1.2));
  return (
    <>
      {k.hairlines(0.05, k.hair * 1.6)}
      {Array.from({ length: panes - 1 }, (_, i) => {
        const s = -k.h + (k.w * (i + 1)) / panes;
        return <g key={i}>{k.line([s, -0.06], [s, 0.06], { width: k.hair * 1.2 })}</g>;
      })}
    </>
  );
};

const casement: Draw = (k) => (
  <>
    {k.hairlines()}
    {k.centre()}
    {k.hinged && k.hingeTick(k.hs)}
  </>
);

/** A single door: the original look, drawn straight from the DoorSwing. */
const singleDoor: Draw = ({ sw, w, blocked, warn, edge, hair, dash }) => {
  const turn = (sw.arcStart.x - sw.hinge.x) * (sw.arcEnd.y - sw.hinge.y) - (sw.arcStart.y - sw.hinge.y) * (sw.arcEnd.x - sw.hinge.x) > 0 ? 1 : 0;
  const sector = `M${sw.hinge.x} ${sw.hinge.y}L${sw.arcStart.x} ${sw.arcStart.y}A${w} ${w} 0 0 ${turn} ${sw.arcEnd.x} ${sw.arcEnd.y}Z`;
  return (
    <>
      {blocked && <path d={sector} fill={warn} fillOpacity={0.12} stroke={warn} strokeWidth={hair} pointerEvents="none" />}
      <line x1={sw.hinge.x} y1={sw.hinge.y} x2={sw.leafEnd.x} y2={sw.leafEnd.y} stroke={blocked ? warn : edge} strokeWidth={hair * 1.4} />
      <path d={`M${sw.arcStart.x} ${sw.arcStart.y}A${w} ${w} 0 0 ${turn} ${sw.arcEnd.x} ${sw.arcEnd.y}`} fill="none" stroke={blocked ? warn : edge} strokeOpacity={blocked ? 0.9 : 0.55} strokeWidth={hair} strokeDasharray={dash} />
    </>
  );
};

/** How each style is drawn; a style not listed here (the plain single door) uses `singleDoor`. */
const DRAW: Partial<Record<OpeningStyle, Draw>> = {
  double: (k) => doubleLeaves(k, false),
  french: (k) => doubleLeaves(k, true),
  sidelight,
  slidingGlass,
  pocket,
  folding,
  arch,
  passage,
  garageSectional,
  garageRoller,
  twin,
  picture: (k) => plainWindow(k, false),
  highWindow: (k) => plainWindow(k, true),
  sliding,
  tiltTurn,
  bay,
  arched,
  round,
  glassBlock,
  shopfront,
  casement,
};

/** The plan symbol of one opening, drawn inside OpeningMark's group: leaf and swing arc for doors, glazing lines for windows. */
export function OpeningSymbol(p: SymbolProps) {
  const draw = DRAW[styleOf(p.o)] ?? singleDoor;
  return <>{draw(makeKit(p))}</>;
}
