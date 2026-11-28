"use client";
import { ArrowLeftIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { clearError, createPlan, deletePlan, reorderPlans, setDefaultPlan, useActivePlan } from "@/lib/activePlan";
import { fetchPlan, type Dashboard } from "@/lib/dbApi";
import { identityOf } from "@/lib/planFile";
import { homeName, loadHomes, useHomes } from "@/lib/homes";
import { MAX_PLANS } from "@/lib/planIdentity";
import { asPlan } from "@/lib/planThumb";
import { useStore } from "@/lib/store";
import HudPanel from "./HudPanel";
import HomesManager from "./HomesManager";
import MonoLabel from "./MonoLabel";
import PlanCard, { type CardActions } from "./PlanCard";
import { EditPlanForm, NewPlanForm } from "./PlanForm";
import { exportPlan } from "./planIO";
import { copyPlanLink, goToPlan, problemText, say, useShowsErrors, type PlansIntent } from "./planUi";
import "./dataPanel.css";
import "./plans.css";
import "./homes.css";

type View = { v: "list" } | { v: "new"; source: Dashboard | null } | { v: "edit"; id: number } | { v: "homes" };

/** The plan to export: the one on screen as it is now (it may have edits the server has not got yet), another one as the server has it. */
async function exportOf(d: Dashboard, onScreen: boolean): Promise<void> {
  if (onScreen) return exportPlan(useStore.getState().plan, identityOf(d, d.haConnection ? homeName(d.haConnection) : undefined));
  const reply = await fetchPlan(d.id);
  const plan = "plan" in reply && reply.plan !== null ? asPlan(reply.plan) : null;
  if (!plan) throw new Error("This plan has no drawing yet.");
  await exportPlan(plan, identityOf(d, d.haConnection ? homeName(d.haConnection) : undefined));
}

/** Why a plan cannot be deleted, in words (null = it can): the home plan and the last plan stay. */
const keepReason = (d: Dashboard, defaultId: number | null, count: number): string | null =>
  d.id === defaultId ? "This is the default plan, so it stays. Make another plan the default first." : count <= 1 ? "You need at least one plan." : null;

function initialView(intent: PlansIntent | undefined, list: Dashboard[] | null): View {
  if (intent?.do === "new") return { v: "new", source: null };
  if (intent?.do === "homes") return { v: "homes" };
  if (intent?.do === "edit" && list?.some((d) => d.id === intent.id)) return { v: "edit", id: intent.id };
  return { v: "list" };
}

/**
 * The plan manager (left panel): a card for every plan with its picture and numbers, "Show this plan", and under More: rename or edit, duplicate, make default,
 * copy a link, export, move, delete. New plans start from a form with big choices. Delete asks first and then the Undo message stays for 10 s (PlanNotices).
 */
export default function PlanManager({ onClose, intent }: { onClose: () => void; intent?: PlansIntent }) {
  const list = useActivePlan((s) => s.list);
  const here = useActivePlan((s) => s.id);
  const defaultId = useActivePlan((s) => s.defaultId);
  const switching = useActivePlan((s) => s.status === "switching");
  const error = useActivePlan((s) => s.error);
  const [view, setView] = useState<View>(() => initialView(intent, list));
  const [openId, setOpenId] = useState<number | null>(intent?.do === "edit" || intent?.do === "delete" ? intent.id : null);
  const [asking, setAsking] = useState<number | null>(intent?.do === "delete" ? intent.id : null);
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const plans = list ?? [];
  const full = plans.length >= MAX_PLANS;
  const editing = view.v === "edit" ? plans.find((d) => d.id === view.id) : undefined;
  const mode = view.v === "new" ? "new" : editing ? "edit" : view.v === "homes" ? "homes" : "list";
  const extraHomes = useHomes((s) => s.homes.length);
  useEffect(() => void loadHomes(), []); // the forms and the Homes line need the names
  useShowsErrors();

  /** Run one card action; a failure is already in the plan store's `error`, which the panel shows at its top. */
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) say(done);
    } catch (e) {
      if (!useActivePlan.getState().error) say(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
    setBusy(false);
  };

  const actionsFor = (d: Dashboard, i: number): CardActions => ({
    show: () => {
      setTarget(d.id);
      void goToPlan(d.id);
    },
    edit: () => setView({ v: "edit", id: d.id }),
    duplicate: () => void run(async () => { const copy = await createPlan({ from: "duplicate", sourceId: d.id, switchTo: false }); setOpenId(copy.id); }, `Copied "${d.name}".`),
    makeDefault: () => void run(() => setDefaultPlan(d.id), `"${d.name}" is the default plan now.`),
    copyLink: () => void copyPlanLink(d.id),
    exportFile: () => void run(() => exportOf(d, d.id === here)),
    move: (by) => {
      const ids = plans.map((p) => p.id);
      [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
      void run(() => reorderPlans(ids));
    },
    ask: () => setAsking(d.id),
    remove: () => {
      setAsking(null);
      void run(() => deletePlan(d.id));
    },
    stopAsking: () => setAsking(null),
  });

  const body =
    view.v === "new" ? (
      <NewPlanForm source={view.source} onDone={onClose} onCancel={() => setView({ v: "list" })} />
    ) : view.v === "homes" ? (
      <>
        <div className="pm-top">
          <button type="button" className="btn" onClick={() => setView({ v: "list" })}><ArrowLeftIcon size={14} aria-hidden />Back to plans</button>
        </div>
        <HomesManager />
      </>
    ) : editing ? (
      <EditPlanForm d={editing} onDone={() => setView({ v: "list" })} onCancel={() => setView({ v: "list" })} />
    ) : (
      <>
        <div className="pm-top">
          <button type="button" className="btn primary" disabled={full} onClick={() => setView({ v: "new", source: plans.find((d) => d.id === here) ?? null })}><PlusIcon size={14} aria-hidden />New plan</button>
          {full && <p className="hint">{`You have ${MAX_PLANS} plans, the most Doshy keeps. Delete one to make room.`}</p>}
        </div>
        {plans.length === 1 && !full && (
          <section className="pm-invite" aria-label="Create a second plan">
            <b>Create a second plan</b>
            <p>Keep a different layout, a garden, a holiday house or an idea you want to try. Switch between plans with one tap from the corner of the screen.</p>
          </section>
        )}
        {list === null ? (
          <p className="hint" role="status">Loading your plans...</p>
        ) : (
          <ul className="pm-grid" aria-label="Plans">
            {plans.map((d, i) => (
              <PlanCard
                key={d.id}
                d={d}
                a={actionsFor(d, i)}
                s={{
                  isHere: d.id === here,
                  isDefault: d.id === defaultId,
                  loading: switching && target === d.id,
                  switching,
                  open: openId === d.id,
                  asking: asking === d.id,
                  first: i === 0,
                  last: i === plans.length - 1,
                  keepReason: keepReason(d, defaultId, plans.length),
                  busy,
                  onToggle: () => setOpenId(openId === d.id ? null : d.id),
                }}
              />
            ))}
          </ul>
        )}
        <section className="hm-link" aria-label="Homes">
          <p><b>Homes:</b> {extraHomes === 0 ? "Main home" : `Main home + ${extraHomes} more`}</p>
          <button type="button" className="btn" onClick={() => setView({ v: "homes" })}>Manage homes</button>
        </section>
        <section className="pm-notes" aria-label="How plans work">
          <p><b>Default for new devices.</b> A phone or tablet that has never picked a plan shows the default plan. The curtain automation reads only the default plan.</p>
          <p><b>Each device remembers its plan.</b> A wall display can be pinned to one plan with its link: use Copy a link under More.</p>
          <p><b>Deleting.</b> The default plan and your last plan cannot be deleted. A deleted plan can be brought back with Undo straight away.</p>
        </section>
      </>
    );

  return (
    <HudPanel title={view.v === "homes" ? "Homes" : "Plans"} meta={view.v === "homes" ? `${extraHomes + 1} ${extraHomes === 0 ? "home" : "homes"}` : `${plans.length} of ${MAX_PLANS}`} onClose={onClose} className="drawer pm">
      <div className="pm-body">
        {error && mode === "list" && (
          <div className="pm-error" role="alert">
            <p>{problemText(error)}</p>
            <button type="button" className="btn" onClick={clearError}>Dismiss</button>
          </div>
        )}
        {mode === "list" && <MonoLabel>Your plans</MonoLabel>}
        {body}
      </div>
    </HudPanel>
  );
}
