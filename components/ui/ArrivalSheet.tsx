"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { arrivalStepsOf, choreographyOf, duplicateChoreography, MAX_CHOREOGRAPHIES, MAX_SEQUENCE_MS, removeChoreographyFrom, saveChoreographyIn, sequenceMs, type Choreography } from "@/lib/arrival";
import { defaultEntrance } from "@/lib/arrivalOrder";
import { useArrivalPreview } from "@/lib/arrivalPreview";
import { choreographyRecipe } from "@/lib/automationsArrival";
import { automationId, buildAutomation, describeRecipe, toYaml, validateRecipe } from "@/lib/automations";
import { automationChoices } from "@/lib/automationChoices";
import { errorMessage } from "@/lib/guards";
import { onHomeChange } from "@/lib/haHome";
import { createAutomation, loadAutomations } from "@/lib/sceneApi";
import { sceneDevices } from "@/lib/sceneDevices";
import { NAME_MAX } from "@/lib/scenes";
import { useStore } from "@/lib/store";
import type { Plan } from "@/lib/types";
import { uid } from "@/lib/uid";
import { ArrivalNumber, ArrivalSelect, ArrivalToggle, GoodbyeFields, WelcomeFields } from "./ArrivalFields";
import { useArrivalUi } from "./arrivalUi";
import { useAutomationUi } from "./automationUi";
import useRestoreFocus from "./useRestoreFocus";
import "./automation.css";
import "./arrival.css";

function blank(kind: Choreography["kind"], plan: Plan): Choreography {
  const states = useStore.getState().states;
  return {
    id: uid(), name: kind === "arrival" ? "Welcome home" : "Goodbye", kind,
    ...(kind === "arrival" ? { entrance: defaultEntrance(plan) } : { away: { awayMinutes: 5, delayMinutes: 0 } }),
    steps: kind === "arrival" ? [] : arrivalStepsOf(sceneDevices(plan, states).filter((d) => d.kind === "light" && d.entity.startsWith("light.") && states[d.entity]).map((d) => ({ entity: d.entity, on: false, delayMs: 0 })), false),
    conditions: { onlyAfterDark: kind === "arrival", persons: [], debounceSeconds: 5 },
  };
}

