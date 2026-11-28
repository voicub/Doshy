"use client";
import { PlusIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { clearError, createPlan, editPlan, useActivePlan, type NewPlan } from "@/lib/activePlan";
import type { Dashboard } from "@/lib/dbApi";
import { useHomeId } from "@/lib/useHomeId";
import { homeIdForName } from "@/lib/homeNames";
import { useHomes } from "@/lib/homes";
import { MAX_DESCRIPTION, MAX_NAME, freeName } from "@/lib/planIdentity";
import { THUMB_H, THUMB_W, thumbSvg } from "@/lib/planThumb";
import type { PlanIdentity } from "@/lib/planFile";
import { starterPlan } from "@/lib/starterPlan";
import type { Plan } from "@/lib/types";
import HomePick from "./HomePick";
import PlanLook from "./PlanLook";
import PlanThumb from "./PlanThumb";
import { readPlanImport } from "./planIO";
import { problemText, say } from "./planUi";
import MonoLabel from "./MonoLabel";

type Start = "blank" | "starter" | "duplicate" | "import";
type Imported = { plan: Plan; identity: PlanIdentity | null; file: string; name: string };

const BASE_NAME: Record<Start, string> = { blank: "New plan", starter: "Starter flat", duplicate: "", import: "Imported plan" };

/** A start choice as a big tile: a picture, a title and one line saying what you get. */
function Tile({ id, picked, title, text, onPick, children }: { id: Start; picked: boolean; title: string; text: string; onPick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" id={`pf-${id}`} aria-checked={picked} tabIndex={picked ? 0 : -1} className="pf-tile" onClick={onPick}>
      <span className="pf-pic">{children}</span>
      <b>{title}</b>
      <small>{text}</small>
    </button>
  );
}

const Dashed = () => (
  <svg className="pf-dashed" viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} aria-hidden>
    <rect x="100" y="62" width="120" height="76" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 5" />
    <path d="M160 88v24M148 100h24" stroke="currentColor" strokeWidth="2" />
  </svg>
);

