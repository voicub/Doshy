"use client";
import { CheckIcon, PlusIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { useRef, useState, type KeyboardEvent } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { countsText } from "@/lib/planLabels";
import { HomeTag } from "./HomePick";
import PlanThumb from "./PlanThumb";
import { PlanGlyph, goToPlan, problemText, useShowsErrors } from "./planUi";

/**
 * The list of plans with one tap to switch, shared by the corner popover and the compact sheet. A listbox: Up / Down / Home / End move between plans,
 * Enter or Space switches. `onDone` runs after a switch worked (the container closes); a failed switch stays open and says why, with Try again.
 */
export default function PlanPicker({ onDone, onNew, onManage }: { onDone: () => void; onNew: () => void; onManage: () => void }) {
  const list = useActivePlan((s) => s.list);
  const active = useActivePlan((s) => s.id);
  const defaultId = useActivePlan((s) => s.defaultId);
  const switching = useActivePlan((s) => s.status === "switching");
  const error = useActivePlan((s) => s.error);
  const [target, setTarget] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useShowsErrors();

  const go = async (id: number) => {
    if (id === active) return onDone();
    setTarget(id);
    if (await goToPlan(id)) onDone();
    // a failed switch keeps `target`: the message below offers to try that plan again
  };

  const onKey = (e: KeyboardEvent) => {
    const rows = [...(box.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const i = rows.findIndex((r) => r === document.activeElement);
    const to = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    rows[(to + rows.length) % rows.length]?.focus();
  };

  if (!list) return <p className="ps-note" role="status">Loading your plans...</p>;
  return (
    <>
      <div ref={box} className="ps-list" role="listbox" aria-label="Your plans" aria-busy={switching} onKeyDown={onKey}>
        {list.map((d) => {
          const here = d.id === active;
          return (
            <button key={d.id} type="button" role="option" aria-selected={here} className="ps-row" data-active={here} disabled={switching} onClick={() => void go(d.id)}>
              <span className="ps-thumb"><PlanThumb d={d} /></span>
              <span className="ps-text">
                <b><PlanGlyph icon={d.icon} color={d.color} size={16} />{d.name}</b>
                <small>{target === d.id && switching ? "Switching..." : [countsText(d.summary), d.id === defaultId ? "Default" : ""].filter(Boolean).join(" \u00b7 ")}</small>
                <HomeTag id={d.haConnection} />
              </span>
              {here && <CheckIcon size={16} className="ps-check" aria-label="Shown now" />}
            </button>
          );
        })}
      </div>
      {error && target !== null && !switching && (
        <div className="ps-error" role="alert">
          <p>{problemText(error)}</p>
          <button type="button" className="ps-act" onClick={() => void go(target)}>Try again</button>
        </div>
      )}
      <div className="ps-foot">
        <button type="button" className="ps-act" onClick={onNew}><PlusIcon size={16} aria-hidden />New plan</button>
        <button type="button" className="ps-act" onClick={onManage}><SquaresFourIcon size={16} aria-hidden />Manage plans</button>
      </div>
    </>
  );
}
