"use client";
import { useEffect, useRef, useState } from "react";
import { BATTERY_DEFAULT, BATTERY_RANGE, ignoreAuto, markDone, removeTask, restoreAuto, setBatteryBelow, snoozeAuto, snoozeTask, type MaintenanceTask } from "@/lib/maintenance";
import { SECTIONS, type BoardItem, type Section } from "@/lib/maintenanceBoard";
import { dayOf } from "@/lib/maintenanceDates";
import { everyWords } from "@/lib/maintenanceTemplates";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { roomIdAt } from "@/lib/rooms";
import { useStore } from "@/lib/store";
import type { Plan } from "@/lib/types";
import HudPanel from "./HudPanel";
import MaintenanceEditor from "./MaintenanceEditor";
import MaintenanceIcon from "./MaintenanceIcon";
import { useMaintenanceUi } from "./maintenanceUi";
import "./maintenance.css";

const TITLES: Record<Section, string> = { now: "Due now", soon: "Soon · next 14 days", later: "Later", healthy: "Healthy" };

function showOnModel(item: BoardItem) {
  const s = useStore.getState();
  const linked = s.plan.items.find((i) => i.id === item.itemId);
  const roomId = item.roomId ?? (linked ? roomIdAt(s.plan, linked.x, linked.y, elevationOf(s.plan, levelIdOf(s.plan, linked))) : null);
  const room = s.plan.rooms.find((r) => r.id === roomId);
  if (linked || room) s.setActiveLevel(levelIdOf(s.plan, linked ?? room!));
  s.setView("live");
  s.setFocusRoom(roomId ?? null);
  if (linked) s.select({ type: "item", id: linked.id });
}

