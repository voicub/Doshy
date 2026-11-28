"use client";
import { useState, type FormEvent } from "react";
import { CATALOG } from "@/lib/catalog";
import { addTask, MAX_TASKS, patchTask, TASK_ICONS, taskOf, UNITS, type MaintenanceTask } from "@/lib/maintenance";
import { dayOf } from "@/lib/maintenanceDates";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { roomIdAt } from "@/lib/rooms";
import { TEMPLATES, taskFromTemplate } from "@/lib/maintenanceTemplates";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/uid";
import MaintenanceIcon from "./MaintenanceIcon";

export default function MaintenanceEditor({ task, onSaved, onCancel }: { task?: MaintenanceTask; onSaved: () => void; onCancel: () => void }) {
  const plan = useStore((s) => s.plan);
  const [draft, setDraft] = useState<MaintenanceTask>(() => task ?? { id: uid(), name: "", every: 1, unit: "month", due: dayOf(Date.now()), icon: "wrench" });
  const [error, setError] = useState<string | null>(null);
  const save = (event: FormEvent) => {
    event.preventDefault();
    const valid = taskOf(draft);
    if (!valid) { setError("Enter a task name, a real date and an interval between one day and ten years."); return; }
    if (!task && (useStore.getState().plan.maintenance?.tasks?.length ?? 0) >= MAX_TASKS) { setError(`This plan already has ${MAX_TASKS} tasks. Remove one before adding another.`); return; }
    useStore.getState().editPlan((p) => task ? patchTask(p, task.id, { ...valid, room: valid.room, item: valid.item, notes: valid.notes, last: valid.last, snooze: valid.snooze }) : addTask(p, valid));
    onSaved();
  };
  return (
    <form className="mt-editor" onSubmit={save}>
      <h2>{task ? "Edit task" : "Add a task"}</h2>
      {!task && <details open><summary>Start with a template</summary><div className="mt-templates">{TEMPLATES.map((t) => <button key={t.id} type="button" onClick={() => setDraft({ ...taskFromTemplate(t, draft.id, dayOf(Date.now())), room: draft.room, item: draft.item })}><MaintenanceIcon kind={t.icon} /><span>{t.name}<small>{t.blurb}</small></span></button>)}</div></details>}
      <label>Task name<input autoFocus required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <div className="mt-fields">
        <label>Repeat every<input type="number" required min={1} step={1} value={draft.every} onChange={(e) => setDraft({ ...draft, every: e.target.valueAsNumber })} /></label>
        <label>Interval<select value={draft.unit} onChange={(e) => { const unit = UNITS.find((u) => u === e.target.value); if (unit) setDraft({ ...draft, unit }); }}>{UNITS.map((u) => <option key={u} value={u}>{u}s</option>)}</select></label>
      </div>
      <label>Next due<input type="date" required min="2000-01-01" max="2100-12-31" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value, snooze: undefined })} /></label>
      <label>Last done<input type="date" min="2000-01-01" max={dayOf(Date.now())} value={draft.last ?? ""} onChange={(e) => setDraft({ ...draft, last: e.target.value || undefined })} /></label>
      <label>Room<select value={draft.room ?? ""} onChange={(e) => setDraft({ ...draft, room: e.target.value || undefined })}><option value="">Whole home / no room</option>{plan.rooms.filter((r) => !r.parent).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Item on the model<select value={draft.item ?? ""} onChange={(e) => { const item = plan.items.find((i) => i.id === e.target.value); setDraft({ ...draft, item: item?.id, room: draft.room ?? (item ? roomIdAt(plan, item.x, item.y, elevationOf(plan, levelIdOf(plan, item))) : undefined) }); }}><option value="">No item</option>{plan.items.map((i) => <option key={i.id} value={i.id}>{CATALOG[i.kind]?.label ?? i.kind} ({i.id})</option>)}</select></label>
      <label>Icon<select value={draft.icon ?? "wrench"} onChange={(e) => { const icon = TASK_ICONS.find((i) => i === e.target.value); if (icon) setDraft({ ...draft, icon }); }}>{TASK_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</select></label>
      <label>Notes<textarea maxLength={400} rows={3} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="mt-actions"><button type="submit" className="btn">{task ? "Save changes" : "Add task"}</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
