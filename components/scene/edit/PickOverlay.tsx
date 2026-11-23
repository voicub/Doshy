"use client";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { CYCLE_MS } from "@/lib/pickMath";
import { useStore } from "@/lib/store";
import { useEditUi, type Anchor, type Cand } from "./editStore";
import { describePick } from "./pickInfo";
import { useVp } from "@/lib/useVp";
import "./pick.css";

const EDGE = 8; // px kept clear at the canvas edge

/** Keep a box anchored at `at` fully inside its offset parent (null: leave it to the stylesheet). */
function useClamp(at: Anchor | null) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent;
    if (!el || !at || !box) return;
    el.style.left = `${Math.max(EDGE, Math.min(at.x + 12, box.clientWidth - el.offsetWidth - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, Math.min(at.y + 12, box.clientHeight - el.offsetHeight - EDGE))}px`;
  });
  return ref;
}

/** The "what is here" list: names of everything under the pointer, nearest first. Arrows move, Enter picks, Escape or a click elsewhere closes. */
function Chooser({ x, y, picks }: Anchor & { picks: Cand[] }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const ref = useClamp(useVp().vp !== "regular" ? null : { x, y }); // on a compact screen pick.css docks the list above the bottom bars: a finger would cover it at the touch point
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const close = () => useEditUi.getState().set({ chooser: null });
  useEffect(() => {
    rows.current[0]?.focus();
    const away = (e: PointerEvent) => !(e.target instanceof Node && ref.current?.contains(e.target)) && close();
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [ref]);
  const choose = (c: Cand) => {
    useStore.getState().select({ type: c.type, id: c.id });
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    const i = rows.current.findIndex((r) => r === document.activeElement);
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (step) {
      e.preventDefault();
      rows.current[(i + step + picks.length) % picks.length]?.focus();
    }
  };
  return (
    <div ref={ref} className="pick-chooser hud" role="listbox" aria-label="Everything here, nearest first" onKeyDown={onKey}>
      {picks.map((c, i) => {
        const { name, sub } = describePick(plan, states, c);
        return (
          <button key={`${c.type}:${c.id}`} ref={(el) => void (rows.current[i] = el)} type="button" role="option" aria-selected={false} className="pick-row" onClick={() => choose(c)}>
            <b>{name}</b>
            {sub && <small>{sub}</small>}
          </button>
        );
      })}
    </div>
  );
}

/** Pointer-following DOM bits of the picking layer: hover name, "N of M" while cycling, and the chooser. */
export default function PickOverlay() {
  const tip = useEditUi((s) => s.tip);
  const cycle = useEditUi((s) => s.cycle);
  const chooser = useEditUi((s) => s.chooser);
  const tipRef = useClamp(tip);
  const cycleRef = useClamp(cycle);
  useEffect(() => {
    if (!cycle) return;
    const t = setTimeout(() => useEditUi.getState().set({ cycle: null }), CYCLE_MS);
    return () => clearTimeout(t);
  }, [cycle]);
  return (
    <>
      {tip && !chooser && (
        <div ref={tipRef} className="pick-tip edit-tag">
          {tip.text}
        </div>
      )}
      <div ref={cycleRef} className="pick-cycle edit-tag" role="status" aria-live="polite" hidden={!cycle}>
        {cycle?.text}
      </div>
      {chooser && <Chooser {...chooser} />}
    </>
  );
}
