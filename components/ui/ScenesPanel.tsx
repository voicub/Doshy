"use client";
import { PencilSimpleIcon, PlayIcon, PlusIcon, RobotIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { sceneDevices } from "@/lib/sceneDevices";
import { TEMPLATES, templateSteps } from "@/lib/sceneTemplates";
import type { Scene } from "@/lib/scenes";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/uid";
import { useAutomationUi } from "./automationUi";
import { useArrivalUi } from "./arrivalUi";
import HudPanel from "./HudPanel";
import SceneEditor from "./SceneEditor";
import RoutinesChip from "./RoutinesChip";
import { SCENE_ICON } from "./sceneIcons";
import { runScene } from "./scenesRun";
import "./scenes.css";

type Mode = { kind: "list" } | { kind: "edit"; scene: Scene; isNew: boolean };
const NO_SCENES: Scene[] = [];

/** Scenes slide-over: run a scene with one tap, edit it, or make a new one from a template. Nothing reaches Home Assistant except from a Run or Try it button. */
export default function ScenesPanel({ onClose }: { onClose: () => void }) {
  const scenes = useStore((s) => s.plan.scenes ?? NO_SCENES);
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [adding, setAdding] = useState(false);
  const devices = useMemo(() => sceneDevices(plan, states), [plan, states]);
  const rooms = useMemo(() => new Map(plan.rooms.map((r) => [r.id, r.name])), [plan.rooms]);
  const start = (t: (typeof TEMPLATES)[number]) => setMode({ kind: "edit", isNew: true, scene: { id: uid(), name: t.id === "custom" ? "My scene" : t.name, icon: t.id, steps: templateSteps(t.id, devices) } });

  if (mode.kind === "edit") {
    return (
      <HudPanel title={mode.isNew ? "New scene" : "Edit scene"} meta={mode.scene.name} onClose={() => setMode({ kind: "list" })} className="scn drawer">
        <SceneEditor key={mode.scene.id} scene={mode.scene} isNew={mode.isNew} onDone={() => setMode({ kind: "list" })} />
      </HudPanel>
    );
  }

  return (
    <HudPanel title="Scenes" meta={scenes.length ? `${scenes.length}` : undefined} onClose={onClose} className="scn drawer">
      <div className="scn-body">
        {scenes.length > 0 ? (
          <ul className="scn-list">
            {scenes.map((s) => (
              <li key={s.id} className="scn-row">
                <button type="button" className="scn-run" onClick={() => void runScene(s)} aria-label={`Run ${s.name}`}>
                  <span className="scn-ico" aria-hidden>{SCENE_ICON[s.icon]}</span>
                  <span className="scn-text">
                    <b>{s.name}</b>
                    <small>{s.steps.length ? `${s.steps.length} device${s.steps.length === 1 ? "" : "s"}${s.pin?.length ? ` · on ${s.pin.map((r) => rooms.get(r) ?? "?").join(", ")}` : ""}` : "Nothing chosen yet"}</small>
                  </span>
                  <PlayIcon size={18} weight="fill" aria-hidden />
                </button>
                <button type="button" className="icon-btn scn-edit" aria-label={`Edit ${s.name}`} onClick={() => setMode({ kind: "edit", scene: s, isNew: false })}><PencilSimpleIcon size={16} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-note">A scene sets several devices at once: dim the lights, close the curtains, turn the TV on. Pick one to start:</p>
        )}
        {(scenes.length === 0 || adding) && (
          <div className="scn-tiles" role="group" aria-label="Scene templates">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" className="scn-tile" onClick={() => start(t)}>
                <span className="scn-ico" aria-hidden>{SCENE_ICON[t.id]}</span>
                <b>{t.name}</b>
                <small>{t.blurb}</small>
              </button>
            ))}
          </div>
        )}
        <div className="scn-actions">
          {scenes.length > 0 && <button type="button" className="btn primary" aria-expanded={adding} onClick={() => setAdding(!adding)}><PlusIcon size={14} /> New scene</button>}
          <button type="button" className="btn" onClick={() => useAutomationUi.getState().show()}><RobotIcon size={14} /> Automations</button>
          <button type="button" className="btn" onClick={() => { onClose(); useArrivalUi.getState().open(); }}>Arrival...</button>
          <RoutinesChip />
        </div>
      </div>
    </HudPanel>
  );
}