export default function MaintenancePanel({ onClose }: { onClose: () => void }) {
  const board = useMaintenanceUi((s) => s.board);
  const target = useMaintenanceUi((s) => s.taskId);
  const plan = useStore((s) => s.plan);
  const [room, setRoom] = useState("");
  const [editor, setEditor] = useState<MaintenanceTask | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const undoable = useStore((s) => s.past.length > 0);
  const redoable = useStore((s) => s.future.length > 0);
  useEffect(() => {
    if (!target || focused.current) return;
    setRoom("");
    const card = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-maintenance-id]") ?? []).find((el) => el.dataset.maintenanceId === target);
    card?.scrollIntoView({ block: "nearest" });
    card?.focus({ preventScroll: true });
    if (card) focused.current = true;
  }, [target, board]);
  const change = (edit: (p: Plan) => Plan, message: string) => { useStore.getState().editPlan(edit); setNotice(message); };
  const today = dayOf(Date.now());
  const snooze = (item: BoardItem, days: number) => change((p) => item.source === "user" ? snoozeTask(p, item.id, today, days) : snoozeAuto(p, item.id, today, days), `Snoozed for ${days === 1 ? "one day" : "one week"}.`);
  const visible = board.items.filter((item) => !room || (room === "none" ? !item.roomId : item.roomId === room));
  return (
    <HudPanel title="Maintenance" meta={`${board.counts.now} due`} onClose={onClose} className="mt drawer">
      <div ref={root} className="mt-body">
        <div className="mt-actions"><button className="btn" type="button" onClick={() => setEditor("new")}>Add task</button><button className="btn" type="button" disabled={!undoable} onClick={() => { useStore.getState().undo(); setNotice("Undone."); }}>Undo</button><button className="btn" type="button" disabled={!redoable} onClick={() => { useStore.getState().redo(); setNotice("Redone."); }}>Redo</button></div>
        <p className="field-note">Your upkeep and read-only checks from Home Assistant. Changes are saved with this plan and can be undone.</p>
        {notice && <p role="status" className="field-note">{notice}</p>}
        {editor ? <MaintenanceEditor key={typeof editor === "string" ? "new" : editor.id} task={typeof editor === "string" ? undefined : editor} onSaved={() => { setEditor(null); setNotice("Task saved."); }} onCancel={() => setEditor(null)} /> : <>
          <label className="mt-field">Room<select value={room} onChange={(e) => setRoom(e.target.value)}><option value="">All rooms</option><option value="none">No room / whole home</option>{plan.rooms.filter((r) => !r.parent).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <details className="mt-settings" id="maintenance-settings"><summary>Automatic checks & battery threshold</summary><label>Low battery at or below<select value={plan.maintenance?.batteryBelow ?? BATTERY_DEFAULT} onChange={(e) => change((p) => setBatteryBelow(p, Number(e.target.value)), "Battery threshold saved.")}>{Array.from({ length: BATTERY_RANGE.max - BATTERY_RANGE.min + 1 }, (_, i) => i + BATTERY_RANGE.min).map((n) => <option key={n} value={n}>{n}%</option>)}</select></label><p className="field-note">Automatic names, readings and schedules come from Home Assistant. Done acknowledges a check for one day; it returns if the reading still needs attention. Hide removes a check until you restore it below. No device is changed.</p></details>
          {SECTIONS.map((section) => { const items = visible.filter((i) => i.section === section); return <section key={section} className="mt-section" aria-labelledby={`mt-${section}`}><h2 id={`mt-${section}`}>{TITLES[section]} <span>{items.length}</span></h2>{!items.length && <p className="field-note">{room ? "Nothing here for this room." : section === "now" ? "Nothing needs attention right now." : "Nothing here yet."}</p>}<ul className="mt-list">{items.map((item) => <li key={item.id} tabIndex={-1} data-maintenance-id={item.id} className={`mt-card ${target === item.id ? "mt-selected" : ""}`}>
            <div className="mt-head"><MaintenanceIcon kind={item.icon} /><div><strong>{item.name}</strong><small>{item.roomName ?? "Whole home"} · {item.source === "user" ? "Yours" : "Automatic"}</small></div></div>
            <p className={section === "now" ? "mt-due" : ""}>{item.text}</p>
            {item.task && <small>{everyWords(item.task.every, item.task.unit)} · Last done: {item.task.last ?? "not yet"}{item.task.snooze ? ` · Snoozed until ${item.task.snooze}` : ""}</small>}
            {item.task?.notes && <p className="mt-notes">{item.task.notes}</p>}
            <div className="mt-actions">
              <button type="button" className="btn" onClick={() => change((p) => item.source === "user" ? markDone(p, item.id, today) : snoozeAuto(p, item.id, today, 1), item.source === "user" ? "Done. Next date scheduled; completion saved in history." : "Check acknowledged for today. Home Assistant was not changed.")}>Done</button>
              <button type="button" className="btn" onClick={() => snooze(item, 1)}>Snooze 1 day</button><button type="button" className="btn" onClick={() => snooze(item, 7)}>Snooze 1 week</button>
              <button type="button" className="btn" onClick={() => { if (item.task) { setEditor(item.task); return; } const settings = root.current?.querySelector<HTMLDetailsElement>("#maintenance-settings"); if (settings) { settings.open = true; settings.scrollIntoView({ block: "nearest" }); settings.querySelector("select")?.focus(); } }}>Edit</button>
              <button type="button" className="btn" onClick={() => change((p) => item.source === "user" ? removeTask(p, item.id) : ignoreAuto(p, item.id), item.source === "user" ? "Task deleted. Use Undo to restore it." : "Automatic check hidden. You can restore it below.")}>{item.source === "user" ? "Delete" : "Hide"}</button>
              {(item.itemId || item.roomId) && <button type="button" className="btn" onClick={() => { showOnModel(item); onClose(); }}>Show on the model</button>}
            </div>
            {item.task && <details><summary>Completion history ({item.task.history?.length ?? 0}/20)</summary>{item.task.history?.length ? <ul>{[...item.task.history].reverse().map((day, index) => <li key={`${day}:${index}`}><time dateTime={day}>{day}</time></li>)}</ul> : <p className="field-note">No completions recorded yet.</p>}</details>}
          </li>)}</ul></section>; })}
          {board.hidden.length > 0 && <details><summary>Hidden or snoozed automatic checks ({board.hidden.length})</summary><ul className="mt-list">{board.hidden.map(({ item, until }) => <li key={item.id} className="mt-card"><strong>{item.name}</strong><small>{until ? `Snoozed until ${until}` : "Hidden"} · {item.text}</small><button type="button" className="btn" onClick={() => change((p) => restoreAuto(p, item.id), "Automatic check restored.")}>Restore check</button></li>)}</ul></details>}
        </>}
      </div>
    </HudPanel>
  );
}
