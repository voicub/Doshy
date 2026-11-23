"use client";
import { WrenchIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { hudScale, hudViewport } from "@/lib/displayStore";
import { useStore } from "@/lib/store";
import { badgeOf, KIND_LABEL, washColor, washdataOf, washView, wordsOf } from "@/lib/washdata";
import HudPanel from "./HudPanel";
import type { DeviceTarget } from "./serviceActions";
import { washCall } from "./washUi";
import { useDismiss } from "./useDismiss";
import { WASH_ICON } from "./washIcons";
import { ProgramSelect, timing, WashControls, WashFacts } from "./WashParts";
import "./washData.css";

const WIDTH = 320;

/**
 * Floating card for a WashData appliance (washing machine, dryer, dishwasher): the state in big words, progress, program, time left and expected finish, power,
 * the last cycle and the totals, plus Pause / Resume / Mark unloaded / Force end and the program choice. A control shows only when WashData offers it right now.
 * Only taps send anything (washUi.ts); WashData cannot start a cycle, so there is no Start button.
 */
export default function WashCard({ target, onClose }: { target: DeviceTarget; onClose: () => void }) {
  const states = useStore((s) => s.states);
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const dev = washdataOf(states, target.entity);
  const v = dev ? washView(states, dev.base) : undefined;

  useDismiss(root, onClose);
  useEffect(() => {
    setError(null);
    setConfirmEnd(false);
    root.current?.querySelector<HTMLElement>("button, select")?.focus({ preventScroll: true });
  }, [target.entity]);

  const style =
    target.x != null && target.y != null
      ? { left: Math.max(12, Math.min(hudViewport().width - WIDTH - 12, target.x / hudScale() + 18)), top: Math.max(60, Math.min(hudViewport().height - 460, target.y / hudScale() - 40)) }
      : undefined;
  const Icon = v ? WASH_ICON[v.kind] : undefined;

  if (!dev || !v || !Icon) {
    return (
      <div ref={root} className={`devcard ${style ? "" : "center"}`} style={style} role="dialog" aria-label="Appliance">
        <HudPanel title="Appliance" meta={target.entity} onClose={onClose} className="dc wc">
          <p className="field-note warn">Not reported by Home Assistant.</p>
        </HudPanel>
      </div>
    );
  }

  const badge = badgeOf(v);
  const color = washColor(v);
  const stateId = `sensor.${v.base}_state`;
  const optimistic = (state: string): Record<string, string> => (states[stateId] ? { [stateId]: state } : {});
  const press = async (entity: string | undefined, what: string, next: string) => {
    if (!entity) return;
    setError(await washCall({ domain: "button", service: "press", entity_id: entity }, what, optimistic(next)));
  };
  const choose = async (option: string) => {
    const entity = v.controls.program;
    if (!entity) return;
    setError(await washCall({ domain: "select", service: "select_option", entity_id: entity, data: { option } }, "change the program", { [entity]: option }));
  };
  const when = timing(v);

  return (
    <div ref={root} className={`devcard ${style ? "" : "center"}`} style={style} role="dialog" aria-label={`${KIND_LABEL[v.kind]} ${v.name}`}>
      <HudPanel title={KIND_LABEL[v.kind]} meta={v.name.toLowerCase() === KIND_LABEL[v.kind].toLowerCase() ? undefined : v.name} onClose={onClose} className="dc wc">
        <div className={`wc-state ${badge.tone}`} style={{ ["--sc" as string]: color }}>
          <Icon size={26} aria-hidden />
          <div className="wc-words" role="status" aria-live="polite">
            <b>{wordsOf(v)}</b>
            {when && <small>{when}</small>}
          </div>
        </div>
        {v.progress !== undefined && v.phase !== "off" && (
          <div className="wc-bar" role="progressbar" aria-label="Cycle progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.progress)} style={{ ["--sc" as string]: color }}>
            <i style={{ width: `${v.progress}%` }} />
            <span>{Math.round(v.progress)}%</span>
          </div>
        )}
        <WashFacts v={v} />
        {v.maintenanceDue && (
          <p className="wc-maint" role="status"><WrenchIcon size={14} aria-hidden /> Maintenance is due. WashData suggests a clean or a check.</p>
        )}
        <WashControls v={v} confirmEnd={confirmEnd} setConfirmEnd={setConfirmEnd} onPress={(entity, what, next) => void press(entity, what, next)} />
        <ProgramSelect v={v} onChoose={(option) => void choose(option)} />
        {v.suggestions !== undefined && <small className="field-note">{v.suggestions} suggested {v.suggestions === 1 ? "setting" : "settings"} waiting in WashData.</small>}
        {error && <p className="field-note warn" role="alert">{error}</p>}
      </HudPanel>
    </div>
  );
}
