"use client";
import { useActivePlan, dismissNotice, clearError, undoDeletePlan } from "@/lib/activePlan";
import { problemText, usePlanUi } from "./planUi";
import "./plans.css";

/** The words for a one-time notice. The plan now on screen is named, so "Showing Home." says which plan the screen went to. */
const NOTICE = {
  "plan-removed": (shown: string) => `This plan was deleted on another device. Showing ${shown}.`,
  "plan-missing": (shown: string) => `The plan this device was set to open no longer exists. Showing ${shown}.`,
} as const;

/**
 * Everything the plan feature says over the screen, in one stack under the top bar: the notice that the plan on screen was deleted elsewhere, the
 * Undo message after a delete (10 s, the plan store drives it), a short confirmation ("Link copied"), and a failed action (when no plan list is open to show it).
 */
export default function PlanNotices() {
  const notice = useActivePlan((s) => s.notice);
  const shown = useActivePlan((s) => s.list?.find((d) => d.id === s.id)?.name ?? "your home plan");
  const undo = useActivePlan((s) => s.undo);
  const error = useActivePlan((s) => s.error);
  const message = usePlanUi((s) => s.message);
  const lists = usePlanUi((s) => s.lists);
  const retry = usePlanUi((s) => s.retry);
  const loud = error !== null && lists === 0;
  if (!notice && !undo && !message && !loud) return null;

  return (
    <div className="pn-stack" aria-live="polite">
      {notice && (
        <div className="pn hud" role="status">
          <span>{NOTICE[notice](shown)}</span>
          <button type="button" className="btn" onClick={dismissNotice}>Dismiss</button>
        </div>
      )}
      {loud && (
        <div className="pn hud warn" role="alert">
          <span>{problemText(error)}</span>
          {retry && <button type="button" className="btn primary" onClick={() => { clearError(); retry(); }}>Try again</button>}
          <button type="button" className="btn" onClick={clearError}>Dismiss</button>
        </div>
      )}
      {undo && (
        <div className="pn hud" role="status">
          <span>{`Plan "${undo.name}" deleted.`}</span>
          <button type="button" className="btn primary" onClick={() => void undoDeletePlan().catch(() => undefined)}>Undo</button>
        </div>
      )}
      {message && (
        <div className="pn hud" role="status">
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
