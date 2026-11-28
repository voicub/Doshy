"use client";
import { useEffect, useState } from "react";
import { addAnnotation } from "@/lib/annotations";
import { dimensionOf } from "@/lib/annotationTools";
import { roomAt } from "@/lib/geometry";
import { dist, formatArea, formatLength, hostOf, keepNewest, polygonArea, polygonPerimeter, roomParts, spread } from "@/lib/measure";
import type { Snapped } from "@/lib/measureSnap";
import type { Frame } from "@/lib/planView";
import { useStore } from "@/lib/store";
import type { Plan, Pt } from "@/lib/types";
import { uid } from "@/lib/uid";
import { DimLine } from "./Dimensions";
import { useFinishKeys, useLayerPointer, useSnap } from "./MeasurePointer";
import { Catcher, ChipButton, SnapMarker, Tag, pointsOf } from "./MeasureMarks";
import MeasureFit from "./MeasureFit";
import { useFitUi } from "./fitUi";
import { useMeasureUi, type Area } from "./measureUi";
import { ACCENT } from "./planStyle";

/** What every plan tool layer is given: the active level's plan, the visible rectangle and the plan editor's scales. */
export type LayerProps = { plan: Plan; activeLevel: string; vb: Frame; u: number; px: number; dpx: number; touch: number };

const CLOSE_PX = 14; // the first point of a polygon closes it this close

/** The Measure tool's layer: the kept distances and areas, and the layer of the chosen mode. Leaving the tool or the level forgets what was half done. */
export default function MeasureLayer(p: LayerProps) {
  const mode = useMeasureUi((s) => s.mode);
  useEffect(() => {
    const clear = () => {
      useMeasureUi.getState().clear();
      useFitUi.getState().clear();
    };
    clear();
    return clear;
  }, [p.activeLevel, mode]);
  useFinishKeys({
    pending: () => {
      const m = useMeasureUi.getState();
      return !!m.first || m.draft.length > 0 || useFitUi.getState().held;
    },
    cancel: () => {
      useMeasureUi.getState().clear();
      useFitUi.getState().clear();
    },
    finish: () => {
      const m = useMeasureUi.getState();
      if (m.mode !== "area" || m.draft.length < 3) return false;
      closeArea(p.activeLevel);
      return true;
    },
  });
  return (
    <>
      <Kept {...p} />
      {mode === "distance" && <Distance {...p} />}
      {mode === "room" && <RoomPick {...p} />}
      {mode === "area" && <AreaDraw {...p} />}
      {mode === "fit" && <MeasureFit {...p} />}
    </>
  );
}

/** The distances and areas kept this session, on this level: removable, and a distance can be kept in the plan. */
function Kept({ activeLevel, u, px, dpx, touch }: LayerProps) {
  const measures = useMeasureUi((s) => s.measures);
  const areas = useMeasureUi((s) => s.areas);
  const set = useMeasureUi((s) => s.set);
  const keep = (id: string) => {
    const m = measures.find((x) => x.id === id);
    if (!m) return;
    const dim = dimensionOf(m.a, m.b, uid(), m.level);
    if (dim) useStore.getState().editPlan((plan) => addAnnotation(plan, dim));
    set({ measures: measures.filter((x) => x.id !== id) });
  };
  return (
    <>
      {measures.filter((m) => m.level === activeLevel).map((m) => {
        const mid = { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 };
        const { dx, dy } = spread(m.a, m.b);
        const len = dist(m.a, m.b);
        const n = { x: -(m.b.y - m.a.y) / len, y: (m.b.x - m.a.x) / len };
        const side = n.y > 0 || (n.y === 0 && n.x > 0) ? 1 : -1; // the controls sit on the side the label is not
        const at = { x: mid.x + n.x * side * 24 * dpx, y: mid.y + n.y * side * 24 * dpx };
        return (
          <g key={m.id}>
            <DimLine a={m.a} b={m.b} off={0} label={formatLength(len)} px={dpx} ext={false} bold />
            <g pointerEvents="none" fill={ACCENT}>
              <circle cx={m.a.x} cy={m.a.y} r={3 * px} />
              <circle cx={m.b.x} cy={m.b.y} r={3 * px} />
            </g>
            {len / dpx >= 34 && <Tag x={mid.x} y={mid.y - side * 20 * dpx} text={`dx ${dx.toFixed(2)}  dy ${dy.toFixed(2)}`} u={u} size={0.16} fill={ACCENT} />}
            <ChipButton x={at.x - 56 * px} y={at.y} width={104} label="Keep in plan" title="Keep this distance in the plan" onPress={() => keep(m.id)} px={px} touch={touch} />
            <ChipButton x={at.x + 22 * px} y={at.y} width={26} label="x" title="Remove this measure" onPress={() => set({ measures: measures.filter((x) => x.id !== m.id) })} px={px} touch={touch} />
          </g>
        );
      })}
      {areas.filter((a) => a.level === activeLevel).map((a) => (
        <KeptArea key={a.id} a={a} u={u} px={px} touch={touch} onRemove={() => set({ areas: areas.filter((x) => x.id !== a.id) })} />
      ))}
    </>
  );
}

