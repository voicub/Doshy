"use client";
import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type Ref } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { useChromeUi } from "./chromeUi";
import MonoLabel from "./MonoLabel";
import PlanPicker from "./PlanPicker";
import { PlanGlyph } from "./planUi";
import useRestoreFocus from "./useRestoreFocus";
import { useClickAway } from "./useDismiss";
import useReportInset from "./useReportInset";
import useSwipeClose from "./useSwipeClose";
import "./plans.css";

/** What the corner shows: the plan on screen (icon in its colour, name) and a caret. While another plan loads it says so. */
export function PlanChip({ open, onClick, compact, btn }: { open: boolean; onClick: () => void; compact?: boolean; btn?: Ref<HTMLButtonElement> }) {
  const d = useActivePlan((s) => s.list?.find((x) => x.id === s.id) ?? null);
  const switching = useActivePlan((s) => s.status === "switching");
  const name = switching ? "Switching..." : (d?.name ?? "Plan");
  return (
    <button ref={btn} type="button" className={`ps-chip ${compact ? "compact" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-label={`Plan: ${d?.name ?? "loading"}. Switch plan`} title="Switch plan" onClick={onClick}>
      <PlanGlyph icon={d?.icon ?? "house"} color={d?.color ?? ""} size={compact ? 20 : 15} />
      <span className="ps-name">{name}</span>
      <CaretDownIcon size={12} aria-hidden className="ps-caret" />
    </button>
  );
}

/** The corner switcher of the regular layout: the chip, and under it a small panel with the list. Esc or a click elsewhere closes it and the chip gets the focus back. */
export default function PlanSwitcher({ onNew, onManage }: { onNew: () => void; onManage: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useClickAway(root, () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const rows = root.current?.querySelectorAll<HTMLElement>('[role="option"]');
    (root.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') ?? rows?.[0])?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  const onBlur = (e: FocusEvent) => {
    if (open && e.relatedTarget instanceof Node && !root.current?.contains(e.relatedTarget)) setOpen(false); // Tab went on to something else
  };
  const then = (next: () => void) => () => {
    setOpen(false);
    next();
  };

  return (
    <div ref={root} className="ps" onKeyDown={onKey} onBlur={onBlur}>
      <PlanChip btn={btn} open={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="ps-pop hud brackets" role="dialog" aria-label="Plans">
          <PlanPicker onDone={close} onNew={then(onNew)} onManage={then(onManage)} />
        </div>
      )}
    </div>
  );
}

/** The switcher on a compact screen: a sheet like the menu (side sheet in landscape, bottom sheet in portrait), opened from the strip's plan chip. */
export function PlanSheet({ onNew, onManage }: { onNew: () => void; onManage: () => void }) {
  const close = () => useChromeUi.getState().setPlans(false);
  const root = useRef<HTMLElement>(null);
  const swipe = useSwipeClose(close);
  useReportInset(root);
  useRestoreFocus();
  useEffect(() => root.current?.focus(), []);
  const then = (next: () => void) => () => {
    close();
    next();
  };

  return (
    <aside ref={root} className="csheet ps-sheet hud brackets" role="dialog" aria-label="Plans" tabIndex={-1}>
      <header className="csheet-head" {...swipe}>
        <MonoLabel>Plans</MonoLabel>
        <button type="button" className="icon-btn csheet-close" aria-label="Close plans" onClick={close}><XIcon size={18} /></button>
      </header>
      <div className="csheet-body">
        <PlanPicker onDone={close} onNew={then(onNew)} onManage={then(onManage)} />
      </div>
    </aside>
  );
}
