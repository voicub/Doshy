"use client";
import { useMemo, useState, type ReactNode } from "react";
import { automationId, buildAutomation, DAYS_WORDS, describeRecipe, toYaml, validateRecipe, type Days, type Recipe, type RecipeType } from "@/lib/automations";
import { automationChoices, recipesFor, type Option } from "@/lib/automationChoices";
import { errorMessage } from "@/lib/guards";
import { createAutomation } from "@/lib/sceneApi";
import { useStore } from "@/lib/store";
import type { RoutineSeed } from "@/lib/advisor";
import { WEEKDAY_IDS } from "@/lib/weekdays";

/** Forecast advice is a proposed device schedule, edited and confirmed here just like the other builder recipes. It never runs on opening. */
export function SeededAutomationBuilder({ seed, onCreated }: { seed: RoutineSeed; onCreated: () => void }) {
  const states = useStore((s) => s.states);
  const [time, setTime] = useState(seed.time);
  const [onlyHome, setOnlyHome] = useState(!!states["zone.home"]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = validateRecipe({ type: "device-at", entity: seed.entity, action: seed.action, time, days: WEEKDAY_IDS, onlyHome }, { states, notify: [] });
  const label = (entity: string) => states[entity]?.attributes.friendly_name ?? entity;
  const preview = checked.ok ? { words: describeRecipe(checked.recipe, label), yaml: toYaml(buildAutomation(checked.recipe, automationId("device-at", "preview"), label).config) } : null;
  const create = async () => {
    if (!checked.ok) return;
    setBusy(true);
    setError(null);
    try { await createAutomation(checked.recipe); onCreated(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <div className="am-new">
    <p className="field-note">This makes a repeating daily routine, not a one-off forecast reminder. Prices and weather change: review it before keeping it enabled. A smart plug may only power an appliance, not start its cycle; check the appliance supports unattended starts.</p>
    <label className="am-field"><span className="label">At what time</span><input type="time" value={time} onChange={(e) => { setTime(e.target.value); setConfirming(false); }} /></label>
    {states["zone.home"] && <label><input type="checkbox" checked={onlyHome} onChange={(e) => { setOnlyHome(e.target.checked); setConfirming(false); }} /> Only when someone is home</label>}
    <section className="am-preview" aria-label="What this will do" aria-live="polite">
      <span className="label">What this will do</span>
      {preview ? <><p className="am-words">{preview.words}.</p><details className="am-yaml"><summary>The Home Assistant automation</summary><pre tabIndex={0}>{preview.yaml}</pre></details></> : <p className="field-note warn">{checked.ok ? "" : checked.error}</p>}
    </section>
    {error && <p role="alert" className="field-note warn">{error}</p>}
    {confirming && checked.ok ? <div className="am-confirm" role="alert"><span>This adds an automation to Home Assistant. It starts working straight away.</span><div className="am-actions"><button type="button" className="btn primary" disabled={busy} onClick={() => void create()}>{busy ? "Creating..." : "Yes, create it"}</button><button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>Not yet</button></div></div> : <button type="button" className="btn primary" disabled={!checked.ok} onClick={() => setConfirming(true)}>Create in Home Assistant</button>}
  </div>;
}

const RECIPE_TITLE: Record<RecipeType, string> = {
  "open-after": "Tell me if a window or door is open late",
  "notify-open": "Tell me when a window or door opens",
  "light-off-no-motion": "Turn lights off when nobody is moving",
  "curtains-sun": "Close curtains when the sun is high",
  "scene-at": "Run a scene at a set time",
};

type Form = { contact: string; motion: string; lights: string[]; covers: string[]; time: string; minutes: number; elevation: number; sceneId: string; days: Days; notify: string };

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Select({ label, value, options, onChange, children }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; children?: ReactNode }) {
  return (
    <label className="am-field">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!options.some((o) => o.entity === value) && <option value="">Choose...</option>}
        {options.map((o) => <option key={o.entity} value={o.entity}>{o.room === "Elsewhere" ? o.name : `${o.name} (${o.room})`}</option>)}
      </select>
      {children}
    </label>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="am-field" role="group" aria-label={label}>
      <span className="label">{label}</span>
      <div className="eb-chips">
        {options.map((o) => <button key={o.entity} type="button" className="eb-chip" aria-pressed={value.includes(o.entity)} onClick={() => onChange(toggle(value, o.entity))}>{o.name}</button>)}
        {!options.length && <span className="field-note">None linked in this plan.</span>}
      </div>
    </div>
  );
}

/** The recipe the form describes, as the plain data the server checks. */
function recipeOf(type: RecipeType, f: Form, scene: { name: string; steps: unknown } | undefined): unknown {
  switch (type) {
    case "open-after": return { type, entity: f.contact, time: f.time, notify: f.notify };
    case "notify-open": return { type, entity: f.contact, notify: f.notify };
    case "light-off-no-motion": return { type, motion: f.motion, lights: f.lights, minutes: f.minutes };
    case "curtains-sun": return { type, covers: f.covers, elevation: f.elevation };
    case "scene-at": return { type, name: scene?.name, steps: scene?.steps, time: f.time, days: f.days };
  }
}

/**
 * "Make it do something": pick a recipe, fill in a few plain choices, read what it will do (in words and as the Home Assistant automation), and only then press
 * Create in Home Assistant. The server builds and checks the automation itself from the same recipe, so what is shown here is what gets made.
 */
export default function AutomationBuilder({ target, notify, onCreated }: { target: string | null; notify: string[]; onCreated: () => void }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const choices = useMemo(() => automationChoices(plan, states), [plan, states]);
  const types = useMemo(() => recipesFor(target, states), [target, states]);
  const scenes = plan.scenes ?? [];
  const room = (entity: string) => [...choices.lights, ...choices.covers, ...choices.motion, ...choices.contacts].find((o) => o.entity === entity)?.room;
  const [type, setType] = useState<RecipeType>(types[0]);
  const [f, setF] = useState<Form>(() => {
    const isLight = !!target && choices.lights.some((o) => o.entity === target);
    const isCover = !!target && choices.covers.some((o) => o.entity === target);
    const isMotion = !!target && choices.motion.some((o) => o.entity === target);
    const lightRoom = isLight ? room(target) : undefined;
    const motion = isMotion ? target : (choices.motion.find((m) => m.room === lightRoom) ?? choices.motion[0])?.entity ?? "";
    return {
      contact: target && !isLight && !isMotion ? target : (choices.contacts[0]?.entity ?? ""),
      motion,
      lights: isLight ? [target] : isMotion ? choices.lights.filter((l) => l.room === room(target)).map((l) => l.entity) : [],
      covers: isCover ? [target] : [],
      time: "22:00", minutes: 10, elevation: 35, sceneId: scenes[0]?.id ?? "", days: "every", notify: notify[0] ?? "",
    };
  });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Form>) => { setF((x) => ({ ...x, ...p })); setConfirming(false); setError(null); };

  const scene = scenes.find((s) => s.id === f.sceneId);
  const checked = useMemo(() => validateRecipe(recipeOf(type, f, scene), { states, notify }), [type, f, scene, states, notify]);
  const preview = useMemo(() => {
    if (!checked.ok) return null;
    const label = (entity: string) => states[entity]?.attributes.friendly_name ?? entity;
    return { words: describeRecipe(checked.recipe, label), yaml: toYaml(buildAutomation(checked.recipe, automationId(checked.recipe.type, "preview"), label).config) };
  }, [checked, states]);
  const needsNotify = type === "open-after" || type === "notify-open";

  const create = async (recipe: Recipe) => {
    setBusy(true);
    setError(null);
    try {
      await createAutomation(recipe);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="am-new">
      <div className="am-recipes" role="radiogroup" aria-label="What should happen">
        {types.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={t === type} className="am-recipe" onClick={() => { setType(t); setConfirming(false); setError(null); }}>{RECIPE_TITLE[t]}</button>
        ))}
      </div>

      {(type === "open-after" || type === "notify-open") && <Select label="Which window or door" value={f.contact} options={choices.contacts} onChange={(contact) => set({ contact })} />}
      {type === "open-after" && (
        <label className="am-field"><span className="label">After what time</span><input type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} /></label>
      )}
      {type === "light-off-no-motion" && (
        <>
          <Select label="Motion sensor" value={f.motion} options={choices.motion} onChange={(motion) => set({ motion })} />
          <Chips label="Lights to turn off" options={choices.lights} value={f.lights} onChange={(lights) => set({ lights })} />
          <label className="am-field"><span className="label">Minutes without movement</span><input type="number" min={1} max={240} step={1} inputMode="numeric" value={f.minutes} onChange={(e) => set({ minutes: Math.round(Number(e.target.value)) })} /></label>
        </>
      )}
      {type === "curtains-sun" && (
        <>
          <Chips label="Curtains to close" options={choices.covers} value={f.covers} onChange={(covers) => set({ covers })} />
          <label className="am-field"><span className="label">{`Sun higher than ${f.elevation} degrees`}</span><input type="range" className="rng" min={5} max={60} value={f.elevation} onChange={(e) => set({ elevation: Number(e.target.value) })} /></label>
        </>
      )}
      {type === "scene-at" && (
        <>
          {scenes.length ? (
            <label className="am-field"><span className="label">Which scene</span><select value={f.sceneId} onChange={(e) => set({ sceneId: e.target.value })}>{scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          ) : (
            <p className="field-note warn">Make a scene first (Scenes in the dock), then it can run by itself.</p>
          )}
          <label className="am-field"><span className="label">At what time</span><input type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} /></label>
          <div className="am-field" role="group" aria-label="Which days">
            <span className="label">Which days</span>
            <div className="seg">{(Object.keys(DAYS_WORDS) as Days[]).map((d) => <button key={d} type="button" aria-pressed={f.days === d} onClick={() => set({ days: d })}>{d === "every" ? "Every day" : d === "weekdays" ? "Weekdays" : "Weekend"}</button>)}</div>
          </div>
        </>
      )}
      {needsNotify && (notify.length ? (
        <label className="am-field">
          <span className="label">Tell me through</span>
          <select value={f.notify} onChange={(e) => set({ notify: e.target.value })}>
            {!notify.includes(f.notify) && <option value="">Choose...</option>}
            {notify.map((n) => <option key={n} value={n}>{n.replace(/^notify\./, "").replace(/_/g, " ")}</option>)}
          </select>
        </label>
      ) : (
        <p className="field-note warn">Home Assistant has no notification service yet. Install the Home Assistant app on your phone (it adds one), then reopen this.</p>
      ))}

      <section className="am-preview" aria-label="What this will do" aria-live="polite">
        <span className="label">What this will do</span>
        {preview ? <p className="am-words">{preview.words}.</p> : <p className="field-note warn">{checked.ok ? "" : checked.error}</p>}
        {preview && (
          <details className="am-yaml">
            <summary className="label">The Home Assistant automation</summary>
            <pre tabIndex={0}>{preview.yaml}</pre>
          </details>
        )}
      </section>

      {error && <p className="field-note warn" role="alert">{error}</p>}
      {confirming && checked.ok ? (
        <div className="am-confirm" role="alert">
          <span>This adds an automation to your Home Assistant. It starts working straight away. You can switch it off or delete it from the Doshy automations list.</span>
          <div className="am-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void create(checked.recipe)}>{busy ? "Creating..." : "Yes, create it"}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>Not yet</button>
          </div>
        </div>
      ) : (
        <div className="am-actions"><button type="button" className="btn primary" disabled={!checked.ok} onClick={() => setConfirming(true)}>Create in Home Assistant</button></div>
      )}
    </div>
  );
}
