"use client";
import { useMemo } from "react";
import { planOfLevel } from "@/lib/levels";
import { formatArea, formatLength, polygonArea, polygonPerimeter, roomPerimeter, roomSpan } from "@/lib/measure";
import { roomArea } from "@/lib/blueprint";
import { activeLevelId, useStore } from "@/lib/store";
import MeasureBarFit from "./MeasureBarFit";
import MeasureToggles from "./MeasureToggles";
import { useMeasureUi, type MeasureMode } from "./measureUi";
import "./measure.css";

const MODES: { id: MeasureMode; label: string; title: string }[] = [
  { id: "distance", label: "Distance", title: "Measure between two points" },
  { id: "room", label: "Room size", title: "Tap a room to read its area and the way round" },
  { id: "area", label: "Draw an area", title: "Click the corners of any shape to get its area" },
  { id: "fit", label: "Does it fit?", title: "Hold a piece of furniture over the plan and see if it fits" },
];

/** The room readout: area, the way round and the box around it. */
function RoomReadout() {
  const roomId = useMeasureUi((s) => s.roomId);
  const full = useStore((s) => s.plan);
  const level = useStore(activeLevelId);
  const plan = useMemo(() => planOfLevel(full, level), [full, level]);
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return <span className="field-note mz-note">Tap a room on the plan.</span>;
  const span = roomSpan(plan, room);
  return (
    <span className="mz-readout" role="status">
      <b>{room.name}</b>
      <span>{formatArea(roomArea(plan, room))}</span>
      <span>{formatLength(roomPerimeter(plan, room))} around</span>
      <span>{`${span.w.toFixed(2)} × ${span.h.toFixed(2)} m`}</span>
    </span>
  );
}

/** The polygon readout and its buttons. */
function AreaBody() {
  const draft = useMeasureUi((s) => s.draft);
  const kept = useMeasureUi((s) => s.areas.length);
  const set = useMeasureUi((s) => s.set);
  const close = () => window.dispatchEvent(new CustomEvent("housey:finish-draw")); // the same Done as the edit strip: the layer closes the shape
  return (
    <>
      {draft.length >= 3 ? (
        <span className="mz-readout" role="status">
          <span>{formatArea(polygonArea(draft))}</span>
          <span>{formatLength(polygonPerimeter(draft))} around</span>
        </span>
      ) : (
        <span className="field-note mz-note">{draft.length ? `${draft.length} point${draft.length > 1 ? "s" : ""}: click at least 3 corners.` : "Click the corners of the shape."}</span>
      )}
      <button type="button" className="mz-chip" disabled={draft.length < 3} onClick={close}>Done</button>
      <button type="button" className="mz-chip" disabled={!draft.length} onClick={() => set({ draft: draft.slice(0, -1) })}>Undo point</button>
      <button type="button" className="mz-chip" disabled={!draft.length && !kept} onClick={() => set({ draft: [], areas: [] })}>Clear</button>
    </>
  );
}

/** Options of the Measure tool, above the dock while it is active: what to measure, its numbers, and the two always-on labels. */
export default function MeasureBar() {
  const mode = useMeasureUi((s) => s.mode);
  const kept = useMeasureUi((s) => s.measures.length);
  const set = useMeasureUi((s) => s.set);
  return (
    <aside className="mz-bar hud brackets" aria-label="Measure">
      <div className="plan-bar-row mz-row">
        <div className="mz-modes" role="group" aria-label="What to measure">
          {MODES.map((m) => (
            <button key={m.id} type="button" className="mz-chip" aria-pressed={mode === m.id} title={m.title} onClick={() => set({ mode: m.id, first: null, draft: [] })}>
              {m.label}
            </button>
          ))}
        </div>
        {mode === "distance" && (
          <>
            <span className="field-note mz-note">Click two points. Corners and wall ends snap; hold Alt for none.</span>
            <button type="button" className="mz-chip" disabled={!kept} onClick={() => set({ measures: [] })}>{`Clear all${kept ? ` (${kept})` : ""}`}</button>
          </>
        )}
        {mode === "room" && <RoomReadout />}
        {mode === "area" && <AreaBody />}
        {mode === "fit" && <MeasureBarFit />}
        <div className="mz-toggles" role="group" aria-label="Labels on the plan">
          <MeasureToggles where="bar" />
        </div>
      </div>
    </aside>
  );
}
