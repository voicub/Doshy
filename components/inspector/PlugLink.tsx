"use client";
import { PlugsConnectedIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG } from "@/lib/catalog";
import { FAMILY_HINTS, familyOf, powerSensorFor, runLabel, runStatus, suggestPlugs, suggestRunAbove, thresholdsFor, toWatts, type Family, type RunStatus } from "@/lib/running";
import type { HAState } from "@/lib/ha";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { useRecentWatts } from "../scene/useItemLive";
import EntityPicker from "../ui/EntityPicker";
import { withParams } from "./itemParams";
import MonoLabel from "../ui/MonoLabel";
import "./PlugLink.css";

const MAX_W = 3000; // right end of the slider; the scale is logarithmic so 5 W and 2 kW are both easy to set
const SAVE_DELAY_MS = 300;
const toPos = (w: number) => (100 * Math.log(Math.max(1, w))) / Math.log(MAX_W);
const toWattsAt = (p: number) => Math.round(MAX_W ** (p / 100));
const SKIP_WORDS = ["small", "white", "with", "low", "table", "slim", "wall", "black"];

const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const fmt = (w: number | null) => (w == null ? "no reading" : `${w >= 100 ? Math.round(w) : Math.round(w * 10) / 10} W`);

/** Rows of a chosen entity, with a remove button. */
function Chosen({ id, label, onClear }: { id: string; label: string; onClear: () => void }) {
  const st = useStore((s) => s.states[id]);
  return (
    <div className="entity-current">
      <span>
        <b>{st?.attributes.friendly_name ?? id}</b>
        <small>{id}{st ? ` / ${st.state}${st.attributes.unit_of_measurement ? ` ${st.attributes.unit_of_measurement}` : ""}` : " / not found"}</small>
      </span>
      <button type="button" className="icon-btn" aria-label={`Remove ${label}`} onClick={onClear}><XIcon size={12} /></button>
    </div>
  );
}

/** The slider shows the drag at once and saves a moment after the user pauses (one undo step, not one per pixel). */
function useRunAboveSlider(saved: number, save: (w: number) => void) {
  const [local, setLocal] = useState<number | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const drag = (p: number) => {
    const w = toWattsAt(p);
    setLocal(w);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      save(w);
      setLocal(null);
    }, SAVE_DELAY_MS);
  };
  return { shown: local ?? saved, drag };
}

/** The plug: the chosen one, or the plugs whose names look right, or a search. */
function PlugPicker({ plugId, suggestions, states, onChoose }: { plugId: string | undefined; suggestions: { plug: string; power?: string }[]; states: Record<string, HAState>; onChoose: (plug?: string) => void }) {
  if (plugId) return <Chosen id={plugId} label="plug" onClear={() => onChoose(undefined)} />;
  return (
    <>
      {!!suggestions.length && (
        <div className="pl-suggest" role="list" aria-label="Plugs that look right">
          {suggestions.map((c) => (
            <button key={c.plug} type="button" role="listitem" className="preset pl-pick" onClick={() => onChoose(c.plug)}>
              <span>{states[c.plug]?.attributes.friendly_name ?? c.plug}</span>
              {c.power && <small>{fmt(toWatts(states[c.power]?.state ?? "", states[c.power]?.attributes.unit_of_measurement))}</small>}
            </button>
          ))}
        </div>
      )}
      {!suggestions.length && <small className="field-note">No plug found by name. Search for it below.</small>}
      <EntityPicker label="Plug (switch)" value={undefined} onChange={onChoose} domains={["switch"]} />
    </>
  );
}

type PowerProps = { powerId: string; family: Family; watts: number | null; status: RunStatus; suggested: number; saved: number; onSave: (w: number) => void; onClear: () => void };

/** The power sensor: what it reads now, the "running above" slider, and a read-only test. */
function PowerSection({ powerId, family, watts, status, suggested, saved, onSave, onClear }: PowerProps) {
  const refresh = useStore((s) => s.refreshStates);
  const [readAt, setReadAt] = useState<number | null>(null);
  const { shown, drag } = useRunAboveSlider(saved, onSave);
  return (
    <>
      <Chosen id={powerId} label="power sensor" onClear={onClear} />
      <div className="pl-read" aria-live="polite">
        <b>{fmt(watts)}</b>
        <span>{runLabel(family, status, watts).title}</span>
      </div>
      <label className="pl-slider">
        <MonoLabel>Running above {shown} W</MonoLabel>
        <span className="pl-track">
          <input type="range" className="rng" min={0} max={100} step={0.5} value={toPos(shown)} aria-valuetext={`${shown} watts`} onChange={(e) => drag(Number(e.target.value))} />
          {watts != null && watts > 0 && <i className={`pl-live ${status.state === "running" ? "on" : ""}`} style={{ left: `${Math.min(100, toPos(watts))}%` }} aria-hidden />}
        </span>
      </label>
      <div className="pl-actions">
        <button type="button" className="btn" disabled={shown === suggested} onClick={() => onSave(suggested)}>Use {suggested} W</button>
        <button type="button" className="btn" onClick={() => void refresh().then(() => setReadAt(Date.now()))}>Test (read only)</button>
      </div>
      {readAt && <small className="field-note ok">Read {fmt(watts)} at {new Date(readAt).toLocaleTimeString()}: {status.state}. Nothing was switched.</small>}
    </>
  );
}

