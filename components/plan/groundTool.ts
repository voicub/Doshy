import { create } from "zustand";
import { MIN_DRAW, movePath, resizeArea, rotationToward, type Corner } from "@/lib/ground";
import { useStore } from "@/lib/store";
import type { GroundArea, GroundPath, Pt } from "@/lib/types";
import { useGroundUi } from "./groundUi";

/** How a selected area or path is being changed by the pointer. */
export type GrabSpec =
  | { mode: "move" | "rotate"; type: "ground"; id: string; orig: GroundArea }
  | { mode: "corner"; type: "ground"; id: string; orig: GroundArea; corner: Corner }
  | { mode: "move"; type: "path"; id: string; orig: GroundPath }
  | { mode: "vertex"; type: "path"; id: string; orig: GroundPath; index: number };
/** A grab once the pointer has started it: the spec plus where the pointer went down. */
type Grab = GrabSpec & { start: Pt };

/** What the Garden tool is in the middle of (never saved, never undone): a rectangle being dragged, a handle being grabbed. */
type Draft = { rect: Pt | null; grab: Grab | null; set: (p: Partial<Pick<Draft, "rect" | "grab">>) => void };
export const useGroundDraft = create<Draft>((set) => ({ rect: null, grab: null, set }));

/** What the plan editor hands the tool for one pointer event. `at` is the snapped plan point, `raw` the exact one. */
export type GroundCtx = { at: Pt; raw: Pt; shift: boolean; alt: boolean; capture: () => void; begin: () => void; end: () => void };

const draft = () => useGroundDraft.getState();
const round = (v: number) => Math.round(v * 1000) / 1000;

/** One-off change as a single undo step (or part of the gesture already open). */
function once(c: Pick<GroundCtx, "begin" | "end">, fn: () => void) {
  c.begin();
  fn();
  c.end();
}

/** Pointer down with the Garden tool: start a rectangle (or drop a preset stamp on release). */
export function groundDown(c: GroundCtx) {
  c.capture();
  draft().set({ rect: c.at });
}

/** Pointer up with a rectangle in progress: the area it spans, or the preset stamp centred where the pointer went down. */
export function groundUp(c: GroundCtx) {
  const { rect, grab } = draft();
  if (grab) return draft().set({ grab: null });
  if (!rect) return;
  draft().set({ rect: null });
  const ui = useGroundUi.getState();
  const [w, h] = [Math.abs(c.at.x - rect.x), Math.abs(c.at.y - rect.y)];
  const base = { kind: ui.kind, edge: ui.edge === "none" ? undefined : ui.edge };
  const { size } = ui;
  if (w >= MIN_DRAW && h >= MIN_DRAW) once(c, () => useStore.getState().addGround({ ...base, x: Math.min(c.at.x, rect.x), y: Math.min(c.at.y, rect.y), w, h }));
  else if (size) once(c, () => useStore.getState().addGround({ ...base, x: round(rect.x - size.w / 2), y: round(rect.y - size.h / 2), ...size }));
}

/** The pointer was released, the gesture ended or the tool was left: a half-dragged rectangle or handle is over. */
export const groundSettle = () => draft().set({ rect: null, grab: null });

/** Grab a selected area or path (its body to move, a corner to resize, the knob to turn, a bend to move). One undo step for the whole drag. */
export function groundGrab(c: GroundCtx, g: GrabSpec) {
  c.capture();
  c.begin();
  useStore.getState().select({ type: g.type, id: g.id });
  draft().set({ grab: { ...g, start: c.at } });
}

/** Pointer move while something is grabbed: change it. Returns true when the move was used. */
export function groundMove(c: GroundCtx): boolean {
  const grab = draft().grab;
  if (!grab) return false;
  const { patch } = useStore.getState();
  const [dx, dy] = [c.at.x - grab.start.x, c.at.y - grab.start.y];
  if (grab.type === "ground") {
    const o = grab.orig;
    if (grab.mode === "move") patch("ground", grab.id, { x: round(o.x + dx), y: round(o.y + dy) });
    else if (grab.mode === "corner") patch("ground", grab.id, resizeArea(o, grab.corner, c.at));
    else patch("ground", grab.id, { rot: rotationToward(o, c.raw, c.alt ? 0 : c.shift ? 15 : 5) });
  } else if (grab.mode === "move") patch("path", grab.id, { points: movePath(grab.orig, dx, dy) });
  else patch("path", grab.id, { points: grab.orig.points.map((q, i) => (i === grab.index ? c.at : q)) });
  return true;
}
