import { hallwayOf } from "@/lib/hallway";
import { sortedLevels } from "@/lib/levels";
import type { Plan } from "@/lib/types";
import { PAPER } from "./BlueprintPaper";

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "0.06em" } as const;

/**
 * The shared building corridor outside the flat's front door on the blueprint: a light dashed outline with a small label. Not selectable;
 * it belongs to the building, not to the flat. Only on the lowest level, where the corridor is.
 */
export default function HallwayMark({ plan, level, u, px }: { plan: Plan; level: string; u: number; px: number }) {
  const h = hallwayOf(plan);
  if (!h || sortedLevels(plan)[0].id !== level) return null;
  const pts = h.outline;
  const cx = (pts[0].x + pts[2].x) / 2;
  const cy = (pts[0].y + pts[2].y) / 2;
  const vertical = Math.abs(h.nx) > 0.5; // the corridor runs north-south: read the label bottom to top
  return (
    <g pointerEvents="none" aria-hidden>
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="#cfeaf5" fillOpacity={0.05} stroke="#cfeaf5" strokeOpacity={0.55} strokeWidth={0.02 * u} strokeDasharray={`${0.14 * u} ${0.1 * u}`} />
      <text
        transform={`translate(${cx} ${cy})${vertical ? " rotate(-90)" : ""}`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10.5 * px}
        fill="#cfeaf5"
        fillOpacity={0.8}
        style={{ ...MONO, paintOrder: "stroke", stroke: PAPER, strokeWidth: 5 * px, strokeLinejoin: "round" }}
      >
        Building hallway
      </text>
    </g>
  );
}
