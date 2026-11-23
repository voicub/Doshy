import type { MutableRefObject } from "react";
import type { Corner } from "@/lib/ground";
import { projectOnWall, wallLen } from "@/lib/geometry";
import { isRoundPillar, resizePillar } from "@/lib/pillars";
import { useStore } from "@/lib/store";
import type { Plan, Pt } from "@/lib/types";
import { gsnap } from "./planPoint";

const MIN_VOID = 0.3; // smallest stairs opening a corner drag can make (m)
const SAME_END = 0.011; // wall ends this close count as one corner
const MIN_WALL = 0.05; // a dragged wall end never comes closer than this to the other end

/** One wall end that moves with a dragged corner: its wall as it was at drag start, and that wall's openings (to keep their offset from the fixed end). */
type EndDrag = { id: string; end: "a" | "b"; a: Pt; b: Pt; ops: { id: string; t: number }[] };

/** What is being dragged, with what it looked like when the drag began. */
export type DragKind =
  | { kind: "opening"; wallId: string; off: number } // `off`: metres along the wall between the pointer and the opening's centre, so the grabbed point stays under the pointer
  | { kind: "room" }
  | { kind: "wall"; a: Pt; b: Pt }
  | { kind: "wallEnd"; ends: EndDrag[] }
  | { kind: "void"; x: number; y: number }
  | { kind: "voidCorner"; corner: Corner; x: number; y: number; w: number; h: number }
  | { kind: "item"; x: number; y: number; off: Pt }
  | { kind: "pillarGrip" };
export type Drag = DragKind & { id: string; start: Pt };

/** The wall ends of a corner drag that are the corner itself (same spot as where the drag began). */
export const endJoined = (drag: Drag) => (q: Pt) => Math.hypot(q.x - drag.start.x, q.y - drag.start.y) < SAME_END;

/** Wall ends within a hair of `at`, with their walls as they are now. */
export const endsAt = (plan: Plan, at: Pt): EndDrag[] =>
  plan.walls.flatMap((w) =>
    (["a", "b"] as const)
      .filter((k) => Math.hypot(w[k].x - at.x, w[k].y - at.y) < SAME_END)
      .map((k) => ({ id: w.id, end: k, a: w.a, b: w.b, ops: plan.openings.filter((o) => o.wallId === w.id).map((o) => ({ id: o.id, t: o.t })) })),
  );

/** The pointer at one move event, as the drag handlers need it. */
type DragEnv = {
  /** The active level's plan, read at call time. */
  plan: Plan;
  /** The exact pointer in plan metres. */
  raw: Pt;
  shiftKey: boolean;
  altKey: boolean;
  /** Snap grid for the pointer's modifiers. */
  grid: number;
  /** The pointer snapped to the grid (optionally a finer or coarser one). */
  at: (grid?: number) => Pt;
  /** The pointer with wall corners joining; `skip` ignores some wall ends. */
  wallPoint: (skip?: (q: Pt) => boolean) => Pt;
  /** The pointer as a pillar position (grid, wall ends, wall lines). */
  pillarPoint: (p: Pt) => Pt;
  /** The room drag's bookkeeping: pointer at the last move, and the total moved. */
  roomLast: MutableRefObject<Pt>;
  roomTotal: MutableRefObject<Pt>;
  setDelta: (d: Pt) => void;
};

function moveWallEnd(drag: Drag & { kind: "wallEnd" }, env: DragEnv) {
  const q = env.wallPoint(endJoined(drag));
  const moved = drag.ends.map((n) => ({ n, other: n.end === "a" ? n.b : n.a }));
  if (moved.some(({ other }) => Math.hypot(other.x - q.x, other.y - q.y) < MIN_WALL)) return; // a wall never collapses to a point
  const { patch } = useStore.getState();
  for (const { n, other } of moved) {
    patch("wall", n.id, { [n.end]: q });
    const len0 = Math.hypot(n.b.x - n.a.x, n.b.y - n.a.y);
    const len1 = Math.hypot(other.x - q.x, other.y - q.y);
    // doors and windows keep their distance from the wall end that stays put
    for (const o of n.ops) patch("opening", o.id, { t: n.end === "b" ? (o.t * len0) / len1 : 1 - ((1 - o.t) * len0) / len1 });
  }
  env.setDelta({ x: q.x - drag.start.x, y: q.y - drag.start.y });
}

