"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { isRecord, errorMessage } from "@/lib/guards";
import { onGuestPage } from "@/lib/guestMode";
import { callService } from "@/lib/ha";
import { currentHome, onHomeChange } from "@/lib/haHome";
import { onPlanState } from "@/lib/planState";
import { useReplay } from "@/lib/replay";
import { assertLive } from "@/lib/replayGate";
import { useStore } from "@/lib/store";
import { VALVE_LABEL } from "@/lib/utilities";
import type { ValveHit } from "@/lib/utilitiesGraph";
import { shutoffTarget, suggestShutoff, valveCall, valveState } from "@/lib/utilitiesShutoff";
import { closeShutoff, openShutoff, SHUTOFF_EVENT, useUtilitySafety, type ShutoffRequest } from "./utilitySafetyUi";
import useRestoreFocus from "./useRestoreFocus";
import "./utilitySafety.css";

type Confirmation = { action: "close" | "open"; valves: ValveHit[] };
const labelOf = (v: ValveHit) => VALVE_LABEL[v.kind] ?? "valve";

function ShutoffDialog({ request }: { request: ShutoffRequest }) {
  const root = useRef<HTMLDialogElement>(null);
  const title = useId();
  const effectId = useId();
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const replaying = useReplay((s) => s.replaying);
  const [reviewedPlan] = useState(plan);
  const suggestion = suggestShutoff(plan, states, request.target);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(() => suggestion?.close.length ? { action: "close", valves: suggestion.close } : null);
  const [operated, setOperated] = useState<ValveHit[]>([]);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const changed = plan !== reviewedPlan;
  const readOnly = replaying || onGuestPage();
  const listed = [...(suggestion?.close ?? []), ...(suggestion?.reopen ?? []), ...operated];
  const valves = listed.filter((v, i) => listed.findIndex((other) => other.itemId === v.itemId) === i);
  const reopen = valves.filter((v) => valveState(v.entity, states) === "closed" && valveCall(v.entity, "open"));
  const canSend = !!confirmation?.valves.length && confirmation.valves.every((v) => !!valveCall(v.entity, confirmation.action) && !!v.entity && !!states[v.entity] && !["unavailable", "unknown", "closing", "opening"].includes(states[v.entity].state));

  useRestoreFocus();
  useEffect(() => {
    const dialog = root.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function confirm() {
    if (!confirmation || sending.current || !canSend || readOnly || changed) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      for (const valve of confirmation.valves) {
        assertLive();
        const active = useActivePlan.getState();
        if (useUtilitySafety.getState().request !== request || currentHome() !== request.home || active.id !== request.planId || active.status !== "ready" || useStore.getState().plan !== reviewedPlan) throw new Error("The plan or home changed. Review the pipe path again before operating a valve.");
        const linked = reviewedPlan.items.find((i) => i.id === valve.itemId);
        const call = linked && linked.entity === valve.entity ? valveCall(linked.entity, confirmation.action) : null;
        if (!call) throw new Error("The valve link changed. Review it again before continuing.");
        await callService(call);
        // Keep each successful valve visible even if a later valve fails. Never guess its physical state.
        setOperated((prev) => [...prev.filter((v) => v.itemId !== valve.itemId), valve]);
      }
      setSent(`${confirmation.action === "close" ? "Close" : "Open"} command sent. Check the Home Assistant state below; a command is not confirmation that the valve moved.`);
      setConfirmation(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      sending.current = false;
      setBusy(false);
      if (currentHome() === request.home) void useStore.getState().refreshStates();
    }
  }

  const cancel = () => { if (!sending.current) closeShutoff(); };
  return (
    <dialog ref={root} className="utility-dialog" aria-labelledby={title} aria-describedby={effectId} onCancel={(e) => { e.preventDefault(); cancel(); }}>
      <h2 id={title}>{confirmation?.action === "open" ? "Reopen the supply?" : `${request.target.medium === "water" ? "Water" : "Gas"} supply shut-off`}</h2>
      <p>{suggestion?.headline ?? "No pipe path reaches this sensor or room. Draw and connect the supply in Plan → Pipes before using a shut-off suggestion."}</p>
      <p id={effectId} className="utility-effect">{confirmation?.action === "open" ? "Flow will resume to taps or appliances on this supply. Only reopen after the cause has been made safe." : suggestion?.effect}</p>
      {request.target.medium === "gas" && <p className="utility-warning">If you suspect gas, smoke or carbon monoxide, leave the area and follow local emergency advice. Do not reopen gas until a qualified professional says it is safe.</p>}
      <p className="utility-model-note">This is a drawn model, not an engineered plan. Verify the valve and affected appliances. Nothing closes or reopens automatically.</p>
      <ul className="utility-valve-list" aria-label="Valve states">
        {valves.map((v) => {
          const raw = v.entity ? states[v.entity]?.state : undefined;
          const state = valveState(v.entity, states);
          const name = v.entity ? states[v.entity]?.attributes.friendly_name : undefined;
          return <li key={v.itemId}><span><strong>{typeof name === "string" ? name : labelOf(v)}</strong><small>{v.entity ?? "Not linked · operate by hand"}</small></span><b>{state === "unknown" ? raw === "closing" || raw === "opening" ? `${raw} · not confirmed` : "State unknown" : state === "closed" ? "Closed" : "Open"}</b></li>;
        })}
      </ul>
      {suggestion && !valves.length && <p>No connected source valve was found. Check the drawn connections and place a main valve on the supply.</p>}
      {!!confirmation?.valves.some((v) => !valveCall(v.entity, confirmation.action)) && <p>At least one required valve is not linked to a controllable valve or switch. Close it by hand; the dashboard cannot confirm a complete shut-off.</p>}
      {changed && <p role="alert">The drawn plan changed. Close this dialog and review the path again.</p>}
      {readOnly && <p role="status">{replaying ? "History replay: valve controls are off." : "Read-only view: valve controls are off."}</p>}
      {error && <p role="alert" className="utility-warning">{error} Some valves may already have moved; check every state before trying again.</p>}
      {sent && <p role="status">{sent}</p>}
      {confirmation && <p><strong>{confirmation.action === "open" ? "Reopen" : "Close"} {confirmation.valves.map(labelOf).join(" and ")}?</strong></p>}
      <div className="utility-dialog-actions">
        <button type="button" autoFocus disabled={busy} onClick={cancel}>{confirmation ? "Cancel" : "Done"}</button>
        {confirmation ? <button type="button" disabled={busy || readOnly || changed || !canSend} onClick={() => void confirm()}>{busy ? "Sending…" : confirmation.action === "open" ? "Confirm reopen" : "Confirm close"}</button> : <>
          {reopen.length > 0 && <button type="button" disabled={busy || readOnly || changed} onClick={() => { setError(null); setSent(null); setConfirmation({ action: "open", valves: reopen }); }}>Reopen…</button>}
          {!!suggestion?.close.length && <button type="button" disabled={busy || readOnly || changed} onClick={() => { setError(null); setSent(null); setConfirmation({ action: "close", valves: suggestion.close }); }}>Close supply…</button>}
        </>}
      </div>
    </dialog>
  );
}

/** Always mounted alongside AlertBanner, so anomaly cards can request a review even without an active alarm. */
export default function UtilityShutoffDialog() {
  const request = useUtilitySafety((s) => s.request);
  useEffect(() => {
    const onRequest = (event: Event) => {
      if (!(event instanceof CustomEvent) || !isRecord(event.detail) || typeof event.detail.sensorOrRoom !== "string" || event.detail.sensorOrRoom.length > 256) return;
      const { plan, states } = useStore.getState();
      const target = shutoffTarget(plan, states, event.detail.sensorOrRoom);
      if (target) openShutoff(target);
    };
    document.addEventListener(SHUTOFF_EVENT, onRequest);
    const stopHome = onHomeChange(closeShutoff);
    const stopPlan = onPlanState((s) => {
      const current = useUtilitySafety.getState().request;
      if (current && (s.status !== "ready" || current.planId !== s.id)) closeShutoff();
    });
    return () => { document.removeEventListener(SHUTOFF_EVENT, onRequest); stopHome(); stopPlan(); };
  }, []);
  return request ? <ShutoffDialog key={`${request.planId}:${request.target.itemId ?? request.target.entity ?? request.target.roomId}:${request.target.medium}`} request={request} /> : null;
}
