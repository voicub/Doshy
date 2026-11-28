"use client";
import { useEffect, useRef, useState } from "react";
import { addAnnotation, patchAnnotation, removeAnnotation } from "@/lib/annotations";
import { annotationsOnLevel, buildAnnotation, hitAnnotation, movedBy } from "@/lib/annotationTools";
import type { Annotation } from "@/lib/designTypes";
import { dist, formatLength } from "@/lib/measure";
import type { Snapped } from "@/lib/measureSnap";
import { useStore } from "@/lib/store";
import type { Plan, Pt } from "@/lib/types";
import { uid } from "@/lib/uid";
import AnnotateMarks from "./AnnotateMarks";
import { Catcher, SnapMarker, Tag } from "./MeasureMarks";
import { useFinishKeys, useLayerPointer, useSnap } from "./MeasurePointer";
import type { LayerProps } from "./MeasureLayer";
import { useAnnotateUi } from "./annotateUi";
import { ACCENT } from "./planStyle";

const REACH_PX = 10; // a mouse hits a note or a line this many screen pixels away
const REACH_PX_TOUCH = 22;
const NOTE_WORDS = "Note"; // what a new note says until it is edited

/** A move in progress: the annotation as it was, where it was taken hold of, and the plan then (to go back to when a second finger cancels it). */
type Grab = { orig: Annotation; from: Pt; start: Plan };

const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.matches("input,select,textarea");

/** Removes the annotation being edited, as one undo step. */
export function removeSelected() {
  const ui = useAnnotateUi.getState();
  const id = ui.sel;
  if (!id) return;
  useStore.getState().editPlan((p) => removeAnnotation(p, id));
  ui.set({ sel: null });
}

/** Delete or Backspace removes the annotation being edited, unless a text field has the keys. */
function useDeleteKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "Delete" && e.key !== "Backspace") || typing(e) || e.metaKey || e.ctrlKey || !useAnnotateUi.getState().sel) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      removeSelected();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