const centroid = (pts: readonly Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const areaText = (pts: readonly Pt[]) => `${formatArea(polygonArea(pts))}  ${polygonPerimeter(pts).toFixed(2)} m around`;

function KeptArea({ a, u, px, touch, onRemove }: { a: Area; u: number; px: number; touch: number; onRemove: () => void }) {
  const c = centroid(a.pts);
  return (
    <g>
      <polygon points={pointsOf(a.pts)} fill={ACCENT} fillOpacity={0.1} stroke={ACCENT} strokeWidth={1.5 * px} strokeLinejoin="round" pointerEvents="none" />
      <Tag x={c.x} y={c.y - 4 * px} text={areaText(a.pts)} u={u} fill={ACCENT} />
      <ChipButton x={c.x} y={c.y + 18 * px} width={26} label="x" title="Remove this area" onPress={onRemove} px={px} touch={touch} />
    </g>
  );
}

/** Two clicks make a distance: a live line with the length and its two legs while the second point is chosen. */
function Distance(p: LayerProps) {
  const { plan, activeLevel, vb, u, px, touch } = p;
  const first = useMeasureUi((s) => s.first);
  const [cur, setCur] = useState<Snapped | null>(null);
  const snap = useSnap(plan, px, touch);
  const handlers = useLayerPointer({
    defer: true,
    hover: (pt, e) => setCur(snap(pt, e)),
    press: (pt, e) => {
      const s = snap(pt, e);
      setCur(s);
      const ui = useMeasureUi.getState();
      if (!ui.first) return ui.set({ first: s.p });
      if (dist(ui.first, s.p) < 0.005) return; // the same point twice measures nothing
      ui.set({ first: null, measures: keepNewest(ui.measures, { id: uid(), a: ui.first, b: s.p, level: activeLevel }) });
    },
    cancel: () => useMeasureUi.getState().set({ first: null }),
    leave: () => setCur(null),
  });
  const { dx, dy } = first && cur ? spread(first, cur.p) : { dx: 0, dy: 0 };
  return (
    <>
      {first && cur && (
        <g pointerEvents="none">
          <line x1={first.x} y1={first.y} x2={cur.p.x} y2={cur.p.y} stroke={ACCENT} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
          <circle cx={first.x} cy={first.y} r={4 * px} fill={ACCENT} />
          <Tag x={(first.x + cur.p.x) / 2} y={(first.y + cur.p.y) / 2 - 10 * px} text={formatLength(dist(first, cur.p))} u={u} fill="var(--text)" size={0.26} />
          <Tag x={(first.x + cur.p.x) / 2} y={(first.y + cur.p.y) / 2 + 10 * px + 0.16 * u} text={`dx ${dx.toFixed(2)}  dy ${dy.toFixed(2)}`} u={u} fill={ACCENT} size={0.18} />
        </g>
      )}
      <Catcher vb={vb} handlers={handlers} />
      {cur && <SnapMarker at={cur.p} kind={cur.kind} u={u} px={px} />}
    </>
  );
}

/** Tap a room to read its numbers (shown in the bar); its outline lights up, extensions included. */
function RoomPick({ plan, vb, px }: LayerProps) {
  const roomId = useMeasureUi((s) => s.roomId);
  const room = plan.rooms.find((r) => r.id === roomId);
  const handlers = useLayerPointer({
    defer: true,
    press: (pt) => {
      const hit = roomAt(plan, pt.x, pt.y);
      useMeasureUi.getState().set({ roomId: hit ? hostOf(plan, hit).id : null });
    },
  });
  return (
    <>
      {room && (
        <g pointerEvents="none" fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={2 * px}>
          {roomParts(plan, room).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />)}
        </g>
      )}
      <Catcher vb={vb} handlers={handlers} />
    </>
  );
}

/** Closes the polygon being drawn (3 points at least) into a kept area. */
function closeArea(level: string) {
  const ui = useMeasureUi.getState();
  if (ui.draft.length < 3) return;
  ui.set({ draft: [], areas: keepNewest(ui.areas, { id: uid(), level, pts: ui.draft }) });
}

/** Click the corners of any shape; click the first corner, double-click, Enter or Done closes it. Area and the way round show live. */
function AreaDraw(p: LayerProps) {
  const { plan, activeLevel, vb, u, px, touch } = p;
  const draft = useMeasureUi((s) => s.draft);
  const [cur, setCur] = useState<Snapped | null>(null);
  const snap = useSnap(plan, px, touch);
  const handlers = useLayerPointer({
    defer: true,
    hover: (pt, e) => setCur(snap(pt, e)),
    press: (pt, e) => {
      const s = snap(pt, e);
      const ui = useMeasureUi.getState();
      const last = ui.draft[ui.draft.length - 1];
      if (ui.draft.length >= 3 && dist(s.p, ui.draft[0]) <= CLOSE_PX * px) return closeArea(activeLevel);
      if (last && dist(last, s.p) < 0.01) return; // the second click of a double click
      ui.set({ draft: [...ui.draft, s.p] });
    },
    cancel: () => useMeasureUi.getState().set({ draft: [] }),
    leave: () => setCur(null),
  });
  const shape = cur ? [...draft, cur.p] : draft;
  return (
    <>
      {draft.length > 0 && (
        <g pointerEvents="none">
          <polygon points={pointsOf(shape)} fill={ACCENT} fillOpacity={0.1} stroke={ACCENT} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} strokeLinejoin="round" />
          {draft.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={(i === 0 && draft.length >= 3 ? 6 : 3.5) * px} fill={ACCENT} />)}
          {shape.length >= 3 && <Tag x={centroid(shape).x} y={centroid(shape).y} text={areaText(shape)} u={u} size={0.24} />}
        </g>
      )}
      <Catcher vb={vb} handlers={handlers} onDoubleClick={() => closeArea(activeLevel)} />
      {cur && <SnapMarker at={cur.p} kind={cur.kind} u={u} px={px} />}
    </>
  );
}
