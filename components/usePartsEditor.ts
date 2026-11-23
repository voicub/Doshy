import { useMemo, useRef, useState } from "react";
import type { Part } from "@/lib/catalog";
import { fitParts, MAX_PARTS, partHalf } from "@/lib/customCatalog";

const HISTORY = 100;
const COALESCE_MS = 700; // typing or colour-dragging in one field is one undo step
const NEW_COLOURS = ["#c9a26b", "#8d9299", "#4a6b8a", "#b7503c", "#5b7a5e", "#e8e0d0"];
const NEW_SIZE: Record<NonNullable<Part["shape"]> | "box", [number, number, number]> = { box: [0.4, 0.4, 0.4], cyl: [0.3, 0.4, 0.3], sph: [0.3, 0.3, 0.3], lathe: [0.3, 0.4, 0.3] };
export const SHAPE_NAME = { box: "Box", cyl: "Cylinder", sph: "Ball", lathe: "Turned shape" } as const;
export const shapeOf = (p: Part) => p.shape ?? "box";

type History = { past: Part[][]; future: Part[][]; key: string; at: number };

/** The shapes of a piece being built, the selected one, and every edit with its undo history. */
export type PartsEditor = {
  parts: Part[];
  /** The parts as the last edit left them (state may lag a render behind during a drag). */
  live: { current: Part[] };
  sel: number;
  setSel: (i: number) => void;
  /** The first parts the editor opened with: to tell whether anything changed. */
  initial: Part[];
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Replace the parts without an undo step (during a drag). */
  set: (next: Part[]) => void;
  /** Start an undo step (before a drag). `key` merges consecutive edits of one field into one step. */
  snapshot: (key?: string) => void;
  patch: (i: number, p: Partial<Part>, key?: string) => void;
  undo: () => void;
  redo: () => void;
  add: (shape: "box" | "cyl" | "sph") => void;
  remove: (i: number) => void;
  copy: (i: number) => void;
};

/** The parts a new builder opens with: the draft's, fitted onto the floor, or one box. */
function startParts(draftParts: Part[]): Part[] {
  const fit = fitParts(draftParts);
  const first: Part = { p: [0, NEW_SIZE.box[1] / 2, 0], s: [...NEW_SIZE.box], c: NEW_COLOURS[0] };
  return fit ? fit.parts : [first];
}

export function usePartsEditor(draftParts: Part[]): PartsEditor {
  const initial = useMemo(() => startParts(draftParts), [draftParts]);
  const [parts, setParts] = useState<Part[]>(initial);
  const [sel, setSel] = useState(0);
  const live = useRef(parts);
  const hist = useRef<History>({ past: [], future: [], key: "", at: 0 });

  const set = (next: Part[]) => {
    live.current = next;
    setParts(next);
  };
  const snapshot = (key?: string) => {
    const h = hist.current;
    const now = Date.now();
    if (key && key === h.key && now - h.at < COALESCE_MS) {
      h.at = now;
      return;
    }
    h.past.push(live.current);
    if (h.past.length > HISTORY) h.past.shift();
    h.future = [];
    h.key = key ?? "";
    h.at = now;
  };
  const edit = (next: Part[], key?: string) => {
    snapshot(key);
    set(next);
  };
  const patch: PartsEditor["patch"] = (i, p, key) => edit(live.current.map((x, j) => (j === i ? { ...x, ...p } : x)), key && `${i}:${key}`);
  const undo = () => {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(live.current);
    h.key = "";
    set(prev);
    setSel((s) => Math.min(s, prev.length - 1));
  };
  const redo = () => {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(live.current);
    h.key = "";
    set(next);
  };
  const add: PartsEditor["add"] = (shape) => {
    if (live.current.length >= MAX_PARTS) return;
    const s = NEW_SIZE[shape];
    // a new shape appears on the floor, just to the right of what is already there
    const right = live.current.reduce((m, p) => Math.max(m, p.p[0] + partHalf(p)[0]), -Infinity);
    const x = live.current.length ? right + s[0] / 2 + 0.05 : 0;
    const part: Part = { p: [x, s[1] / 2, 0], s: [...s], c: NEW_COLOURS[live.current.length % NEW_COLOURS.length], ...(shape === "box" ? {} : { shape }) };
    edit([...live.current, part]);
    setSel(live.current.length - 1);
  };
  const remove = (i: number) => {
    if (i < 0 || live.current.length <= 1) return;
    edit(live.current.filter((_, j) => j !== i));
    setSel(Math.max(0, i - 1));
  };
  const copy = (i: number) => {
    const p = live.current[i];
    if (!p || live.current.length >= MAX_PARTS) return;
    edit([...live.current, { ...p, p: [p.p[0] + 0.1, p.p[1], p.p[2] + 0.1], s: [...p.s] }]);
    setSel(live.current.length - 1);
  };

  return { parts, live, sel, setSel, initial, canUndo: () => hist.current.past.length > 0, canRedo: () => hist.current.future.length > 0, set, snapshot, patch, undo, redo, add, remove, copy };
}
