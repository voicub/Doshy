import { useEffect } from "react";
import { getCameraYaw } from "@/lib/cameraYaw";
import { collisionWalls, settleItem } from "@/lib/placement";
import { useStore } from "@/lib/store";
import type { Pt } from "@/lib/types";
import { useEditUi } from "./editStore";
import { cloneItem, COPY_OFFSET, duplicateItem, liftItem, turnItem } from "./itemOps";
import { activeLv, clsOf, fp, ghostAt } from "./place";

const NUDGE = 0.05;
const NUDGE_FINE = 0.01;
const NUDGE_FAR = 0.25;
const ARROWS: Record<string, { right: number; up: number }> = { ArrowLeft: { right: -1, up: 0 }, ArrowRight: { right: 1, up: 0 }, ArrowUp: { right: 0, up: 1 }, ArrowDown: { right: 0, up: -1 } };
const PLAN_AXES: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/** The plan axis an arrow key moves along, as seen on screen with the camera's current azimuth (so Up always moves a piece up the screen). */
function arrowAxis(key: string): Pt {
  const a = (getCameraYaw() * Math.PI) / 180;
  const k = ARROWS[key];
  let best = PLAN_AXES[0];
  let bestDot = -Infinity;
  for (const d of PLAN_AXES) {
    const right = d.x * Math.cos(a) - d.y * Math.sin(a);
    const up = -d.x * Math.sin(a) - d.y * Math.cos(a);
    const dot = right * k.right + up * k.up;
    if (dot > bestDot) [best, bestDot] = [d, dot];
  }
  return best;
}

/** Editing shortcuts of the furniture view. Window-level, ignored in text fields; the dashboard's own single-key hotkeys do not use these keys. Locked pieces ignore the keys that move, turn or lift. */
export default function useFurnitureKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.matches("input,textarea,select,[contenteditable]")) return;
      const s = useStore.getState();
      if (s.view !== "furniture" || s.cinema) return;
      const ui = useEditUi.getState();
      const adding = s.tool.startsWith("add:");
      const mod = e.metaKey || e.ctrlKey;
      const sel = s.sel;
      const item = sel?.type === "item" ? s.plan.items.find((i) => i.id === sel.id) : undefined;
      const k = e.key.toLowerCase();

      if (ARROWS[e.key]) {
        if (!item) return;
        e.preventDefault();
        if (item.locked) return;
        const ax = arrowAxis(e.key);
        const step = mod ? NUDGE_FAR : e.shiftKey ? NUDGE_FINE : NUDGE;
        // collision stays on; flush-snapping would fight a 5 cm nudge
        s.patch("item", item.id, settleItem(fp(item), { x: item.x + ax.x * step, y: item.y + ax.y * step }, collisionWalls(s.plan, item.id), clsOf(item.kind, item.h), false));
        return;
      }
      if (mod) {
        if (k === "z") (e.preventDefault(), e.shiftKey ? s.redo() : s.undo());
        else if (k === "y") (e.preventDefault(), s.redo());
        else if (k === "d" && item) {
          e.preventDefault();
          duplicateItem(item);
        } else if (k === "c" && item) ui.set({ clip: item });
        else if (k === "v" && ui.clip) {
          e.preventDefault();
          const c = ui.clip;
          const lv = activeLv();
          const at = ui.cursor && ghostAt(c.kind, ui.cursor, c.rot, s.plan, lv.id, true, collisionWalls(s.plan, undefined, lv.id));
          if (at && !at.blocked) cloneItem(c, at.x, at.y, at.rot);
          else cloneItem(c, c.x + COPY_OFFSET, c.y + COPY_OFFSET);
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === "Escape") {
        if (adding) {
          s.setTool("select");
          ui.set({ ghost: null, placeRot: 0 });
        } else if (s.sel) s.select(null);
        return;
      }
      const turn = k === "r" ? (e.shiftKey ? -90 : 90) : e.key === "[" ? -15 : e.key === "]" ? 15 : 0;
      if (turn) {
        e.preventDefault();
        if (adding) {
          const placeRot = (ui.placeRot + turn + 360) % 360;
          ui.set({ placeRot, ghost: ui.ghost && { ...ui.ghost, rot: placeRot } });
        } else if (item) turnItem(item.id, turn);
        return;
      }
      if (!item) return;
      if (e.key === "Delete" || e.key === "Backspace") (e.preventDefault(), s.remove("item", item.id));
      else if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        liftItem(item.id, e.key === "PageUp" ? 1 : -1, e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
