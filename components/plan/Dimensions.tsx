import { openingTags, outsideNormal, roomArea, wallAxes, wallBounds } from "@/lib/blueprint";
import { WALL_T, wallLen } from "@/lib/geometry";
import { shellWalls } from "@/lib/fences";
import type { Plan, Pt } from "@/lib/types";
import { LINE, PAPER } from "./BlueprintPaper";

const DIM = "#8fd0ff"; // dimension linework
const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "0.04em" } as const;
const m2 = (n: number) => `${n.toFixed(2)}`;
/** A label with a paper-coloured outline so it stays readable over the rulings and hatches. */
const halo = (px: number) => ({ ...MONO, paintOrder: "stroke" as const, stroke: PAPER, strokeWidth: 3.5 * px, strokeLinejoin: "round" as const });

type DimProps = {
  a: Pt;
  b: Pt;
  /** Signed distance of the dimension line from a-b along the left normal (-dy, dx); negative = the other side. */
  off: number;
  label: string;
  px: number;
  /** Extension lines from the measured points out to the dimension line (architectural), off for dimensions drawn inside a room. */
  ext?: boolean;
  bold?: boolean;
};

/** One architectural dimension: extension lines, a line with 45 degree tick marks, and the value centred above it, turned to read left to right or bottom to top. */
export function DimLine({ a, b, off, label, px, ext = true, bold }: DimProps) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const n = { x: -uy, y: ux };
  const p1 = { x: a.x + n.x * off, y: a.y + n.y * off };
  const p2 = { x: b.x + n.x * off, y: b.y + n.y * off };
  const s = Math.sign(off) || 1;
  const tick = 4 * px;
  const tx = (ux + n.x) * 0.7071 * tick; // tick mark: the line direction turned 45 degrees
  const ty = (uy + n.y) * 0.7071 * tick;
  let deg = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (deg >= 90 - 1e-6) deg -= 180;
  else if (deg < -90) deg += 180;
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const showText = len / px >= 34;
  // the label sits a little off the line on the side away from the measured object; its own "up" depends on how it was turned to read upright
  const lift = 5 * px;
  const rad = (deg * Math.PI) / 180;
  const above = Math.sin(rad) * n.x * s - Math.cos(rad) * n.y * s > 0;
  const lx = mx + n.x * s * lift;
  const ly = my + n.y * s * lift;
  return (
    <g pointerEvents="none" stroke={DIM} strokeWidth={px} fill="none">
      {ext && (
        <>
          <line x1={a.x + n.x * s * 3 * px} y1={a.y + n.y * s * 3 * px} x2={p1.x + n.x * s * 4 * px} y2={p1.y + n.y * s * 4 * px} strokeOpacity={0.7} />
          <line x1={b.x + n.x * s * 3 * px} y1={b.y + n.y * s * 3 * px} x2={p2.x + n.x * s * 4 * px} y2={p2.y + n.y * s * 4 * px} strokeOpacity={0.7} />
        </>
      )}
      <line x1={p1.x - ux * 3 * px} y1={p1.y - uy * 3 * px} x2={p2.x + ux * 3 * px} y2={p2.y + uy * 3 * px} />
      <line x1={p1.x - tx} y1={p1.y - ty} x2={p1.x + tx} y2={p1.y + ty} strokeWidth={px * 1.6} />
      <line x1={p2.x - tx} y1={p2.y - ty} x2={p2.x + tx} y2={p2.y + ty} strokeWidth={px * 1.6} />
      {showText && (
        <text transform={`translate(${lx} ${ly}) rotate(${deg})`} textAnchor="middle" dominantBaseline={above ? "auto" : "hanging"} fontSize={10.5 * px} fill={bold ? LINE : DIM} stroke="none" style={halo(px)} fontWeight={bold ? 600 : 400}>
          {label}
        </text>
      )}
    </g>
  );
}

/** Length of every exterior wall, on the outside. Interior walls are measured by the room dimensions instead. */
export function WallDimensions({ plan, px }: { plan: Plan; px: number }) {
  return (
    <>
      {plan.walls.map((w) => {
        const out = outsideNormal(plan, w);
        if (!out || wallLen(w) < 0.3) return null;
        const len = wallLen(w);
        const left = { x: -(w.b.y - w.a.y) / len, y: (w.b.x - w.a.x) / len };
        const side = left.x * out.x + left.y * out.y >= 0 ? 1 : -1;
        return <DimLine key={w.id} a={w.a} b={w.b} off={side * (0.55 + (w.thickness ?? WALL_T) / 2)} label={m2(len)} px={px} />;
      })}
    </>
  );
}

