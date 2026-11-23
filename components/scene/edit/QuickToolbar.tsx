"use client";
import { ArrowLineDownIcon, ArrowLineUpIcon, CopyIcon, LockSimpleIcon, LockSimpleOpenIcon, StackIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useStore } from "@/lib/store";
import { useEditUi } from "./editStore";
import { duplicateItem, liftItem, toggleLock, turnItem } from "./itemOps";
import { pickBridge } from "./pickBridge";
import "./quick.css";

const EDGE = 8; // px kept clear at the canvas edge
const BELOW = 48; // px under the piece: clear of the rotation ring and the size tags
const ABOVE = 86; // px over the piece: clear of the lift arrow

/** Put the toolbar under the selection (over it when there is no room below), kept inside the canvas. */
function place(el: HTMLElement | null, r: { x0: number; y0: number; x1: number; y1: number } | null) {
  const box = el?.offsetParent;
  if (!el || !box || !r) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const x = Math.max(EDGE, Math.min((r.x0 + r.x1) / 2 - w / 2, box.clientWidth - w - EDGE));
  let y = r.y1 + BELOW;
  if (y + h > box.clientHeight - 100) y = r.y0 - ABOVE - h;
  y = Math.max(EDGE, Math.min(y, box.clientHeight - h - EDGE));
  el.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
}

/**
 * Floating buttons beside the selected piece: the touch-friendly way to turn, lift, lock, copy and delete it, and to pick whatever lies under it.
 * Hidden while a gesture runs or a tool is active. Enter (with nothing focused) moves focus in, the arrow keys step across, Esc leaves.
 */
/** `docked`: compact screens keep the buttons in the edit strip instead of floating next to the piece (they would hide behind a panel). */
export default function QuickToolbar({ docked = false }: { docked?: boolean }) {
  const sel = useStore((s) => s.sel);
  const item = useStore((s) => {
    const { sel: picked, plan } = s;
    return picked?.type === "item" ? plan.items.find((i) => i.id === picked.id) : undefined;
  });
  const tool = useStore((s) => s.tool);
  const gesture = useEditUi((s) => s.gesture);
  const chooser = useEditUi((s) => s.chooser);
  const ref = useRef<HTMLDivElement>(null);
  const shown = !!item && !gesture && !chooser && tool === "select";
  useLayoutEffect(() => (docked ? undefined : place(ref.current, useEditUi.getState().selRect)));
  useEffect(() => (docked ? undefined : useEditUi.subscribe((s, p) => s.selRect !== p.selRect && place(ref.current, s.selRect))), [docked]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Enter" || e.target !== document.body || !ref.current) return;
      const first = ref.current.querySelector<HTMLButtonElement>("button:not(:disabled)");
      if (first) (e.preventDefault(), first.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!item || !sel) return null;
  const id = item.id;
  const locked = !!item.locked;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      e.stopPropagation(); // leaves the toolbar; the next Esc deselects
      return;
    }
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const at = all.findIndex((b) => b === document.activeElement);
    all[(at + step + all.length) % all.length]?.focus();
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div ref={ref} className={docked ? "quick quick-docked" : "quick hud"} role="toolbar" aria-label="Quick actions for the selected piece" hidden={!shown} onKeyDown={onKey}>
      <div className="quick-grp" role="group" aria-label="Turn">
        <button type="button" className="quick-btn" disabled={locked} title="Turn 15 degrees left" aria-label="Turn 15 degrees anticlockwise" onClick={() => turnItem(id, -15)}>-15°</button>
        <button type="button" className="quick-btn" disabled={locked} title="Turn 15 degrees right" aria-label="Turn 15 degrees clockwise" onClick={() => turnItem(id, 15)}>+15°</button>
        <button type="button" className="quick-btn" disabled={locked} title="Turn a quarter" aria-label="Turn 90 degrees clockwise" onClick={() => turnItem(id, 90)}>90°</button>
      </div>
      <div className="quick-grp" role="group" aria-label="Height">
        <button type="button" className="quick-btn" disabled={locked} title="Lower 5 cm (Shift: 1 cm)" aria-label="Lower by 5 centimetres, hold Shift for 1" onClick={(e) => liftItem(id, -1, e.shiftKey)}><ArrowLineDownIcon size={16} aria-hidden /></button>
        <button type="button" className="quick-btn" disabled={locked} title="Raise 5 cm (Shift: 1 cm)" aria-label="Raise by 5 centimetres, hold Shift for 1" onClick={(e) => liftItem(id, 1, e.shiftKey)}><ArrowLineUpIcon size={16} aria-hidden /></button>
      </div>
      <div className="quick-grp" role="group" aria-label="Piece">
        <button type="button" className="quick-btn" title="Pick another piece here" aria-label="Pick another piece at this spot" onClick={() => pickBridge.cycleHere?.()}><StackIcon size={16} aria-hidden /></button>
        <button type="button" className="quick-btn" aria-pressed={locked} title={locked ? "Unlock" : "Lock in place"} aria-label={locked ? "Unlock this piece" : "Lock this piece in place"} onClick={() => toggleLock(id)}>
          {locked ? <LockSimpleIcon size={16} aria-hidden /> : <LockSimpleOpenIcon size={16} aria-hidden />}
        </button>
        <button type="button" className="quick-btn" title="Duplicate" aria-label="Duplicate this piece" onClick={() => duplicateItem(item)}><CopyIcon size={16} aria-hidden /></button>
        <button type="button" className="quick-btn danger" title="Delete" aria-label="Delete this piece" onClick={() => useStore.getState().remove("item", id)}><TrashIcon size={16} aria-hidden /></button>
      </div>
    </div>
  );
}
