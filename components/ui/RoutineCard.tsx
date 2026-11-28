"use client";
import { CheckIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { automationId, buildAutomation, describeRecipe, toYaml, validateRecipe } from "@/lib/automations";
import { startsSomething } from "@/lib/deviceAction";
import { errorMessage } from "@/lib/guards";
import type { HAState } from "@/lib/ha";
import type { Suggestion } from "@/lib/routines";
import { recipeOf } from "@/lib/routinesRecipe";
import { wordsOf } from "@/lib/routinesWords";
import { createAutomation } from "@/lib/sceneApi";
import type { SceneDevice } from "@/lib/sceneDevices";
import { KIND_ICON } from "./sceneIcons";
import DeviceGlyph from "./DeviceGlyph";

type Step = "idle" | "edit" | "confirm" | "done";

const label = (states: Record<string, HAState>) => (entity: string) => states[entity]?.attributes.friendly_name ?? entity;

/** The last 14 days as dots: filled = it happened, hollow = it did not, a dash = the idea does not apply that day. */
function Strip({ s }: { s: Suggestion }) {
  const hits = s.strip.filter((c) => c === "hit").length;
  const days = s.strip.filter((c) => c !== "off").length;
  return (
    <div className="rt-strip" role="img" aria-label={`Of the last ${s.strip.length} days, it happened on ${hits} of the ${days} that count`}>
      <span className="rt-dots" aria-hidden>
        {s.strip.map((c, i) => <i key={i} data-c={c} />)}
      </span>
      <span className="rt-strip-caption" aria-hidden><span>{`${s.strip.length} days ago`}</span><span>yesterday</span></span>
    </div>
  );
}

/**
 * One idea: what the home does, how often, and the buttons. "Make it automatic" goes to the same confirmation the Automations sheet has (the plain sentence, the Home Assistant
 * automation folded, then an explicit "Yes, create it"); the server checks the recipe again from scratch before anything is made.
 */
export default function RoutineCard({ s, device, states, onLater, onNever, onCreated }: { s: Suggestion; device: SceneDevice | undefined; states: Record<string, HAState>; onLater: () => void; onNever: () => void; onCreated: (summary: string) => void }) {
  const name = label(states);
  const words = wordsOf(s, name);
  const hasHomeZone = !!states["zone.home"];
  const guard = s.kind === "routine" && startsSomething(s.action);
  const [step, setStep] = useState<Step>("idle");
  const [time, setTime] = useState(s.kind === "routine" && s.when.kind === "clock" ? s.when.time : "");
  const [offset, setOffset] = useState(s.kind === "routine" && s.when.kind === "sun" ? s.when.offset : 0);
  const [minutes, setMinutes] = useState(s.kind === "idle" ? s.minutes : 0);
  const [onlyHome, setOnlyHome] = useState(guard && hasHomeZone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checked = useMemo(() => {
    const recipe = recipeOf(s, { time: time || undefined, offset, minutes: minutes || undefined, onlyHome });
    const v = validateRecipe(recipe, { states, notify: [] });
    if (!v.ok) return v;
    return { ok: true as const, recipe: v.recipe, words: describeRecipe(v.recipe, label(states)), yaml: toYaml(buildAutomation(v.recipe, automationId(v.recipe.type, "preview"), label(states)).config) };
  }, [s, time, offset, minutes, onlyHome, states]);

  const create = async () => {
    if (!checked.ok) return;
    setBusy(true);
    setError(null);
    try {
      await createAutomation(checked.recipe);
      setStep("done");
      onCreated(checked.words);
    } catch (e) {
      setError(errorMessage(e));
      setStep("idle");
    } finally {
      setBusy(false);
    }
  };

  if (step === "done" && checked.ok) {
    return (
      <li className="rt-card" data-done>
        <p className="rt-done"><CheckIcon size={16} weight="bold" aria-hidden /> <span>{`Made: ${checked.words}. It is in Home Assistant now, and in Doshy's automations list where you can switch it off.`}</span></p>
      </li>
    );
  }

  const sunEvent = s.kind === "routine" && s.when.kind === "sun" ? s.when.event : null;
  return (
    <li className="rt-card">
      <div className="rt-head">
        <span className="rt-ico" aria-hidden><DeviceGlyph entity={s.entity} fallback={device ? KIND_ICON[device.kind] : undefined} /></span>
        <span className="rt-who"><b>{device?.name ?? name(s.entity)}</b><small>{device?.room ?? ""}</small></span>
      </div>
      <p className="rt-habit">{words.habit}</p>
      <p className="rt-seen">{words.seen}</p>
      <Strip s={s} />
      <p className="rt-ask">{words.question}</p>

      {(step === "edit" || step === "confirm") && (
        <div className="rt-edit">
          {s.kind === "routine" && s.when.kind === "clock" && (
            <label className="am-field"><span className="label">At what time</span><input type="time" value={time} onChange={(e) => { setTime(e.target.value); setStep("edit"); }} /></label>
          )}
          {sunEvent && (
            <label className="am-field"><span className="label">{`Minutes after ${sunEvent} (a minus sign means before)`}</span><input type="number" min={-180} max={180} step={5} inputMode="numeric" value={offset} onChange={(e) => { setOffset(Math.round(Number(e.target.value))); setStep("edit"); }} /></label>
          )}
          {s.kind === "idle" && (
            <label className="am-field"><span className="label">Minutes without movement</span><input type="number" min={1} max={240} step={1} inputMode="numeric" value={minutes} onChange={(e) => { setMinutes(Math.round(Number(e.target.value))); setStep("edit"); }} /></label>
          )}
          {guard && (hasHomeZone ? (
            <label className="rt-check"><input type="checkbox" checked={onlyHome} onChange={(e) => { setOnlyHome(e.target.checked); setStep("edit"); }} /><span>Only when someone is home</span></label>
          ) : (
            <p className="field-note">Home Assistant has no home zone, so Doshy cannot tell whether anyone is home: this would also run while you are away.</p>
          ))}
        </div>
      )}

      {step === "confirm" && (
        <section className="am-preview" aria-label="What this will do" aria-live="polite">
          <span className="label">What this will do</span>
          {checked.ok ? <p className="am-words">{checked.words}.</p> : <p className="field-note warn">{checked.error}</p>}
          {checked.ok && (
            <details className="am-yaml">
              <summary className="label">The Home Assistant automation</summary>
              <pre tabIndex={0}>{checked.yaml}</pre>
            </details>
          )}
        </section>
      )}

      {error && <p className="field-note warn" role="alert">{error}</p>}
      {step === "confirm" && checked.ok ? (
        <div className="am-confirm" role="alert">
          <span>This adds an automation to your Home Assistant. It starts working straight away. You can switch it off or delete it from the Doshy automations list.</span>
          <div className="am-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void create()}>{busy ? "Creating..." : "Yes, create it"}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setStep("idle")}>Not yet</button>
          </div>
        </div>
      ) : (
        <div className="rt-actions">
          <button type="button" className="btn primary" disabled={!checked.ok} onClick={() => setStep("confirm")}>Make it automatic</button>
          {step === "idle" && <button type="button" className="btn" onClick={() => setStep("edit")}>{s.kind === "routine" && s.when.kind === "clock" ? "Edit time first" : "Edit first"}</button>}
          {step === "edit" && !checked.ok && <p className="field-note warn" role="alert">{checked.error}</p>}
          <button type="button" className="btn" onClick={onLater}>Not now</button>
          <button type="button" className="btn" onClick={onNever}>Never suggest this</button>
        </div>
      )}
    </li>
  );
}
