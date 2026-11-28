"use client";
import { useStore } from "@/lib/store";
import { KINDS, UTILITY_KINDS, VALVE_LABEL, VALVE_KINDS, duplicateLine, newLineId, splitSegment, type UtilityKind } from "@/lib/utilities";
import { levelsOf } from "@/lib/levels";
import { deleteUtility, finishUtility, useUtilityUi } from "./UtilityUi";
import "./measure.css";

export default function UtilityBar() {
  const ui = useUtilityUi();
  const plan = useStore((s) => s.plan);
  const line = plan.utilities?.find((l) => l.id === ui.sel);
  const change = (patch: { kind?: UtilityKind; h?: number; width?: number; name?: string; level?: string }) => {
    if (line) useStore.getState().patchUtility(line.id, patch); else ui.set(patch);
  };
  const move = (dx: number, dy: number) => { if (line) useStore.getState().patchUtility(line.id, { pts: line.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) }); };
  return <aside className="mz-bar hud brackets" aria-label="Pipes tool">
    <div className="plan-bar-row mz-row">
      <b>{line ? "Edit pipe" : ui.placing ? "Place valve or meter" : "Draw pipes"}</b>
      <label className="mz-field"><span>Kind</span><select aria-label="Pipe kind" value={line?.kind ?? ui.kind} onChange={(e) => line ? change({ kind: e.target.value as UtilityKind }) : ui.pick(e.target.value as UtilityKind)}>{UTILITY_KINDS.map((kind) => <option key={kind} value={kind}>{KINDS[kind].label}</option>)}</select></label>
      <label className="mz-field"><span>Height (m)</span><input aria-label="Pipe height" type="number" min="0" max="8" step="0.05" value={line?.h ?? ui.h} onChange={(e) => change({ h: Number(e.target.value) })} style={{ width: 75 }} /></label>
      <label className="mz-field"><span>Diameter (m)</span><input aria-label="Pipe diameter" type="number" min="0.01" max="0.2" step="0.001" value={line?.width ?? ui.width} onChange={(e) => change({ width: Number(e.target.value) })} style={{ width: 75 }} /></label>
      {line && <>
        <label className="mz-field"><span>Name</span><input key={line.id} aria-label="Pipe name" defaultValue={line.name ?? ""} maxLength={60} onBlur={(e) => change({ name: e.target.value })} /></label>
        <label className="mz-field"><span>Level</span><select aria-label="Pipe level" value={line.level ?? levelsOf(plan)[0].id} onChange={(e) => change({ level: e.target.value })}>{levelsOf(plan).map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
        <button className="mz-chip" onClick={() => move(-0.1, 0)} aria-label="Move pipe left">←</button><button className="mz-chip" onClick={() => move(0.1, 0)} aria-label="Move pipe right">→</button><button className="mz-chip" onClick={() => move(0, -0.1)} aria-label="Move pipe up">↑</button><button className="mz-chip" onClick={() => move(0, 0.1)} aria-label="Move pipe down">↓</button>
        <button className="mz-chip" onClick={() => useStore.getState().editPlan((p) => splitSegment(p, line.id, ui.vertex ?? 0))}>Add corner</button>
        <button className="mz-chip" onClick={() => useStore.getState().editPlan((p) => duplicateLine(p, line.id, newLineId(p)))}>Duplicate</button>
        <button className="mz-chip mz-danger" onClick={deleteUtility}>Delete pipe</button>
      </>}
      <label className="mz-field"><span>Valve or meter</span><select aria-label="Place valve or meter" value={ui.placing ?? ""} onChange={(e) => ui.set({ placing: e.target.value || null, points: [], sel: null })}><option value="">Choose to place…</option>{Object.keys(VALVE_KINDS).map((kind) => <option key={kind} value={kind}>{VALVE_LABEL[kind]}</option>)}</select></label>
      <button className="mz-chip" disabled={ui.points.length < 2} onClick={() => finishUtility()}>Finish pipe</button>
      <button className="mz-chip" onClick={() => ui.set({ points: [], sel: null, placing: null })}>New pipe</button>
      <span className="field-note mz-note">{ui.placing ? "Tap the line to place, then use Home Assistant view to link." : line ? "Drag a corner or pipe; Alt bypasses snapping." : "Tap points, then Finish pipe or Enter. Esc cancels."}</span>
    </div>
  </aside>;
}
