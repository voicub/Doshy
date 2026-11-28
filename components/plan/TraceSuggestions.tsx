"use client";
import { useMemo } from "react";
import type { Trace } from "@/lib/designTypes";
import { toPlanSeg, type PlanSeg } from "@/lib/traceSuggest";
import { PAPER } from "./BlueprintPaper";
import { hitOf } from "./hit";
import { ACCENT, MONO } from "./planStyle";
import { acceptSuggestions } from "./traceAccept";
import { useTraceUi } from "./traceUi";

const halo = (px: number) => ({ ...MONO, paintOrder: "stroke", stroke: PAPER, strokeWidth: 3 * px, strokeLinejoin: "round" }) as const;

/** The Add / Discard buttons of the picked suggestion, touch-sized on touch screens. */
function Choice({ seg, id, px, touch }: { seg: PlanSeg; id: number; px: number; touch: number }) {
  const [w, h, gap] = [78 * px, (touch > 1 ? 44 : 26) * px, 6 * px];
  const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
  const top = mid.y - h - 14 * px; // above the wall, out of the way of the finger that tapped it
  const button = (i: number, text: string, run: () => void) => {
    const x = mid.x - w - gap / 2 + i * (w + gap);
    return (
      <g key={text} style={{ cursor: "pointer" }} role="button" aria-label={text} onPointerDown={(e) => e.stopPropagation()} onClick={run}>
        <rect x={x} y={top} width={w} height={h} fill={PAPER} stroke={ACCENT} strokeWidth={1.5 * px} />
        <text x={x + w / 2} y={top + h / 2} fontSize={(touch > 1 ? 13 : 11) * px} textAnchor="middle" dominantBaseline="central" fill="var(--text)" pointerEvents="none" style={MONO}>{text}</text>
      </g>
    );
  };
  return (
    <g>
      {button(0, "ADD WALL", () => acceptSuggestions([id]))}
      {button(1, "DISCARD", () => useTraceUi.getState().drop([id]))}
    </g>
  );
}

/**
 * The walls "Look for walls" found, as a dashed cyan preview over the picture. Nothing is added until it is accepted: tap one to get Add wall / Discard,
 * the panel has Accept all and Clear. In the Select tool only: with a drawing tool the suggestions are just a guide the new walls snap to.
 */
export default function TraceSuggestions({ t, tool, px, touch }: { t: Trace; tool: string; px: number; touch: number }) {
  const list = useTraceUi((s) => s.suggestions);
  const picked = useTraceUi((s) => s.picked);
  const segs = useMemo(() => list.flatMap((s) => { const p = toPlanSeg(s, t); return p ? [{ id: s.id, seg: p }] : []; }), [list, t]);
  if (!segs.length) return null;
  const pick = segs.find((s) => s.id === picked);
  const first = segs[0].seg; // the longest
  const tap = tool === "select";
  return (
    <g>
      {segs.map(({ id, seg }) => (
        <g key={id}>
          <line x1={seg.a.x} y1={seg.a.y} x2={seg.b.x} y2={seg.b.y} stroke={ACCENT} strokeOpacity={id === picked ? 1 : 0.8} strokeWidth={(id === picked ? 3.5 : 2) * px} strokeDasharray={`${7 * px} ${5 * px}`} pointerEvents="none" />
          <line x1={seg.a.x} y1={seg.a.y} x2={seg.b.x} y2={seg.b.y} stroke="transparent" strokeWidth={hitOf(14 * px, px, touch)} strokeLinecap="round" pointerEvents={tap ? "stroke" : "none"} style={{ cursor: "pointer" }} onPointerDown={(e) => e.stopPropagation()} onClick={() => useTraceUi.getState().pick(id === picked ? null : id)}>
            <title>Suggested wall: tap to add or discard it</title>
          </line>
        </g>
      ))}
      {pick ? (
        <Choice seg={pick.seg} id={pick.id} px={px} touch={touch} />
      ) : (
        <text x={(first.a.x + first.b.x) / 2} y={(first.a.y + first.b.y) / 2 - 10 * px} fontSize={11 * px} textAnchor="middle" fill={ACCENT} pointerEvents="none" style={halo(px)}>SUGGESTIONS: CHECK THEM</text>
      )}
    </g>
  );
}
