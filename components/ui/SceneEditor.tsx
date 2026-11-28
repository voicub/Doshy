"use client";
import { useMemo, useState } from "react";
import { byRoom, sceneDevices } from "@/lib/sceneDevices";
import { TEMPLATES, templateSteps } from "@/lib/sceneTemplates";
import { duplicateScene, NAME_MAX, removeSceneFrom, saveSceneIn, type Scene, type SceneStep } from "@/lib/scenes";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/uid";
import SceneControls from "./SceneControls";
import { runSteps } from "./scenesRun";

/**
 * The scene editor: a name, a start (template) and the plan's own devices by room, each with a big control for what the scene should do with it.
 * "Try it" runs the draft now (and "Restore previous" in the toast puts things back); "Save" keeps it in the plan, where it can be undone like any edit.
 */
export default function SceneEditor({ scene, isNew, onDone }: { scene: Scene; isNew: boolean; onDone: () => void }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const [draft, setDraft] = useState(scene);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const devices = useMemo(() => sceneDevices(plan, states), [plan, states]);
  const groups = useMemo(() => byRoom(devices), [devices]);
  const byEntity = useMemo(() => new Map(draft.steps.map((s) => [s.entity, s])), [draft.steps]);
  const rooms = plan.rooms.filter((r) => !r.parent);
  const edit = (fn: (p: typeof plan) => typeof plan) => useStore.getState().editPlan(fn);

  const setStep = (entity: string, step: SceneStep | null) => setDraft((d) => ({ ...d, steps: [...d.steps.filter((s) => s.entity !== entity), ...(step ? [step] : [])] }));
  const useTemplate = (id: Scene["icon"]) => setDraft((d) => ({ ...d, icon: id, name: d.name.trim() && !TEMPLATES.some((t) => t.name === d.name) ? d.name : (TEMPLATES.find((t) => t.id === id)?.name ?? d.name), steps: templateSteps(id, devices) }));
  const pin = (roomId: string) => setDraft((d) => ({ ...d, pin: d.pin?.includes(roomId) ? d.pin.filter((r) => r !== roomId) : [...(d.pin ?? []), roomId] }));
  const name = draft.name.trim();
  const save = () => {
    edit((p) => saveSceneIn(p, { ...draft, name }));
    onDone();
  };

  return (
    <div className="scn-editor">
      <label className="scn-field">
        <span className="label">Scene name</span>
        <input value={draft.name} maxLength={NAME_MAX} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Scene name" placeholder="Movie night" spellCheck={false} autoComplete="off" />
      </label>
      {isNew && (
        <div className="scn-start" role="group" aria-label="Start from">
          <span className="label">Start from</span>
          <div className="eb-chips">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" className="eb-chip" aria-pressed={draft.icon === t.id} title={t.blurb} onClick={() => useTemplate(t.id)}>{t.name}</button>
            ))}
          </div>
        </div>
      )}
      <p className="field-note">Pick what each device should do. Devices set to Leave are not touched.</p>
      {!groups.length && <p className="field-note warn">No controllable devices are linked yet. Link lights, curtains, TVs and thermostats to furniture in Home Assistant mode.</p>}
      <div className="scn-body">
        {groups.map((g) => (
          <section key={`${g.roomId}-${g.room}`} aria-label={g.room}>
            <h3 className="scn-room"><span className="label">{g.room}</span></h3>
            <ul className="scn-devs">
              {g.devices.map((d) => <SceneControls key={d.entity} device={d} step={byEntity.get(d.entity) ?? null} state={states[d.entity]} onChange={(s) => setStep(d.entity, s)} />)}
            </ul>
          </section>
        ))}
        {rooms.length > 0 && (
          <details className="scn-adv">
            <summary className="label">Show this scene on room cards</summary>
            <div className="eb-chips">
              {rooms.map((r) => <button key={r.id} type="button" className="eb-chip" aria-pressed={!!draft.pin?.includes(r.id)} onClick={() => pin(r.id)}>{r.name}</button>)}
            </div>
          </details>
        )}
      </div>
      <p className="field-note" aria-live="polite">{draft.steps.length ? `${draft.steps.length} device${draft.steps.length === 1 ? "" : "s"} in this scene.` : "Nothing chosen yet."}</p>
      <div className="scn-actions scn-bar">
        <button type="button" className="btn" disabled={!draft.steps.length} onClick={() => void runSteps(name || "Scene", draft.steps)}>Try it</button>
        <button type="button" className="btn primary" disabled={!name} onClick={save}>Save</button>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
      </div>
      {!isNew && !confirmDelete && (
        <div className="scn-actions">
          <button type="button" className="btn" onClick={() => { edit((p) => saveSceneIn(p, duplicateScene(draft, uid(), (plan.scenes ?? []).map((s) => s.name)))); onDone(); }}>Duplicate</button>
          <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
      )}
      {confirmDelete && (
        <div className="scn-confirm" role="alert">
          <span>{`Delete "${scene.name}"? You can undo it with Undo.`}</span>
          <div className="scn-actions">
            <button type="button" className="btn danger" onClick={() => { edit((p) => removeSceneFrom(p, scene.id)); onDone(); }}>Delete scene</button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  );
}
