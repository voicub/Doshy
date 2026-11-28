"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Plan, Pt } from "@/lib/types";
import { KINDS, MAX_POINTS, type UtilityLine } from "@/lib/utilities";
import { hitUtilityLine, snapUtilityPoint, utilityLinesOn } from "@/lib/utilitiesEditor";
import type { LayerProps } from "./MeasureLayer";
import { Catcher } from "./MeasureMarks";
import { useFinishKeys, useLayerPointer } from "./MeasurePointer";
import { planGrid } from "./planPoint";
import { deleteUtility, finishUtility, useUtilityUi } from "./UtilityUi";

type Grab = { line: UtilityLine; from: Pt; vertex: number | null; start: Plan };

function DrawPipes({ lines, px, selected, pick }: { lines: UtilityLine[]; px: number; selected: string | null; pick?: (id: string) => void }) {
  return <g aria-label="Utility pipes">{lines.map((line) => <polyline key={line.id} data-utility={line.id} points={line.pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={KINDS[line.kind].color} strokeWidth={Math.max(line.width ?? KINDS[line.kind].width, (selected === line.id ? 5 : 3) * px)} strokeLinecap="round" strokeLinejoin="round" pointerEvents={pick ? "stroke" : "none"} onPointerDown={pick ? (e) => { e.stopPropagation(); pick(line.id); } : undefined}><title>{line.name ?? KINDS[line.kind].label}</title></polyline>)}</g>;
}

export function PlanUtilities(p: LayerProps & { tool: string }) {
  const plan = useStore((s) => s.plan);
  if (p.tool === "pipes") return <UtilityLayer {...p} />;
  return <DrawPipes lines={utilityLinesOn(plan, p.activeLevel)} px={p.px} selected={null} pick={p.tool === "select" ? (id) => { useUtilityUi.getState().set({ sel: id, points: [] }); useStore.getState().setTool("pipes"); } : undefined} />;
}

export default function UtilityLayer({ activeLevel, vb, px, touch }: LayerProps) {
  const plan = useStore((s) => s.plan);
  const ui = useUtilityUi();
  const [cursor, setCursor] = useState<Pt | null>(null);
  const grab = useRef<Grab | null>(null);
  const lines = utilityLinesOn(plan, activeLevel);
  const reach = Math.max(0.06, (touch > 1 ? 22 : 10) * px);
  const snap = (p: Pt, e: { altKey: boolean; shiftKey: boolean }) => snapUtilityPoint(useStore.getState().plan, activeLevel, p, reach, planGrid(e), e.altKey, grab.current?.line.id);
  useEffect(() => {
    useUtilityUi.getState().set({ points: [], vertex: null });
    return () => useUtilityUi.getState().set({ points: [], vertex: null, placing: null });
  }, [activeLevel]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key !== "Delete" && e.key !== "Backspace") || e.target instanceof Element && e.target.matches("input,textarea,select")) return;
      if (!useUtilityUi.getState().sel) return;
      e.preventDefault(); e.stopImmediatePropagation(); deleteUtility();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  useFinishKeys({ pending: () => !!useUtilityUi.getState().points.length || !!useUtilityUi.getState().sel, cancel: () => ui.set({ points: [], sel: null, vertex: null, placing: null }), finish: finishUtility });
  const handlers = useLayerPointer({
    defer: (p) => !!useUtilityUi.getState().points.length || !hitUtilityLine(utilityLinesOn(useStore.getState().plan, activeLevel), p, reach),
    hover: (p, e) => setCursor(snap(p, e)),
    press: (p, e) => {
      const state = useUtilityUi.getState(), store = useStore.getState(), q = snap(p, e);
      if (state.placing) { store.addItem(state.placing, q.x, q.y); state.set({ placing: null }); return; }
      if (!state.points.length) {
        const hit = hitUtilityLine(utilityLinesOn(store.plan, activeLevel), p, reach);
        if (hit) {
          const vertex = hit.pts.findIndex((v) => Math.hypot(v.x - p.x, v.y - p.y) <= reach);
          state.set({ sel: hit.id, vertex: vertex < 0 ? null : vertex });
          grab.current = { line: hit, from: q, vertex: vertex < 0 ? null : vertex, start: store.plan };
          store.beginEdit(); return;
        }
      }
      if (state.points.length < MAX_POINTS) state.set({ sel: null, points: [...state.points, q] });
      if (e.detail > 1 && useUtilityUi.getState().points.length >= 2) finishUtility();
    },
    drag: (p, e) => {
      const g = grab.current; if (!g) return;
      const q = snap(p, e), dx = q.x - g.from.x, dy = q.y - g.from.y;
      useStore.getState().patchUtility(g.line.id, { pts: g.line.pts.map((v, i) => g.vertex === null ? { x: v.x + dx, y: v.y + dy } : i === g.vertex ? q : v) });
    },
    release: () => { if (grab.current) { grab.current = null; useStore.getState().endEdit(); } },
    cancel: () => { const g = grab.current; grab.current = null; if (g) { const s = useStore.getState(); s.endEdit(); if (s.plan !== g.start) s.undo(); } },
    leave: () => setCursor(null),
  });
  const selected = lines.find((l) => l.id === ui.sel);
  const draft = [...ui.points, ...(cursor && ui.points.length ? [cursor] : [])];
  return <>
    <DrawPipes lines={lines} px={px} selected={ui.sel} />
    <Catcher vb={vb} handlers={handlers} />
    <g pointerEvents="none">
      {selected?.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={(ui.vertex === i ? 6 : 4) * px} fill={KINDS[selected.kind].color} stroke="white" strokeWidth={px} />)}
      {draft.length > 0 && <polyline points={draft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={KINDS[ui.kind].color} strokeWidth={3 * px} strokeDasharray={`${6 * px} ${3 * px}`} />}
      {cursor && <circle cx={cursor.x} cy={cursor.y} r={5 * px} fill={KINDS[ui.kind].color} />}
    </g>
  </>;
}
