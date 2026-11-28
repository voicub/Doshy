"use client";
import { useState } from "react";
import type { ArrivalStep, Choreography } from "@/lib/arrival";
import { MAX_ARRIVAL_STEPS } from "@/lib/arrival";
import { entranceChoices, orderArrivalSteps } from "@/lib/arrivalOrder";
import type { HAState } from "@/lib/ha";
import type { SceneDevice } from "@/lib/sceneDevices";
import type { Plan } from "@/lib/types";

export type ArrivalOption = { entity: string; name: string; room?: string };
export function ArrivalSelect({ label, value, options, onChange, optional = false }: { label: string; value: string; options: ArrivalOption[]; onChange: (value: string) => void; optional?: boolean }) {
  return <label className="am-field"><span className="label">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{(optional || !options.some((o) => o.entity === value)) && <option value="">{optional ? "None" : "Choose..."}</option>}{options.map((o) => <option key={o.entity} value={o.entity}>{o.name}{o.room ? ` (${o.room})` : ""}</option>)}</select></label>;
}
export function ArrivalToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="ar-toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}
export function ArrivalNumber({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="am-field"><span className="label">{label}</span><input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

export function WelcomeFields({ draft, plan, states, devices, onChange }: { draft: Choreography; plan: Plan; states: Record<string, HAState>; devices: SceneDevice[]; onChange: (draft: Choreography) => void }) {
  const [add, setAdd] = useState("");
  const [finish, setFinish] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const entrances = entranceChoices(plan);
  const selected = entrances.find((e) => JSON.stringify(e.entrance) === JSON.stringify(draft.entrance));
  const lights = devices.filter((d) => d.kind === "light" && d.entity.startsWith("light.") && states[d.entity]);
  const available = lights.filter((d) => !draft.steps.some((s) => s.entity === d.entity));
  const label = (s: ArrivalStep) => { const d = devices.find((d) => d.entity === s.entity); return d ? `${d.name} (${d.room})` : s.entity; };
  const step = (i: number, patch: Partial<ArrivalStep>) => onChange({ ...draft, steps: draft.steps.map((s, n) => n === i ? { ...s, ...patch } : s) });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.steps.length || from === to) return;
    const rest = draft.steps.filter((_, i) => i !== from);
    onChange({ ...draft, steps: [...rest.slice(0, to), draft.steps[from], ...rest.slice(to)] });
  };
  return <>
    <ArrivalSelect label="Where do you come in?" value={selected?.key ?? ""} options={entrances.map((e) => ({ entity: e.key, name: e.label }))} onChange={(key) => onChange({ ...draft, entrance: entrances.find((e) => e.key === key)?.entrance })} />
    {!entrances.length && <p className="field-note">No entrance drawn yet. Light my way uses the edge of the plan.</p>}
    <ArrivalSelect label="Finish in the room you usually go to" value={finish} optional options={plan.rooms.filter((r) => !r.parent).map((r) => ({ entity: r.id, name: r.name }))} onChange={setFinish} />
    <p className="field-note">With no finishing room, the farthest room on foot comes last. Garden lights first, then the hall.</p>
    <button type="button" className="btn" onClick={() => onChange({ ...draft, steps: orderArrivalSteps(plan, draft.entrance, { entities: lights.map((d) => d.entity), ...(finish ? { finishRoomId: finish } : {}) }) })}>Light my way</button>
    <ol className="ar-steps" aria-label="Welcome home steps">
      {draft.steps.map((s, i) => <li key={`${s.entity}-${i}`} draggable onDragStart={(e) => { setDragged(i); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragged !== null) move(dragged, i); setDragged(null); }} onDragEnd={() => setDragged(null)}>
        <b>{`${i + 1}. ${label(s)}`}</b>
        <p className="field-note">{`Wait ${s.delayMs / 1000} s, then ${s.on === false ? "turn off" : s.run ? "run" : s.brightness !== undefined ? `turn on at ${s.brightness}%` : "apply this step"}.`}</p>
        <div className="ar-step-fields"><ArrivalNumber label={`Wait before step ${i + 1} (seconds)`} min={0} max={60} step={0.1} value={s.delayMs / 1000} onChange={(v) => step(i, { delayMs: Math.round(v * 1000) })} />
          {s.entity.startsWith("light.") && s.on !== false && <ArrivalNumber label={`Brightness for step ${i + 1} (%)`} min={1} max={100} value={s.brightness ?? 100} onChange={(v) => step(i, { brightness: v })} />}</div>
        <div className="am-actions"><button type="button" className="btn" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>Up</button><button type="button" className="btn" aria-label={`Move step ${i + 1} down`} disabled={i === draft.steps.length - 1} onClick={() => move(i, i + 1)}>Down</button><button type="button" className="btn" aria-label={`Remove step ${i + 1}`} onClick={() => onChange({ ...draft, steps: draft.steps.filter((_, n) => n !== i) })}>Remove</button></div>
      </li>)}
    </ol>
    {!draft.steps.length && <p className="field-note">Press Light my way, or add a linked light below.</p>}
    <ArrivalSelect label="Add a light" value={add} options={available} onChange={setAdd} />
    <button type="button" className="btn" disabled={!available.some((d) => d.entity === add) || draft.steps.length >= MAX_ARRIVAL_STEPS} onClick={() => { onChange({ ...draft, steps: [...draft.steps, { entity: add, on: true, brightness: 100, delayMs: draft.steps.length ? 1500 : 0 }] }); setAdd(""); }}>Add light</button>
  </>;
}