/** A plan draft, a visual-only model preview, and the existing server-built automation path with a second explicit confirmation. */
export default function ArrivalSheet() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const initialKind = useArrivalUi((s) => s.kind);
  const close = useArrivalUi((s) => s.close);
  const [draft, setDraft] = useState(() => blank(initialKind, plan));
  const [notify, setNotify] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useArrivalPreview();
  const devices = useMemo(() => sceneDevices(plan, states).filter((d) => states[d.entity]), [plan, states]);
  const choices = useMemo(() => automationChoices(plan, states), [plan, states]);
  const people = Object.values(states).filter((s) => s.entity_id.startsWith("person."));
  const zones = Object.values(states).filter((s) => s.entity_id.startsWith("zone."));
  const saved = plan.choreographies ?? [];
  const existing = saved.some((c) => c.id === draft.id);
  const capacity = existing || saved.length < MAX_CHOREOGRAPHIES;
  const fieldsValid = draft.steps.length <= 30 && sequenceMs(draft.steps) <= MAX_SEQUENCE_MS && draft.steps.every((s) => Number.isInteger(s.delayMs) && s.delayMs >= 0 && s.delayMs <= 60000 && (s.brightness === undefined || Number.isFinite(s.brightness) && s.brightness >= 1 && s.brightness <= 100));
  const checked = useMemo(() => validateRecipe(choreographyRecipe(draft), { states, notify }), [draft, states, notify]);
  const label = (entity: string) => states[entity]?.attributes.friendly_name ?? entity;
  const words = checked.ok ? describeRecipe(checked.recipe, label) : null;
  const yaml = checked.ok ? toYaml(buildAutomation(checked.recipe, automationId(checked.recipe.type, "preview"), label).config) : null;
  useRestoreFocus();
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    void loadAutomations().then((data) => { if (alive) setNotify(data.notify); }, (e: unknown) => { if (alive) setLoadError(errorMessage(e)); });
    const unsubscribe = onHomeChange(close);
    return () => { alive = false; unsubscribe(); useArrivalPreview.getState().stop(); };
  }, [close]);

  const change = (next: Choreography) => { preview.stop(); setDraft(next); setConfirming(false); setError(null); setMessage(null); };
  const conditions = (patch: Partial<Choreography["conditions"]>) => change({ ...draft, conditions: { ...draft.conditions, ...patch } });
  const create = async () => {
    if (!checked.ok || !fieldsValid || !confirming) return;
    setBusy(true); setError(null);
    try {
      await createAutomation(checked.recipe);
      setMessage("Created in Home Assistant. It works even with this browser closed.");
      setConfirming(false);
    } catch (e) { setError(errorMessage(e)); setConfirming(false); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!capacity || !fieldsValid || !choreographyOf(draft)) return;
    useStore.getState().editPlan((p) => saveChoreographyIn(p, draft));
    setMessage("Saved in this plan. Nothing has been sent to Home Assistant.");
  };

  return <dialog ref={dialog} className={`am hud brackets ar-dialog${preview.active ? " ar-previewing" : ""}`} aria-label="Arrival and departure" onCancel={(e) => { e.preventDefault(); if (!busy) close(); }}>
    <header className="hud-head"><span className="label">Arrival and departure</span><button type="button" className="btn" disabled={busy} onClick={close}>Close</button></header>
    {preview.active ? <div className="ar-model-controls"><p role="status">{preview.done === preview.total ? "Preview complete" : `Preview: step ${preview.done} of ${preview.total}`} · model only, controls off</p><button autoFocus type="button" className="btn primary" onClick={preview.stop}>Stop preview / Back to editor</button></div> : <>
      <div className="seg am-tabs" role="group" aria-label="Choreography kind">{(["arrival", "departure"] as const).map((kind) => <button type="button" key={kind} aria-pressed={draft.kind === kind} disabled={busy} onClick={() => change(blank(kind, plan))}>{kind === "arrival" ? "Welcome home" : "Goodbye"}</button>)}</div>
      <div className="am-body ar-body" inert={busy}>
        <section className="ar-saved" aria-label="Saved choreographies"><span className="label">Saved in this plan ({saved.length}/{MAX_CHOREOGRAPHIES})</span>
          {saved.map((c) => <div className="ar-saved-row" key={c.id}><button type="button" className="btn" onClick={() => change(c)}>{c.name} · {c.kind === "arrival" ? "Welcome home" : "Goodbye"}</button><button type="button" className="btn" disabled={saved.length >= MAX_CHOREOGRAPHIES} aria-label={`Duplicate ${c.name}`} onClick={() => { const copy = duplicateChoreography(c, uid(), saved.map((s) => s.name)); useStore.getState().editPlan((p) => saveChoreographyIn(p, copy)); change(copy); }}>Duplicate</button><button type="button" className="btn danger" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c.id)}>Delete</button></div>)}
          {deleting && <div className="am-confirm" role="alert"><p>Delete this saved choreography? This is undoable. An automation already created in Home Assistant stays there.</p><div className="am-actions"><button type="button" className="btn danger" onClick={() => { useStore.getState().editPlan((p) => removeChoreographyFrom(p, deleting)); if (deleting === draft.id) change(blank(draft.kind, useStore.getState().plan)); setDeleting(null); }}>Delete saved choreography</button><button type="button" className="btn" onClick={() => setDeleting(null)}>Keep it</button></div></div>}
          <button type="button" className="btn" onClick={() => change(blank(draft.kind, plan))}>New {draft.kind === "arrival" ? "welcome" : "goodbye"}</button>
        </section>
        <label className="am-field"><span className="label">Name</span><input value={draft.name} maxLength={NAME_MAX} onChange={(e) => change({ ...draft, name: e.target.value })} /></label>
        {draft.kind === "arrival" ? <WelcomeFields key={draft.id} draft={draft} plan={plan} states={states} devices={devices} onChange={change} /> : <GoodbyeFields draft={draft} devices={devices} contacts={choices.contacts} notify={notify} onChange={change} />}
        <fieldset className="ar-group"><legend>Who</legend><p className="field-note">No one selected means everyone Home Assistant knows when the automation is created.</p><div className="ar-people">{people.map((p) => <button type="button" className="btn" key={p.entity_id} aria-pressed={draft.conditions.persons.includes(p.entity_id)} onClick={() => conditions({ persons: draft.conditions.persons.includes(p.entity_id) ? draft.conditions.persons.filter((id) => id !== p.entity_id) : [...draft.conditions.persons, p.entity_id] })}>{label(p.entity_id)}</button>)}</div>{!people.length && <p className="field-note warn">Add people in Home Assistant Settings &gt; People before creating an automation.</p>}</fieldset>
        {draft.kind === "arrival" && <fieldset className="ar-group"><legend>When it should run</legend>
          <ArrivalToggle label="Only after dark" checked={draft.conditions.onlyAfterDark} onChange={(onlyAfterDark) => conditions({ onlyAfterDark })} />
          <ArrivalToggle label="Only if nobody else is home" checked={draft.conditions.onlyIfAloneHome === true} onChange={(onlyIfAloneHome) => conditions({ onlyIfAloneHome })} />
          <ArrivalSelect label="Start when" value={draft.trigger?.zones?.length ? "zone" : "home"} options={[{ entity: "home", name: "Someone arrives home" }, { entity: "zone", name: "Someone enters a zone" }]} onChange={(v) => change({ ...draft, trigger: v === "zone" ? { zones: [zones.find((z) => z.entity_id === "zone.home")?.entity_id ?? zones[0]?.entity_id ?? "zone.home"] } : undefined })} />
          {draft.trigger?.zones?.length ? <ArrivalSelect label="Arrival zone" value={draft.trigger.zones[0]} options={zones.map((s) => ({ entity: s.entity_id, name: label(s.entity_id) }))} onChange={(zone) => change({ ...draft, trigger: { zones: [zone] } })} /> : <ArrivalNumber label="Stay home this many seconds before starting" min={0} max={60} value={draft.conditions.debounceSeconds ?? 5} onChange={(debounceSeconds) => conditions({ debounceSeconds })} />}
          <ArrivalToggle label="Turn the lights off again after a while" checked={draft.conditions.offAfterMinutes !== undefined} onChange={(on) => conditions({ offAfterMinutes: on ? 10 : undefined, motion: on ? draft.conditions.motion : undefined })} />
          {draft.conditions.offAfterMinutes !== undefined && <><ArrivalNumber label="Minutes after the sequence finishes" min={1} max={240} value={draft.conditions.offAfterMinutes} onChange={(offAfterMinutes) => conditions({ offAfterMinutes })} /><ArrivalSelect label="Leave them on if this sensor shows movement" value={draft.conditions.motion ?? ""} optional options={choices.motion} onChange={(motion) => conditions({ motion: motion || undefined })} /><p className="field-note">At that moment, a motion sensor must be off; movement or an unknown reading leaves the lights on. It does not remember earlier movement.</p></>}
        </fieldset>}
        <section className="am-preview" aria-label="What this will do"><span className="label">What this will do</span>{words ? <p className="am-words">{words}.</p> : <p className="field-note warn">{checked.ok ? "" : checked.error}</p>}{yaml && <details className="am-yaml"><summary>The Home Assistant automation</summary><pre tabIndex={0}>{yaml}</pre></details>}</section>
        {!fieldsValid && <p role="alert" className="field-note warn">Use at most 30 steps, waits from 0 to 60 seconds, at most 5 minutes in all, and brightness from 1 to 100%.</p>}
        {!capacity && <p className="field-note warn">This plan already has 12 choreographies. Reopen or delete one before saving another.</p>}
        {loadError && <p className="field-note warn">Notification targets could not be loaded: {loadError}</p>}
        <p className="field-note">Save only keeps the plan draft. Create makes a real Home Assistant automation; it runs with no browser open. Never locks, alarms, gates or garage doors.</p>
      </div>
      <footer className="ar-footer">
        {message && <p role="status" className="field-note">{message}</p>}{error && <p role="alert" className="field-note warn">{error}</p>}
        {confirming && checked.ok ? <div className="am-confirm" role="alert"><p>This adds an automation to your Home Assistant. It starts working straight away. Read the preview above before confirming.</p><div className="am-actions"><button type="button" className="btn primary" disabled={busy || !fieldsValid} onClick={() => void create()}>{busy ? "Creating..." : "Yes, create it"}</button><button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>Not yet</button></div></div> : <div className="am-actions"><button type="button" className="btn" disabled={busy || !capacity || !fieldsValid || !draft.name.trim()} onClick={save}>Save</button>{draft.kind === "arrival" && <button type="button" className="btn" disabled={busy || !checked.ok || !fieldsValid} onClick={() => { setConfirming(false); preview.play(draft.steps); }}>Preview on the model</button>}<button type="button" className="btn primary" disabled={busy || !checked.ok || !fieldsValid} onClick={() => { preview.stop(); setConfirming(true); }}>Create in Home Assistant</button><button type="button" className="btn" disabled={busy} onClick={() => { close(); useAutomationUi.getState().show(); }}>Manage automations</button></div>}
      </footer>
    </>}
  </dialog>;
}