function moveVoid(drag: Drag & { kind: "void" | "voidCorner" }, env: DragEnv) {
  const { patch } = useStore.getState();
  const q = env.at();
  if (drag.kind === "voidCorner") {
    const fixed = { x: drag.corner.includes("w") ? drag.x + drag.w : drag.x, y: drag.corner.includes("n") ? drag.y + drag.h : drag.y }; // the opposite corner stays put
    const w = Math.max(Math.abs(q.x - fixed.x), MIN_VOID);
    const h = Math.max(Math.abs(q.y - fixed.y), MIN_VOID);
    patch("void", drag.id, { x: q.x < fixed.x ? fixed.x - w : fixed.x, y: q.y < fixed.y ? fixed.y - h : fixed.y, w, h });
    return;
  }
  const [dx, dy] = [q.x - drag.start.x, q.y - drag.start.y];
  patch("void", drag.id, { x: drag.x + dx, y: drag.y + dy });
  env.setDelta({ x: dx, y: dy });
}

function moveRoom(drag: Drag, env: DragEnv) {
  const room = env.plan.rooms.find((x) => x.id === drag.id);
  if (!room) return;
  const q = env.at(env.shiftKey ? 0.25 : 0.05);
  const dx = q.x - env.roomLast.current.x;
  const dy = q.y - env.roomLast.current.y;
  if (!dx && !dy) return;
  useStore.getState().moveRoom(room.parent ?? room.id, dx, dy, !env.altKey); // an alcove drags its whole room; Alt moves the floor alone
  env.roomLast.current = q;
  env.roomTotal.current = { x: env.roomTotal.current.x + dx, y: env.roomTotal.current.y + dy };
  env.setDelta(env.roomTotal.current);
}

function moveItem(drag: Drag & { kind: "item" | "pillarGrip" }, env: DragEnv) {
  const it = env.plan.items.find((x) => x.id === drag.id);
  if (!it) return;
  const { patch } = useStore.getState();
  if (drag.kind === "pillarGrip") {
    patch("item", it.id, resizePillar(it, it.rot, env.raw, env.grid, isRoundPillar(it.kind)));
    return;
  }
  const q = env.pillarPoint({ x: env.raw.x + drag.off.x, y: env.raw.y + drag.off.y });
  patch("item", it.id, q);
  env.setDelta({ x: q.x - drag.x, y: q.y - drag.y });
}

/** Apply one pointer move to whatever is being dragged. Every patch lands inside the gesture the caller opened, so the whole drag is one undo step. */
export function moveDrag(drag: Drag, env: DragEnv) {
  const { patch } = useStore.getState();
  switch (drag.kind) {
    case "wallEnd":
      return moveWallEnd(drag, env);
    case "void":
    case "voidCorner":
      return moveVoid(drag, env);
    case "room":
      return moveRoom(drag, env);
    case "wall": {
      const p = env.at();
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      patch("wall", drag.id, { a: { x: drag.a.x + dx, y: drag.a.y + dy }, b: { x: drag.b.x + dx, y: drag.b.y + dy } });
      return env.setDelta({ x: dx, y: dy });
    }
    case "item":
    case "pillarGrip":
      return moveItem(drag, env);
    case "opening": {
      const wall = env.plan.walls.find((w) => w.id === drag.wallId);
      if (wall && wallLen(wall) > 0.01) patch("opening", drag.id, { t: gsnap(projectOnWall(wall, env.raw).t * wallLen(wall) + drag.off, env.grid) / wallLen(wall) });
    }
  }
}