/** The Notes tool's layer: the plan's annotations, picking one (then dragging it) or placing a new one of the kind chosen in the bar. Leaving the tool or the level drops what was half done. */
export default function AnnotateLayer({ plan, activeLevel, vb, u, px, dpx, touch }: LayerProps) {
  const full = useStore((s) => s.plan);
  const sel = useAnnotateUi((s) => s.sel);
  const first = useAnnotateUi((s) => s.first);
  const zone = useAnnotateUi((s) => s.zone);
  const kind = useAnnotateUi((s) => s.kind);
  const [cur, setCur] = useState<Snapped | null>(null);
  const grab = useRef<Grab | null>(null);
  const snap = useSnap(plan, px, touch);
  const list = annotationsOnLevel(full, activeLevel);
  const reach = (touch > 1 ? REACH_PX_TOUCH : REACH_PX) * px;

  useEffect(() => {
    useAnnotateUi.getState().clear(true);
    return () => useAnnotateUi.getState().clear(true);
  }, [activeLevel]);
  useEffect(() => useAnnotateUi.getState().clear(), [kind]); // another kind drops a half-placed arrow or zone, not the selection
  useDeleteKey();
  useFinishKeys({
    pending: () => {
      const ui = useAnnotateUi.getState();
      return !!ui.first || !!ui.zone || !!ui.sel; // Esc lets go of the selection first, then leaves the tool
    },
    cancel: () => useAnnotateUi.getState().clear(true),
  });

  const place = (a: Annotation | null) => {
    if (!a) return;
    useStore.getState().editPlan((p) => addAnnotation(p, a));
    useAnnotateUi.getState().set({ sel: a.id, first: null, zone: null });
  };
  const draftOf = (a: Pt, b: Pt) => {
    const ui = useAnnotateUi.getState();
    return { kind: ui.kind, a, b, text: ui.kind === "zone" ? ui.zoneText : ui.kind === "note" ? NOTE_WORDS : "", color: ui.color, pin: ui.pin };
  };
  const hitAt = (pt: Pt) => hitAnnotation(annotationsOnLevel(useStore.getState().plan, activeLevel), pt, reach);

  const handlers = useLayerPointer({
    // a finger places a note or a line end where it lifts; picking and dragging something, or a zone, starts as it touches
    defer: (pt) => !!useAnnotateUi.getState().first || (useAnnotateUi.getState().kind !== "zone" && !hitAt(pt)),
    hover: (pt, e) => setCur(snap(pt, e)),
    press: (pt, e) => {
      const ui = useAnnotateUi.getState();
      const s = snap(pt, e);
      setCur(s);
      if (ui.first) return place(buildAnnotation(draftOf(ui.first, s.p), uid(), activeLevel));
      const id = hitAt(pt);
      const store = useStore.getState();
      const hit = id ? annotationsOnLevel(store.plan, activeLevel).find((a) => a.id === id) : undefined;
      if (hit) {
        ui.set({ sel: hit.id });
        grab.current = { orig: hit, from: s.p, start: store.plan };
        store.beginEdit();
        return;
      }
      ui.set({ sel: null });
      if (ui.kind === "arrow" || ui.kind === "dimension") ui.set({ first: s.p });
      else if (ui.kind === "zone") ui.set({ zone: { a: s.p, b: s.p } });
      else place(buildAnnotation(draftOf(s.p, s.p), uid(), activeLevel));
    },
    drag: (pt, e) => {
      const s = snap(pt, e);
      setCur(s);
      const g = grab.current;
      const z = useAnnotateUi.getState().zone;
      if (g) useStore.getState().editPlan((p) => patchAnnotation(p, g.orig.id, movedBy(g.orig, s.p.x - g.from.x, s.p.y - g.from.y)));
      else if (z) useAnnotateUi.getState().set({ zone: { a: z.a, b: s.p } });
    },
    release: () => {
      if (grab.current) {
        grab.current = null;
        useStore.getState().endEdit();
        return;
      }
      const z = useAnnotateUi.getState().zone;
      if (z) place(buildAnnotation(draftOf(z.a, z.b), uid(), activeLevel));
    },
    cancel: () => {
      const g = grab.current;
      grab.current = null;
      if (g) {
        useStore.getState().endEdit();
        if (useStore.getState().plan !== g.start) useStore.getState().undo(); // a second finger arrived mid-move: back to where it was
      }
      useAnnotateUi.getState().set({ zone: null });
    },
    leave: () => setCur(null),
  });

  return (
    <>
      <AnnotateMarks list={list} selected={sel} u={u} px={px} dpx={dpx} />
      <Catcher vb={vb} handlers={handlers} />
      {first && cur && (
        <g pointerEvents="none">
          <line x1={first.x} y1={first.y} x2={cur.p.x} y2={cur.p.y} stroke={ACCENT} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
          <circle cx={first.x} cy={first.y} r={4 * px} fill={ACCENT} />
          {kind === "dimension" && <Tag x={(first.x + cur.p.x) / 2} y={(first.y + cur.p.y) / 2 - 10 * px} text={formatLength(dist(first, cur.p))} u={u} size={0.24} />}
        </g>
      )}
      {zone && (
        <g pointerEvents="none">
          <rect x={Math.min(zone.a.x, zone.b.x)} y={Math.min(zone.a.y, zone.b.y)} width={Math.abs(zone.b.x - zone.a.x)} height={Math.abs(zone.b.y - zone.a.y)} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
          <Tag x={(zone.a.x + zone.b.x) / 2} y={(zone.a.y + zone.b.y) / 2} text={`${Math.abs(zone.b.x - zone.a.x).toFixed(2)} × ${Math.abs(zone.b.y - zone.a.y).toFixed(2)} m`} u={u} size={0.22} />
        </g>
      )}
      {cur && <SnapMarker at={cur.p} kind={cur.kind} u={u} px={px} />}
    </>
  );
}

/** The annotations of the level on the plan: drawn whatever the tool; with the Notes tool on, the interactive layer draws and edits them instead. */
export function PlanAnnotations(p: LayerProps & { tool: string }) {
  const full = useStore((s) => s.plan);
  if (p.tool === "annotate") return <AnnotateLayer {...p} />;
  const list = annotationsOnLevel(full, p.activeLevel);
  return list.length ? <AnnotateMarks list={list} selected={null} u={p.u} px={p.px} dpx={p.dpx} /> : null;
}
