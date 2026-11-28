"use client";
import { CheckIcon, MicrophoneIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { parseCommand, type Pick, type Reply } from "@/lib/commandParse";
import { useStore } from "@/lib/store";
import { useCommandContext } from "./commandContext";
import { runSteps } from "./scenesRun";
import { listen, voiceAvailable } from "./voice";
import "./commandBox.css";
import CommandAssist from "./CommandAssist";
import { offersAssist } from "@/lib/assist";
import { useAssistSettings } from "@/lib/assistStore";

type Understood = {
  text: string;
  reply: Reply | null;
  setPick: (p: Pick | undefined) => void;
  /** Run what was understood (only a thing to do: a question has already been answered). Says whether it did. */
  confirm: () => boolean;
  /** A few things to try, made from this home's own rooms and scenes. */
  examples: string[];
};

/** What the box makes of `q`, live as it is typed. */
export function useAsk(q: string): Understood {
  const ctx = useCommandContext();
  const [asked, setAsked] = useState<{ q: string; pick: Pick } | null>(null);
  // an answer to "which room?" belongs to the text it was given for
  const pick = asked && asked.q === q ? asked.pick : undefined;
  const reply = useMemo(() => (q.trim() ? parseCommand(q, ctx, pick) : null), [q, ctx, pick]);
  const confirm = () => {
    if (reply?.kind !== "run") return false;
    void runSteps(reply.scene ?? reply.summary, reply.steps, !reply.scene);
    return true;
  };
  const examples = useMemo(() => {
    const light = ctx.devices.find((d) => d.kind === "light");
    const warm = ctx.devices.find((d) => d.kind === "climate");
    const win = ctx.contacts.find((c) => c.kind === "window");
    return [
      ...(light ? [`Turn off the lights in ${light.room}`] : []),
      ...(ctx.devices.some((d) => d.kind === "cover") ? ["Close all curtains"] : []),
      ...(ctx.scenes[0] ? [`Run ${ctx.scenes[0].name}`] : []),
      ...(warm ? [`Set ${warm.room} to 21`] : []),
      ...(win ? [`Is the ${win.room} window open?`] : []),
    ];
  }, [ctx]);
  return { text: q, reply, setPick: (p) => setAsked(p ? { q, pick: p } : null), confirm, examples };
}

/** The microphone button (only where the browser can listen on this device): fills the box with what was heard. */
export function Mic({ onText }: { onText: (text: string) => void }) {
  const [stop, setStop] = useState<(() => void) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [can, setCan] = useState(false);
  useEffect(() => setCan(voiceAvailable()), []);
  useEffect(() => () => stop?.(), [stop]);
  if (!can) return null;
  const toggle = () => {
    if (stop) return stop();
    setProblem(null);
    const stopper = listen(onText, (p) => {
      setStop(null);
      if (p) setProblem(p);
    });
    setStop(stopper ? () => stopper : null);
  };
  return (
    <>
      <button type="button" className={`icon-btn cbx-mic ${stop ? "on" : ""}`} aria-pressed={!!stop} aria-label={stop ? "Stop listening" : "Speak a command"} onClick={toggle}><MicrophoneIcon size={16} weight={stop ? "fill" : "regular"} /></button>
      {problem && <span className="sr-only" role="alert">{problem}</span>}
    </>
  );
}

const nameOf = (entity: string) => useStore.getState().states[entity]?.attributes.friendly_name ?? entity;

/** The box's answer under the text field: what it understood with a Confirm button, the answer to a question, a question back, or why not. */
function LocalAskResult({ ask, onExample, onDone }: { ask: Understood; onExample: (text: string) => void; onDone: () => void }) {
  const { reply, setPick, confirm, examples } = ask;
  if (!reply) {
    return (
      <div className="cbx" aria-live="polite">
        <p className="cbx-help">Type what you want in plain words. I will say what I understood and wait for your OK before changing anything.</p>
        <div className="eb-chips" role="group" aria-label="Examples">
          {examples.map((e) => <button key={e} type="button" className="eb-chip cbx-ex" onClick={() => onExample(e)}>{e}</button>)}
        </div>
      </div>
    );
  }
  if (reply.kind === "run") {
    const names = reply.entities.map(nameOf);
    return (
      <div className="cbx" aria-live="polite">
        <span className="label">I understood</span>
        <p className="cbx-said">{reply.summary}</p>
        <p className="cbx-list">{names.length > 8 ? `${names.slice(0, 8).join(", ")} and ${names.length - 8} more` : names.join(", ")}</p>
        <div className="cbx-actions">
          <button type="button" className="btn primary" onClick={() => confirm() && onDone()}><CheckIcon size={14} /> Confirm</button>
          <span className="cbx-key" aria-hidden>ENTER</span>
        </div>
      </div>
    );
  }
  if (reply.kind === "answer") return <div className="cbx" role="status"><span className="label">Answer</span><p className="cbx-said">{reply.text}</p></div>;
  if (reply.kind === "ask") {
    return (
      <div className="cbx" role="group" aria-label={reply.question}>
        <p className="cbx-said">{reply.question}</p>
        <div className="eb-chips">{reply.options.map((o) => <button key={o.label} type="button" className="eb-chip cbx-ex" onClick={() => setPick(o.pick)}>{o.label}</button>)}</div>
      </div>
    );
  }
  return <div className="cbx" role="status"><p className="cbx-no">{reply.message}</p></div>;
}

export function AskResult(props: { ask: Understood; onExample: (text: string) => void; onDone: () => void }) {
  const mode = useAssistSettings((s) => s.handoff);
  return <><LocalAskResult {...props} /><CommandAssist text={props.ask.text} eligible={offersAssist(props.ask.reply, mode, props.ask.text)} /></>;
}