/** Wall thickness in centimetres, small, beside the middle of every wall long enough to carry it. */
export function WallThickness({ plan, px }: { plan: Plan; px: number }) {
  return (
    <g pointerEvents="none" fontSize={8.5 * px} fill={DIM} fillOpacity={0.85} style={halo(px)} textAnchor="middle">
      {plan.walls.map((w) => {
        const len = wallLen(w);
        if (len / px < 70) return null;
        const t = w.thickness ?? WALL_T;
        const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
        let deg = (ang * 180) / Math.PI;
        if (deg > 90) deg -= 180;
        else if (deg <= -90) deg += 180;
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        const k = t / 2 + 7 * px;
        const mx = (w.a.x + w.b.x) / 2 + nx * k;
        const my = (w.a.y + w.b.y) / 2 + ny * k;
        return (
          <text key={w.id} transform={`translate(${mx} ${my}) rotate(${deg})`} dominantBaseline="middle">
            {`t ${Math.round(t * 100)}`}
          </text>
        );
      })}
    </g>
  );
}

/** Clear interior width and depth of every room, drawn just inside its walls. */
export function RoomDimensions({ plan, px }: { plan: Plan; px: number }) {
  return (
    <>
      {plan.rooms
        .filter((r) => !r.parent && Math.min(r.w, r.h) >= 1)
        .map((r) => (
          <g key={r.id}>
            <DimLine a={{ x: r.x, y: r.y + r.h }} b={{ x: r.x + r.w, y: r.y + r.h }} off={-0.28} label={m2(r.w)} px={px} ext={false} />
            <DimLine a={{ x: r.x, y: r.y }} b={{ x: r.x, y: r.y + r.h }} off={-0.28} label={m2(r.h)} px={px} ext={false} />
          </g>
        ))}
    </>
  );
}

/** Overall width and depth of the building, outside the wall dimensions. */
export function OverallDimensions({ plan, px }: { plan: Plan; px: number }) {
  const b = wallBounds(shellWalls(plan.walls));
  if (!b) return null;
  return (
    <>
      <DimLine a={{ x: b.x0, y: b.y0 }} b={{ x: b.x1, y: b.y0 }} off={-1.5} label={m2(b.x1 - b.x0)} px={px} bold />
      <DimLine a={{ x: b.x0, y: b.y0 }} b={{ x: b.x0, y: b.y1 }} off={1.5} label={m2(b.y1 - b.y0)} px={px} bold />
    </>
  );
}

const letter = (i: number) => String.fromCharCode(65 + (i % 26));

/** Structural grid: dash-dot axes through the walls with lettered (vertical walls) and numbered (horizontal walls) bubbles, like a drawing set. */
export function AxisGrid({ plan, px }: { plan: Plan; px: number }) {
  const shell = shellWalls(plan.walls);
  const b = wallBounds(shell);
  if (!b) return null;
  const { xs, ys } = wallAxes(shell);
  const top = b.y0 - 2.4;
  const left = b.x0 - 2.4;
  const r = 10 * px;
  const dash = `${12 * px} ${3 * px} ${2 * px} ${3 * px}`;
  const bubble = (cx: number, cy: number, text: string, key: string) => (
    <g key={key}>
      <circle cx={cx} cy={cy} r={r} fill={PAPER} stroke={DIM} strokeWidth={px} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={10 * px} fill={LINE} style={MONO}>{text}</text>
    </g>
  );
  return (
    <g pointerEvents="none" stroke={DIM} strokeOpacity={0.32} strokeWidth={px} fill="none">
      {xs.map((x, i) => <line key={`vx${i}`} x1={x} y1={top + r} x2={x} y2={b.y1 + 0.8} strokeDasharray={dash} />)}
      {ys.map((y, i) => <line key={`hy${i}`} x1={left + r} y1={y} x2={b.x1 + 0.8} y2={y} strokeDasharray={dash} />)}
      <g strokeOpacity={1}>
        {xs.map((x, i) => bubble(x, top, letter(i), `bx${i}`))}
        {ys.map((y, i) => bubble(left, y, String(i + 1), `by${i}`))}
      </g>
    </g>
  );
}

/** Door and window tags (D1, W1 ...) in small bubbles beside each opening, matching the schedule in the title block. */
export function OpeningTags({ plan, px }: { plan: Plan; px: number }) {
  const tags = openingTags(plan);
  return (
    <g pointerEvents="none">
      {plan.openings.map((o) => {
        const w = plan.walls.find((x) => x.id === o.wallId);
        const tag = tags[o.id];
        if (!w || !tag) return null;
        const len = wallLen(w);
        const ux = (w.b.x - w.a.x) / len;
        const uy = (w.b.y - w.a.y) / len;
        const out = outsideNormal(plan, w);
        const n = out ?? { x: -uy, y: ux };
        const k = (w.thickness ?? WALL_T) / 2 + 12 * px;
        const cx = w.a.x + ux * o.t * len + n.x * k;
        const cy = w.a.y + uy * o.t * len + n.y * k;
        return (
          <g key={o.id}>
            <circle cx={cx} cy={cy} r={8.5 * px} fill={PAPER} stroke={o.type === "door" ? LINE : DIM} strokeWidth={px} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={8 * px} fill={LINE} style={MONO}>{tag}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Third line of a room label: net floor area. */
export const areaLabel = (plan: Pick<Plan, "rooms">, room: Plan["rooms"][number]) => `${roomArea(plan, room).toFixed(2)} m²`;
