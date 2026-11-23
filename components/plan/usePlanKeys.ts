"use client";
import { useEffect, type MutableRefObject } from "react";
import { useStore } from "@/lib/store";
import type { Pt, Sel } from "@/lib/types";
import { turnVoid } from "@/lib/voids";
import { useGroundDraft } from "./groundTool";
import { inOneStep } from "./oneStep";

/** What the keys (and the strip's Done) ask of the editor: end the gesture in progress, fit the view, end the garden path being drawn. Always the latest render's. */
export type PlanActions = { finish: () => void; fit: () => void; finishPath: () => void };

const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.matches("input,select,textarea");
const bare = (e: KeyboardEvent) => !e.metaKey && !e.ctrlKey;
const pathDrawn = () => useGroundDraft.getState().path.length > 0;

/** Ctrl/Cmd+Z undoes (Shift: redoes), Ctrl+Y redoes. */
function historyKey(e: KeyboardEvent, live: MutableRefObject<PlanActions>): boolean {
  const { undo, redo } = useStore.getState();
  const isZ = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "z";
  const isY = e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "y";
  if (!isZ && !isY) return false;
  e.preventDefault();
  if (isZ) live.current.finish();
  if (isY || e.shiftKey) redo();
  else undo();
  return true;
}

/** Enter and Esc end a garden path being drawn (where it is, like a wall chain); Esc otherwise ends the gesture, the wall chain and the tool; 0 fits the view. */
function endKey(e: KeyboardEvent, live: MutableRefObject<PlanActions>, setWallStart: (p: null) => void): boolean {
  if ((e.key === "Enter" || e.key === "Escape") && pathDrawn()) {
    live.current.finishPath();
    return true;
  }
  if (e.key === "Escape") {
    live.current.finish();
    setWallStart(null);
    useStore.getState().setTool("select");
    return true;
  }
  if (e.key === "0" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    live.current.fit();
    return true;
  }
  return false;
}

/** The selection's keys: Delete removes (the only item Plan mode selects is a pillar), R turns it. One-off edits are single undo steps. */
function selectionKey(e: KeyboardEvent) {
  const { sel, remove } = useStore.getState();
  if (!sel) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    inOneStep(() => remove(sel.type, sel.id));
    return;
  }
  if (e.key.toLowerCase() === "r" && bare(e)) turnSelection(sel);
}

/** Quarter turn of a stairs opening or garden area, an eighth turn of a pillar. */
function turnSelection(sel: NonNullable<Sel>) {
  const { plan, patch } = useStore.getState();
  if (sel.type === "void") {
    const v = plan.voids?.find((x) => x.id === sel.id);
    if (v && !v.auto) inOneStep(() => patch("void", v.id, turnVoid(v)));
  } else if (sel.type === "ground") {
    const g = plan.ground?.find((x) => x.id === sel.id);
    if (g) inOneStep(() => patch("ground", g.id, { rot: ((g.rot ?? 0) + 90) % 360 }));
  } else if (sel.type === "item") {
    const it = plan.items.find((x) => x.id === sel.id);
    if (it) inOneStep(() => patch("item", it.id, { rot: (it.rot + 45) % 180 })); // 0, 45, 90, 135
  }
}

/**
 * Plan mode's keyboard: Space pans, Ctrl/Cmd+Z undoes, Esc and Enter end a wall chain or garden path, 0 fits the view, Delete removes, R turns the selection.
 * Touchscreens have no Esc key or double click: the edit strip's "Done" (`housey:finish-draw`) ends the wall chain or garden path being drawn, or, with nothing being drawn, leaves the tool.
 */
export function usePlanKeys(live: MutableRefObject<PlanActions>, wallStart: MutableRefObject<Pt | null>, setSpace: (on: boolean) => void, setWallStart: (p: null) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.key === " ") {
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (historyKey(e, live) || endKey(e, live, setWallStart)) return;
      selectionKey(e);
    };
    const onKeyUp = (e: KeyboardEvent) => e.key === " " && setSpace(false);
    const onBlur = () => {
      setSpace(false);
      live.current.finish();
    };
    const onDone = () => {
      if (pathDrawn()) live.current.finishPath();
      else if (wallStart.current) setWallStart(null);
      else {
        live.current.finish();
        useStore.getState().setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("housey:finish-draw", onDone);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("housey:finish-draw", onDone);
      live.current.finish(); // leaving the editor mid-gesture must not leave an edit open
    };
    // mounted once: `live` and `wallStart` are refs, the setters are state setters
  }, []);
}
