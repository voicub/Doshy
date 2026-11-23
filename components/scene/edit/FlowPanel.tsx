"use client";
import { ArrowsLeftRightIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { HAState } from "@/lib/ha";
import {
  autoInvert, flowsOf, flowWatts, formatPower, guessSocEntity, isPowerSensor, itemById, itemLabel, proposeFlows, rankPowerEntities, readWatts, roleOf, wordsFor, type Proposal, type States,
} from "@/lib/flows";
import { useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import type { Item, Plan } from "@/lib/types";
import EntityPicker from "../../ui/EntityPicker";
import HudPanel from "../../ui/HudPanel";
import MonoLabel from "../../ui/MonoLabel";
import { useFlowUi } from "./flowUi";
import "./flowPanel.css";

const MAX_CHOICES = 60;
const MAX_SUGGESTIONS = 4;
const isPercent = (st: HAState) => st.attributes.unit_of_measurement === "%";

const nameOf = (states: States, id?: string) => (id ? (states[id]?.attributes?.friendly_name ?? id) : "");
/** The label of a flow end (the id when its item is gone). */
const endLabel = (plan: Plan, id: string) => {
  const it = itemById(plan, id);
  return it ? itemLabel(it) : id;
};
const valueOf = (states: States, id?: string) => {
  const w = readWatts(id ? states[id] : undefined);
  return w === undefined ? "n/a" : formatPower(w);
};
/** One undo step for a batch of edits. */
const batch = (fn: () => void) => {
  const s = useStore.getState();
  s.beginEdit();
  fn();
  s.endEdit();
};

function Chips({ ids, states, onPick }: { ids: string[]; states: States; onPick: (id: string) => void }) {
  return (
    <div className="chips" role="group" aria-label="Suggested sensors">
      {ids.map((id) => (
        <button key={id} type="button" className="preset flow-chip" title={id} onClick={() => onPick(id)}>
          {nameOf(states, id)} <b>{valueOf(states, id)}</b>
        </button>
      ))}
    </div>
  );
}

/** Where a sensor's sign points, in words. */
function Reading({ entity, from, to, invert }: { entity?: string; from: Item; to: Item; invert?: boolean }) {
  const states = useStore((s) => s.states);
  const w = entity ? flowWatts({ id: "", from: from.id, to: to.id, entity, invert }, states) : undefined;
  if (!entity) return null;
  if (w === undefined) return <small className="field-note warn">No reading from this sensor right now.</small>;
  const dir = Math.abs(w) < 15 ? "Idle right now." : w > 0 ? `Power flows ${itemLabel(from)} to ${itemLabel(to)}.` : `Power flows ${itemLabel(to)} to ${itemLabel(from)}.`;
  return <small className="field-note ok">{`${valueOf(states, entity)}. ${dir}`}</small>;
}

/** "Click" with a mouse, "Tap" on a compact (touch) screen. */
function useTapWord(): string {
  return useVp().vp !== "regular" ? "Tap" : "Click";
}

function PowerPicker({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  return <EntityPicker label="Power sensor" value={value} onChange={onChange} domains={["sensor"]} filter={(st) => isPowerSensor(st)} />;
}

function Draft({ from, to }: { from: Item; to: Item }) {
  const states = useStore((s) => s.states);
  const addFlow = useStore((s) => s.addFlow);
  const [entity, setEntity] = useState<string>();
  const ranked = useMemo(() => rankPowerEntities(states, wordsFor(roleOf(from.kind), roleOf(to.kind))), [states, from.kind, to.kind]);
  const suggestions = ranked.ids.slice(0, Math.min(MAX_SUGGESTIONS, ranked.matched));
  const connect = () => {
    if (!entity) return;
    const w = readWatts(states[entity]);
    const id = addFlow({ from: from.id, to: to.id, kind: "power", entity, invert: autoInvert(roleOf(from.kind), roleOf(to.kind), w) || undefined });
    if (id) useFlowUi.getState().selectFlow(id);
  };
  const swap = () => useFlowUi.setState({ from: to.id, to: from.id });
  return (
    <div className="stack">
      <div className="flow-ends">
        <b>{itemLabel(from)}</b>
        <button type="button" className="icon-btn" aria-label="Swap the two ends" title="Swap the two ends" onClick={swap}><ArrowsLeftRightIcon size={14} /></button>
        <b>{itemLabel(to)}</b>
      </div>
      {suggestions.length > 0 && (
        <div className="field">
          <MonoLabel>Suggested</MonoLabel>
          <Chips ids={suggestions} states={states} onPick={setEntity} />
        </div>
      )}
      <PowerPicker value={entity} onChange={setEntity} />
      <Reading entity={entity} from={from} to={to} />
      <div className="flow-actions">
        <button type="button" className="btn primary" disabled={!entity} onClick={connect}>Connect</button>
        <button type="button" className="btn" onClick={() => useFlowUi.getState().resetDraft()}>Start over</button>
      </div>
    </div>
  );
}

/** One-click battery charge: the percent sensor shown as lit bars over the battery. */
function SocRow({ item }: { item: Item }) {
  const states = useStore((s) => s.states);
  const patch = useStore((s) => s.patch);
  const soc = typeof item.params?.soc === "string" ? item.params.soc : undefined;
  const guess = useMemo(() => (soc ? undefined : guessSocEntity(states)), [states, soc]);
  const set = (v?: string) => {
    const { soc: _drop, ...rest } = item.params ?? {};
    void _drop;
    patch("item", item.id, { params: v ? { ...rest, soc: v } : rest });
  };
  return (
    <div className="stack flow-soc">
      <EntityPicker label={`${itemLabel(item)} charge`} value={soc} onChange={set} domains={["sensor"]} filter={isPercent} />
      {guess && (
        <button type="button" className="btn" onClick={() => set(guess)} title={guess}>
          Show charge from {nameOf(states, guess)}
        </button>
      )}
    </div>
  );
}

function FlowEditor({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const patchFlow = useStore((s) => s.patchFlow);
  const removeFlow = useStore((s) => s.removeFlow);
  const f = plan.flows?.find((x) => x.id === id);
  const from = f && itemById(plan, f.from);
  const to = f && itemById(plan, f.to);
  const tap = useTapWord();
  if (!f || !from || !to) return null;
  const batteries = [from, to].filter((i) => roleOf(i.kind) === "battery");
  return (
    <div className="stack">
      <div className="flow-ends">
        <b>{itemLabel(from)}</b>
        <span aria-hidden>to</span>
        <b>{itemLabel(to)}</b>
      </div>
      <PowerPicker value={f.entity} onChange={(entity) => patchFlow(id, { entity, ...(entity ? {} : { invert: undefined }) })} />
      <Reading entity={f.entity} from={from} to={to} invert={f.invert} />
      <small className="field-note flow-flipnote">Flip direction if the pulses run the wrong way.</small>
      <div className="flow-actions">
        <button type="button" className="btn" aria-pressed={!!f.invert} onClick={() => patchFlow(id, { invert: f.invert ? undefined : true })} title="Use when the pulses run the wrong way">
          Flip direction
        </button>
        <button type="button" className="btn danger" onClick={() => { removeFlow(id); useFlowUi.getState().selectFlow(null); }}>
          <TrashIcon size={14} /> Remove line
        </button>
      </div>
      {batteries.map((b) => <SocRow key={b.id} item={b} />)}
      <p className="hint">{tap} another item to start a new line.</p>
    </div>
  );
}

function Lines() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const selected = useFlowUi((s) => s.flow);
  const flows = flowsOf(plan);
  if (!flows.length) return null;
  return (
    <div className="field">
      <MonoLabel>Lines</MonoLabel>
      <ul className="flow-list">
        {flows.map((f) => {
          const w = flowWatts(f, states);
          return (
            <li key={f.id}>
              <button type="button" className="flow-row" aria-pressed={f.id === selected} onClick={() => useFlowUi.getState().selectFlow(f.id === selected ? null : f.id)}>
                <span>{endLabel(plan, f.from)} to {endLabel(plan, f.to)}</span>
                <em>{f.entity ? (w === undefined ? "n/a" : formatPower(w)) : "no sensor"}</em>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The standard wiring of the energy items in the plan, shown as a preview the user changes and confirms. */
function AutoConnect() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const addFlow = useStore((s) => s.addFlow);
  const [rows, setRows] = useState<Proposal[] | null>(null);
  const tap = useTapWord();
  const available = useMemo(() => proposeFlows(plan).length, [plan]);
  const choices = useMemo(() => Object.entries(states).filter(([id, st]) => isPowerSensor({ ...st, entity_id: id })).map(([id]) => id), [states]);
  if (!rows) {
    return available ? (
      <button type="button" className="btn primary" onClick={() => setRows(proposeFlows(plan, states))}>Auto-connect my energy system</button>
    ) : (
      <p className="hint">
        {plan.items.some((i) => roleOf(i.kind)) ? `Your energy items are all connected. ${tap} two items to add another line.` : "Add solar panels, an inverter, a battery, a meter or a charger from the catalog (Energy, Garage and EV) and they can be wired up here in one click."}
      </p>
    );
  }
  const set = (i: number, entity?: string) => setRows((r) => r && r.map((p, j) => (j === i ? { ...p, entity } : p)));
  const ready = rows.filter((r) => r.entity);
  const confirm = () => {
    batch(() => {
      for (const r of ready) {
        const from = itemById(plan, r.from);
        const to = itemById(plan, r.to);
        if (!from || !to || !r.entity) continue;
        addFlow({ from: r.from, to: r.to, kind: "power", entity: r.entity, invert: autoInvert(r.fromRole, r.toRole, readWatts(states[r.entity])) || undefined });
      }
    });
    setRows(null);
  };
  return (
    <div className="stack">
      <MonoLabel>Proposed lines</MonoLabel>
      {rows.length === 0 && <p className="hint">Everything is already connected.</p>}
      {rows.map((r, i) => {
        const ranked = rankPowerEntities(states, wordsFor(r.fromRole, r.toRole)).ids;
        const list = [...new Set([...(r.entity ? [r.entity] : []), ...ranked.filter((id) => choices.includes(id))])].slice(0, MAX_CHOICES);
        return (
          <label key={`${r.from}-${r.to}`} className="field">
            <span className="flow-ends"><b>{endLabel(plan, r.from)}</b><span aria-hidden>to</span><b>{endLabel(plan, r.to)}</b></span>
            <select value={r.entity ?? ""} onChange={(e) => set(i, e.target.value || undefined)}>
              <option value="">No sensor (skip this line)</option>
              {list.map((id) => <option key={id} value={id}>{nameOf(states, id)} ({valueOf(states, id)})</option>)}
            </select>
          </label>
        );
      })}
      <div className="flow-actions">
        <button type="button" className="btn primary" disabled={!ready.length} onClick={confirm}>Connect {ready.length} {ready.length === 1 ? "line" : "lines"}</button>
        <button type="button" className="btn" onClick={() => setRows(null)}>Cancel</button>
      </div>
    </div>
  );
}

/** Connect tool of the Home Assistant view: pick two items, pick a power sensor, and a live line runs between them. */
export default function FlowPanel() {
  const { on, from, to, flow: picked, setOn } = useFlowUi();
  const tap = useTapWord();
  const plan = useStore((s) => s.plan);
  const flow = picked && plan.flows?.some((f) => f.id === picked) ? picked : null; // a removed or undone line is no longer selected
  const a = from ? itemById(plan, from) : undefined;
  const b = to ? itemById(plan, to) : undefined;

  useEffect(() => () => useFlowUi.getState().setOn(false), []);
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target instanceof Element && e.target.matches("input,textarea,select"))) return;
      const ui = useFlowUi.getState();
      if (ui.flow) ui.selectFlow(null);
      else if (ui.from) ui.resetDraft();
      else ui.setOn(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on]);
  if (!on) return null;

  const hint = a ? `Now ${tap.toLowerCase()} where the power goes.` : `${tap} the item the power comes from, then the one it goes to.`;
  return (
    <HudPanel title="Connect energy" onClose={() => setOn(false)} className="flow-panel">
      <div className="stack">
        {flow ? (
          <FlowEditor id={flow} />
        ) : a && b ? (
          <Draft key={`${a.id}-${b.id}`} from={a} to={b} />
        ) : (
          <>
            <p className="hint" role="status">{hint}</p>
            <AutoConnect />
          </>
        )}
        {!(a && b) && <Lines />}
        {!(a && b) &&
          plan.items
            .filter((i) => roleOf(i.kind) === "battery" && flow === null)
            .map((i) => <SocRow key={i.id} item={i} />)}
      </div>
    </HudPanel>
  );
}
