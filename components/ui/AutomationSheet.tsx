"use client";
import { XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/guards";
import { deleteAutomation, loadAutomations, setAutomationEnabled, type AutomationList, type DoshyAutomation } from "@/lib/sceneApi";
import AutomationBuilder from "./AutomationBuilder";
import { useAutomationUi } from "./automationUi";
import MonoLabel from "./MonoLabel";
import RoutinesChip from "./RoutinesChip";
import useRestoreFocus from "./useRestoreFocus";
import "./automation.css";

/** "3 h ago" for a timestamp, or "never". */
function ago(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "never";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
}

function Row({ a, busy, onToggle, onDelete }: { a: DoshyAutomation; busy: boolean; onToggle: () => void; onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <li className="am-row" data-off={a.enabled ? undefined : ""}>
      <div className="am-row-text">
        <b>{a.summary}</b>
        <small>{`${a.enabled ? "On" : "Off"} · last ran ${ago(a.lastTriggered)}`}</small>
      </div>
      {sure ? (
        <div className="am-actions">
          <button type="button" className="btn danger" disabled={busy} onClick={onDelete}>Delete it</button>
          <button type="button" className="btn" onClick={() => setSure(false)}>Keep it</button>
        </div>
      ) : (
        <div className="am-actions">
          <button type="button" className="btn" disabled={busy} aria-pressed={a.enabled} onClick={onToggle}>{a.enabled ? "Switch off" : "Switch on"}</button>
          <button type="button" className="btn danger" disabled={busy} onClick={() => setSure(true)}>Delete</button>
        </div>
      )}
    </li>
  );
}

/** Doshy's automations in Home Assistant: switch one on or off, or delete it. Only ids Doshy made (starting doshy_) are ever listed or touched. */
function List({ data, error, onChanged }: { data: AutomationList | null; error: string | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setProblem(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  if (error) return <p className="field-note warn" role="alert">{error}</p>;
  if (!data) return <p className="field-note">Asking Home Assistant...</p>;
  return (
    <>
      {data.automations.length === 0 && <p className="field-note">Doshy has not made any automations yet. Open a device card and press "Make it do something..." to start.</p>}
      <ul className="am-list">
        {data.automations.map((a) => (
          <Row key={a.id} a={a} busy={busy === a.id} onToggle={() => void act(a.id, () => setAutomationEnabled(a.id, !a.enabled))} onDelete={() => void act(a.id, () => deleteAutomation(a.id))} />
        ))}
      </ul>
      {problem && <p className="field-note warn" role="alert">{problem}</p>}
    </>
  );
}

/**
 * The automation sheet: build a safe automation from a device ("Make it do something..."), and list, switch and delete the ones Doshy made.
 * Creating needs a Home Assistant token that belongs to an administrator; when Home Assistant refuses, the reason is shown in plain words.
 */
export default function AutomationSheet() {
  const { entity, tab, setTab, close } = useAutomationUi();
  const [data, setData] = useState<AutomationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  useRestoreFocus();

  const load = useCallback(async () => {
    try {
      setData(await loadAutomations());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && close();
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [close]);

  return (
    <div className="am-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="am hud brackets" role="dialog" aria-modal="true" aria-label="Automations">
        <header className="hud-head">
          <MonoLabel>Automations</MonoLabel>
          <span className="hud-meta">Made by Doshy</span>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close automations"><XIcon size={14} /></button>
        </header>
        <div className="seg am-tabs" role="tablist" aria-label="Automations">
          <button type="button" role="tab" aria-selected={tab === "new"} aria-pressed={tab === "new"} onClick={() => setTab("new")}>Make a new one</button>
          <button type="button" role="tab" aria-selected={tab === "list"} aria-pressed={tab === "list"} onClick={() => { setTab("list"); void load(); }}>{`Doshy automations${data ? ` (${data.automations.length})` : ""}`}</button>
        </div>
        <RoutinesChip onOpen={close} />
        <div className="am-body">
          {tab === "new" ? (
            error && !data ? <p className="field-note warn" role="alert">{error}</p>
              : data ? <AutomationBuilder key={entity ?? "none"} target={entity} notify={data.notify} onCreated={() => { setTab("list"); void load(); }} />
              : <p className="field-note">Asking Home Assistant what it has...</p>
          ) : (
            <List data={data} error={error} onChanged={() => void load()} />
          )}
        </div>
      </div>
    </div>
  );
}
