import { annotationLabel } from "@/lib/annotationTools";
import type { Annotation } from "@/lib/designTypes";
import type { Pt } from "@/lib/types";
import { DimLine } from "./Dimensions";
import { Tag } from "./MeasureMarks";
import { ACCENT, INK } from "./planStyle";

type Scale = { u: number; px: number; dpx: number };

/** An arrowhead at `b` of the line a-b, `size` metres long. */
function head(a: Pt, b: Pt, size: number): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const s = Math.min(size, len * 0.5);
  const left = { x: b.x - ux * s - uy * s * 0.4, y: b.y - uy * s + ux * s * 0.4 };
  const right = { x: b.x - ux * s + uy * s * 0.4, y: b.y - uy * s - ux * s * 0.4 };
  return `${b.x},${b.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

const colourOf = (a: Annotation) => a.color ?? ACCENT;

function Mark({ a, on, u, px, dpx }: { a: Annotation; on: boolean } & Scale) {
  const c = colourOf(a);
  const text = annotationLabel(a);
  switch (a.kind) {
    case "note":
      return (
        <g pointerEvents="none">
          {on && <circle cx={a.x} cy={a.y} r={11 * px} fill="none" stroke={ACCENT} strokeWidth={2 * px} />}
          {a.pin && <circle cx={a.x} cy={a.y} r={8 * px} fill="none" stroke={c} strokeWidth={px} strokeDasharray={`${2 * px} ${2 * px}`} />}
          <circle cx={a.x} cy={a.y} r={4.5 * px} fill={c} stroke={INK} strokeWidth={1.5 * px} />
          <Tag x={a.x + 10 * px} y={a.y + 3.5 * px} text={text} u={u} fill={c} anchor="start" />
        </g>
      );
    case "arrow":
      return (
        <g pointerEvents="none">
          {on && <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} stroke={ACCENT} strokeOpacity={0.5} strokeWidth={7 * px} strokeLinecap="round" />}
          <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} stroke={c} strokeWidth={2.2 * px} strokeLinecap="round" />
          <polygon points={head(a.a, a.b, 14 * px)} fill={c} />
          {text && <Tag x={a.a.x} y={a.a.y - 8 * px} text={text} u={u} fill={c} />}
        </g>
      );
    case "dimension":
      return (
        <g pointerEvents="none">
          {on && <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} stroke={ACCENT} strokeOpacity={0.5} strokeWidth={7 * px} strokeLinecap="round" />}
          <DimLine a={a.a} b={a.b} off={a.off ?? 0} label={text} px={dpx} ext={!!a.off} bold />
          <circle cx={a.a.x} cy={a.a.y} r={3 * px} fill={c} />
          <circle cx={a.b.x} cy={a.b.y} r={3 * px} fill={c} />
        </g>
      );
    case "zone":
      return (
        <g pointerEvents="none">
          <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={c} fillOpacity={on ? 0.2 : 0.12} stroke={on ? ACCENT : c} strokeWidth={(on ? 2.5 : 1.5) * px} strokeDasharray={`${6 * px} ${4 * px}`} />
          {a.pin && <circle cx={a.x + a.w / 2} cy={a.y + a.h / 2} r={5 * px} fill="none" stroke={c} strokeWidth={px} strokeDasharray={`${2 * px} ${2 * px}`} />}
          <Tag x={a.x + 5 * px} y={a.y + 0.2 * u} text={text} u={u} fill={c} anchor="start" />
        </g>
      );
  }
}

/** The notes, arrows, dimension lines and zones of the level on the plan: always drawn (the tool only edits them), the one being edited highlighted. */
export default function AnnotateMarks({ list, selected, u, px, dpx }: { list: readonly Annotation[]; selected: string | null } & Scale) {
  return list.map((a) => <Mark key={a.id} a={a} on={a.id === selected} u={u} px={px} dpx={dpx} />);
}