/** What a new plan starts as: the "start from" choice first, then its name and look. */
export function NewPlanForm({ source, onDone, onCancel }: { source: Dashboard | null; onDone: (d: Dashboard) => void; onCancel: () => void }) {
  const plans = useActivePlan((s) => s.list);
  const names = useMemo(() => plans?.map((d) => d.name) ?? [], [plans]);
  const [start, setStart] = useState<Start>("blank"); // a copy is offered, never the default: most new plans are a fresh start
  const [name, setName] = useState(() => freeName(BASE_NAME.blank, names));
  const [named, setNamed] = useState(false); // once the name was typed it stays: choosing another start no longer renames it
  const [icon, setIcon] = useState("house");
  const [color, setColor] = useState("");
  const [about, setAbout] = useState("");
  const [imported, setImported] = useState<Imported | null>(null);
  const screenHome = useHomeId();
  const homes = useHomes((s) => s.homes);
  const [pick, setPick] = useState<string | null | undefined>(undefined); // undefined = not chosen yet: the default follows the start choice
  const fileHomeId = homeIdForName(homes, imported?.identity?.home);
  const defaultHome = start === "duplicate" && source ? source.haConnection : start === "import" && imported ? fileHomeId : screenHome;
  const home = pick === undefined ? defaultHome : pick;
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const starterPic = useMemo(() => `data:image/svg+xml,${encodeURIComponent(thumbSvg(starterPlan()))}`, []);

  const choose = (s: Start) => {
    setStart(s);
    setProblem(null);
    if (!named) setName(freeName(s === "duplicate" && source ? `${source.name} copy` : s === "import" && imported ? imported.name : BASE_NAME[s], names));
  };
  const pickImport = () => (imported && start !== "import" ? choose("import") : file.current?.click());

  const readFile = async (f: File) => {
    try {
      const got = await readPlanImport(f);
      const fileName = got.identity?.name ?? (f.name.replace(/\.json$/i, "") || BASE_NAME.import);
      setImported({ plan: got.plan, identity: got.identity, file: f.name, name: fileName });
      if (got.identity) {
        setIcon(got.identity.icon || "house");
        setColor(got.identity.color);
        setAbout(got.identity.description);
      }
      setStart("import");
      const known = useHomes.getState().homes;
      const wanted = got.identity?.home;
      const missing = wanted && homeIdForName(known, wanted) === null ? `This plan was on a home called "${wanted}", which this Doshy does not have, so it starts on Main home.` : null;
      setProblem([got.note, missing].filter(Boolean).join(" ") || null);
      if (!named) setName(freeName(fileName, names));
    } catch {
      setProblem("That file is not a plan Doshy can read. Pick a plan file that was exported from Doshy.");
    }
  };

  const keys = (e: KeyboardEvent) => {
    const order: Start[] = source ? ["blank", "starter", "duplicate", "import"] : ["blank", "starter", "import"];
    const i = order.indexOf(start);
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = order[(to + order.length) % order.length];
    if (next !== "import") choose(next); // the file dialog opens on a press, never on an arrow
    document.getElementById(`pf-${next}`)?.focus();
  };

  const make = async () => {
    const clean = name.trim();
    if (!clean) return setProblem("Give the plan a name.");
    if (start === "import" && !imported) return setProblem("Pick a plan file first.");
    const look = { icon, color, description: about.trim() };
    // a copy keeps its source's home on the server unless another one was picked; without extra homes nothing is sent (the form shows no choice)
    const link = homes.length === 0 || (start === "duplicate" && pick === undefined) ? {} : { haConnection: home };
    const input: NewPlan =
      start === "duplicate" && source ? { from: "duplicate", sourceId: source.id, name: clean, ...link }
      : start === "import" && imported ? { from: "import", plan: imported.plan, name: clean, ...look, ...link }
      : { from: start === "starter" ? "starter" : "blank", name: clean, ...look, ...link };
    setBusy(true);
    setProblem(null);
    try {
      const made = await createPlan(input);
      say(`Plan "${made.name}" is ready and shown now.`);
      onDone(made);
    } catch (e) {
      const why = useActivePlan.getState().error;
      clearError(); // shown here, next to the form, not as a message over the screen
      setProblem(why ? problemText(why) : e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <form className="pf" onSubmit={(e) => { e.preventDefault(); void make(); }} aria-label="New plan">
      <MonoLabel>Start from</MonoLabel>
      <div className="pf-tiles" role="radiogroup" aria-label="Start from" onKeyDown={keys}>
        <Tile id="blank" picked={start === "blank"} title="Blank" text="An empty home to draw yourself" onPick={() => choose("blank")}><Dashed /></Tile>
        <Tile id="starter" picked={start === "starter"} title="Starter flat" text="A furnished example to try things" onPick={() => choose("starter")}><img src={starterPic} alt="" draggable={false} /></Tile>
        {source && <Tile id="duplicate" picked={start === "duplicate"} title={`Copy of ${source.name}`} text="Same drawing, yours to change" onPick={() => choose("duplicate")}><PlanThumb d={source} draw /></Tile>}
        <Tile id="import" picked={start === "import"} title={imported ? "Plan file" : "Import a file"} text={imported ? imported.file : "A plan exported from Doshy"} onPick={pickImport}><UploadSimpleIcon size={34} aria-hidden /></Tile>
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readFile(f); }} />

      <label className="pf-field">
        <span className="label">Name</span>
        <input value={name} maxLength={MAX_NAME} autoComplete="off" onChange={(e) => { setName(e.target.value); setNamed(true); setProblem(null); }} />
      </label>
      <HomePick value={home} onChange={setPick} />
      {start !== "duplicate" && (
        <>
          <PlanLook icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
          <details className="pf-more">
            <summary>Add a description</summary>
            <textarea value={about} maxLength={MAX_DESCRIPTION} rows={2} aria-label="Description" onChange={(e) => setAbout(e.target.value)} />
          </details>
        </>
      )}
      {start === "duplicate" && <p className="hint">The copy looks like the original. Change its icon and colour afterwards with Edit.</p>}

      {problem && <p className="field-note warn" role="alert">{problem}</p>}
      <div className="pf-actions">
        <button type="submit" className="btn primary" disabled={busy}><PlusIcon size={14} aria-hidden />{busy ? "Creating..." : "Create plan"}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** Rename a plan and change its look. */
export function EditPlanForm({ d, onDone, onCancel }: { d: Dashboard; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(d.name);
  const [about, setAbout] = useState(d.description);
  const [icon, setIcon] = useState(d.icon || "house");
  const [color, setColor] = useState(d.color);
  const [home, setHome] = useState<string | null>(d.haConnection);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const clean = name.trim();
    if (!clean) return setProblem("Give the plan a name.");
    setBusy(true);
    setProblem(null);
    try {
      await editPlan(d.id, { name: clean, description: about.trim(), icon, color, haConnection: home });
      onDone();
    } catch (e) {
      const why = useActivePlan.getState().error;
      clearError();
      setProblem(why ? problemText(why) : e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <form className="pf" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={`Edit ${d.name}`}>
      <label className="pf-field">
        <span className="label">Name</span>
        <input value={name} maxLength={MAX_NAME} autoFocus autoComplete="off" onChange={(e) => { setName(e.target.value); setProblem(null); }} />
      </label>
      <label className="pf-field">
        <span className="label">Description (optional)</span>
        <textarea value={about} maxLength={MAX_DESCRIPTION} rows={2} onChange={(e) => setAbout(e.target.value)} />
      </label>
      <PlanLook icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
      <HomePick value={home} onChange={setHome} />
      {problem && <p className="field-note warn" role="alert">{problem}</p>}
      <div className="pf-actions">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