/**
 * "Make it smart with a plug": a basic washer, kettle or TV on a smart plug. The plug's switch and power sensor are stored in item.params
 * (plugEntity, powerEntity, runAbove); the scene decides "running" from the watts (lib/running.ts). Nothing here ever calls a service: it only reads.
 */
export default function PlugLink({ item, roomName }: { item: Item; roomName?: string }) {
  const states = useStore((s) => s.states);
  const patch = useStore((s) => s.patch);
  const def = CATALOG[item.kind];
  const family = familyOf(`${item.kind} ${def?.label ?? ""}`);
  const plugId = text(item.params?.plugEntity);
  const powerId = text(item.params?.powerEntity);
  const runAbove = typeof item.params?.runAbove === "number" ? item.params.runAbove : undefined;
  const [open, setOpen] = useState(false);
  const buf = useRecentWatts(powerId);

  const setParams = (next: Record<string, string | number | undefined>, entity?: string) => {
    patch("item", item.id, { params: withParams(item.params, next), ...(entity ? { entity } : {}) });
  };
  const choosePlug = (plug?: string) => {
    if (!plug) return setParams({ plugEntity: undefined, powerEntity: undefined, runAbove: undefined });
    setParams({ plugEntity: plug, powerEntity: powerSensorFor(plug, states) }, item.entity ? undefined : plug);
  };

  const hints = useMemo(() => {
    const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    return [
      ...FAMILY_HINTS[family].map((word) => ({ word, weight: 10 })),
      ...words(def?.label ?? "").filter((w) => w.length >= 4 && !SKIP_WORDS.includes(w)).map((word) => ({ word, weight: 6 })),
      ...words(roomName ?? "").map((word) => ({ word, weight: 2 })),
    ];
  }, [family, def?.label, roomName]);
  const suggestions = useMemo(() => (plugId ? [] : suggestPlugs(states, hints)), [states, hints, plugId]);

  const powerState = powerId ? states[powerId] : undefined;
  const watts = powerState ? toWatts(powerState.state, powerState.attributes.unit_of_measurement) : null;
  const th = thresholdsFor(family, runAbove);
  const status = runStatus({ powerW: watts, switchOn: plugId && states[plugId] ? states[plugId].state === "on" : undefined, thresholds: th, history: buf });
  const suggested = suggestRunAbove(family, [...(buf ?? []).map((s) => s.w), ...(watts == null ? [] : [watts])]);

  if (!plugId && !powerId && !open) {
    return (
      <div className="field plug-link">
        <button type="button" className="btn" onClick={() => setOpen(true)}><PlugsConnectedIcon size={14} /> Make it smart with a plug</button>
        <small className="field-note">For an appliance that is not smart: a smart plug that reports watts tells the dashboard when it is running.</small>
      </div>
    );
  }

  return (
    <div className="field plug-link" role="group" aria-label="Smart plug">
      <MonoLabel>Smart plug</MonoLabel>
      <PlugPicker plugId={plugId} suggestions={suggestions} states={states} onChoose={choosePlug} />
      {plugId && !powerId && (
        <>
          <small className="field-note warn">No power sensor found for this plug. Pick the one that reads its watts.</small>
          <EntityPicker label="Power sensor (watts)" value={undefined} onChange={(p) => p && setParams({ powerEntity: p })} domains={["sensor"]} />
        </>
      )}
      {powerId && <PowerSection powerId={powerId} family={family} watts={watts} status={status} suggested={suggested} saved={th.runAbove} onSave={(w) => setParams({ runAbove: w })} onClear={() => setParams({ powerEntity: undefined })} />}
      {(plugId || powerId) && <button type="button" className="btn" onClick={() => { choosePlug(undefined); setOpen(false); }}>Remove plug</button>}
    </div>
  );
}
