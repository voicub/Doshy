"use client";
import { useEffect, useRef, useState } from "react";
import { ASSIST_TIMEOUT_MS, changedEntities, changedSentence, conversationFor, errorWords, nextConversation, parseAgents, readAssistReply, withTurn, type AssistAgent, type Conversation, type Turn } from "@/lib/assist";
import { useAssistSettings } from "@/lib/assistStore";
import { currentHome, haFetch, onHomeChange } from "@/lib/haHome";
import { isRecord } from "@/lib/guards";
import { assertLive } from "@/lib/replayGate";
import { useStore } from "@/lib/store";
import { useItemFocus } from "../scene/itemFocus";
import { useInbox } from "./inboxStore";

/** Explicit hand-off only: the local parser has already declined this sentence. Enter never invokes this button. */
export default function CommandAssist({ text, eligible }: { text: string; eligible: boolean }) {
  const settings = useAssistSettings();
  const [agents, setAgents] = useState<AssistAgent[]>([]);
  const [language, setLanguage] = useState<string>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const conversation = useRef<Conversation | null>(null);
  const pending = useRef<AbortController | null>(null);
  const active = eligible && settings.handoff === "ask";
  useEffect(() => {
    return onHomeChange(() => { pending.current?.abort(); conversation.current = null; setTurns([]); setAgents([]); setLanguage(undefined); setBusy(false); setConsent(false); });
  }, []);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void haFetch("/api/ha/assist/agents", { signal: controller.signal }).then(async (res) => {
      const raw: unknown = await res.json();
      if (!res.ok) throw new Error(isRecord(raw) && typeof raw.error === "string" ? raw.error : "Assist agent list is unavailable.");
      setAgents(parseAgents(raw));
      setLanguage(isRecord(raw) && typeof raw.language === "string" ? raw.language : undefined);
    }).catch((e: unknown) => { if (!controller.signal.aborted) setProblem(e instanceof Error ? e.message : "Assist agent list is unavailable."); });
    return () => controller.abort();
  }, [active]);

  const ask = async () => {
    if (!active || busy || (!settings.explained && !consent)) return;
    settings.patch({ explained: true });
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setProblem("");
    const home = currentHome();
    const before = useStore.getState().states;
    const timer = setTimeout(() => controller.abort(), ASSIST_TIMEOUT_MS);
    try {
      assertLive(); // history replay or a guest page: nothing may reach Home Assistant
      const id = conversationFor(conversation.current, settings.agentId, Date.now());
      const res = await haFetch("/api/ha/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, text, ...(settings.agentId ? { agent_id: settings.agentId } : {}), ...(id ? { conversation_id: id } : {}), ...(language ? { language } : {}) }), signal: controller.signal });
      const raw: unknown = await res.json();
      if (!res.ok) throw new Error(isRecord(raw) && typeof raw.error === "string" ? raw.error : "Home Assistant could not answer.");
      const reply = readAssistReply(raw);
      if (!reply) throw new Error("Home Assistant sent an unreadable Assist answer.");
      if (controller.signal.aborted || currentHome() !== home) return;
      conversation.current = nextConversation(reply, settings.agentId, Date.now());
      setTurns((old) => withTurn(old, { said: text, reply }));
      if (settings.speak && reply.speech && "speechSynthesis" in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply.speech)); }
      // Observe normal polls (including delayed device updates), never infer a successful change from speech.
      const seen = new Set<string>();
      let stop = () => {};
      const publish = () => {
        if (currentHome() !== home) return stop();
        const { states, plan } = useStore.getState();
        const fresh = changedEntities(before, states).filter((entity) => !seen.has(entity));
        if (!fresh.length) return;
        fresh.forEach((entity) => seen.add(entity));
        const names = [...seen].map((entity) => states[entity]?.attributes.friendly_name ?? entity);
        useInbox.setState({ toast: { id: `assist:${Date.now()}`, title: "Home Assistant Assist", message: changedSentence(names), created_at: new Date().toISOString() } });
        fresh.forEach((entity, i) => { const item = plan.items.find((it) => it.entity === entity); if (item) setTimeout(() => { if (currentHome() === home) useItemFocus.getState().pulseItem(item.id); }, i * 1600); });
      };
      stop = useStore.subscribe(publish);
      publish();
      setTimeout(stop, 10_000);
      void useStore.getState().refreshStates();
    } catch (e) {
      if (currentHome() === home) setProblem(controller.signal.aborted ? "Stopped waiting. Home Assistant may already have carried this out; check its state before asking again." : e instanceof Error ? e.message : "Assist could not answer.");
    } finally { clearTimeout(timer); if (pending.current === controller) { pending.current = null; setBusy(false); } }
  };
  if (!active && !busy && !turns.length) return null;
  return <section className="cbx" aria-label="Home Assistant Assist">
    {active && <>
      <p className="hint">Home Assistant will carry this out right away and can control whatever your Assist settings expose.</p>
      {!settings.explained && <label className="hint"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I understand Assist executes immediately, without another confirmation.</label>}
      <label className="hint">Conversation agent <select aria-label="Conversation agent" value={settings.agentId} disabled={busy} onChange={(e) => { settings.patch({ agentId: e.target.value }); conversation.current = null; setTurns([]); }}>
        <option value="">Home Assistant default</option>{settings.agentId && !agents.some((a) => a.id === settings.agentId) && <option value={settings.agentId}>{settings.agentId} (unavailable)</option>}{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></label>
      <button type="button" className="btn primary" disabled={busy || (!settings.explained && !consent)} onClick={() => void ask()}>Ask Home Assistant Assist</button>
    </>}
    {busy && <div role="status">Assist is thinking… <button type="button" className="btn" onClick={() => pending.current?.abort()}>Cancel</button></div>}
    {problem && <p role="alert" className="hint">{problem}</p>}
    {!!turns.length && <><div role="log" aria-label="Assist conversation">{turns.map((turn, i) => <div key={i}><small>{turn.said}</small><p>{turn.reply.speech || (turn.reply.kind === "done" ? "Home Assistant completed the request." : "Assist did not provide a spoken answer.")}</p>{turn.reply.kind === "error" && <p role="alert">{errorWords(turn.reply.code)}</p>}{!!turn.reply.failed.length && <p>Could not change: {turn.reply.failed.map((t) => t.name).join(", ")}</p>}</div>)}</div><button type="button" className="btn" disabled={busy} onClick={() => { conversation.current = null; setTurns([]); setProblem(""); }}>Reset conversation</button></>}
  </section>;
}