export function GoodbyeFields({ draft, devices, contacts, notify, onChange }: { draft: Choreography; devices: SceneDevice[]; contacts: ArrivalOption[]; notify: string[]; onChange: (draft: Choreography) => void }) {
  const away = draft.away ?? { awayMinutes: 5, delayMinutes: 0 };
  const setAway = (patch: Partial<typeof away>) => onChange({ ...draft, away: { ...away, ...patch } });
  const selected = (entity: string) => draft.steps.some((s) => s.entity === entity);
  const toggle = (device: SceneDevice) => {
    const next: ArrivalStep = device.kind === "cover" ? { entity: device.entity, position: 0, delayMs: 0 } : device.kind === "climate" ? { entity: device.entity, temperature: Math.min(device.limits?.max ?? 35, Math.max(device.limits?.min ?? 5, 17)), delayMs: 0 } : { entity: device.entity, on: false, delayMs: 0 };
    onChange({ ...draft, steps: selected(device.entity) ? draft.steps.filter((s) => s.entity !== device.entity) : [...draft.steps, next] });
  };
  return <>
    <p className="field-note">The home zone must stay empty and every chosen person must be known to be away. The same checks run again after any extra wait.</p>
    <ArrivalNumber label="Minutes after the last person leaves (safeguard)" min={5} max={60} value={away.awayMinutes} onChange={(awayMinutes) => setAway({ awayMinutes })} />
    <ArrivalNumber label="Extra wait before acting (minutes)" min={0} max={30} value={away.delayMinutes} onChange={(delayMinutes) => setAway({ delayMinutes })} />
    {(["light", "cover", "climate"] as const).map((kind) => <fieldset className="ar-group" key={kind}><legend>{kind === "light" ? "Lights off" : kind === "cover" ? "Curtains closed (never gates or garage doors)" : "Eco temperatures"}</legend>
      {devices.filter((d) => d.kind === kind && d.entity.startsWith(`${kind}.`)).map((d) => <div key={d.entity}><label className="ar-toggle"><input type="checkbox" checked={selected(d.entity)} disabled={!selected(d.entity) && draft.steps.length >= MAX_ARRIVAL_STEPS} onChange={() => toggle(d)} /><span>{`${d.name} (${d.room})`}</span></label>
        {kind === "climate" && selected(d.entity) && <ArrivalNumber label={`${d.name} eco temperature (device units)`} min={d.limits?.min ?? 5} max={d.limits?.max ?? 35} step={d.limits?.step ?? 0.5} value={draft.steps.find((s) => s.entity === d.entity)?.temperature ?? 17} onChange={(temperature) => onChange({ ...draft, steps: draft.steps.map((s) => s.entity === d.entity ? { ...s, temperature } : s) })} />}</div>)}
    </fieldset>)}
    <ArrivalToggle label="Remind me if the front door is still open" checked={!!away.doorContact || !!away.notify} onChange={(on) => setAway({ doorContact: on ? contacts[0]?.entity ?? "" : undefined, notify: on ? notify[0] ?? "" : undefined })} />
    {(away.doorContact !== undefined || away.notify !== undefined) && <><ArrivalSelect label="Door or window contact" value={away.doorContact ?? ""} options={contacts} onChange={(doorContact) => setAway({ doorContact })} /><ArrivalSelect label="Tell me through" value={away.notify ?? ""} options={notify.map((entity) => ({ entity, name: entity.replace("notify.", "").replaceAll("_", " ") }))} onChange={(notify) => setAway({ notify })} />{!notify.length && <p className="field-note warn">No notification service available. Set up the Home Assistant phone app, then reopen this sheet.</p>}</>}
    <p className="field-note">{draft.steps.length} of {MAX_ARRIVAL_STEPS} device steps selected.</p>
  </>;
}
