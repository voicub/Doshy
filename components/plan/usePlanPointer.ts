import type { PointerEvent as RPE } from "react";
import { useStore } from "@/lib/store";
import { siteOf } from "@/lib/siteTypes";
import { dragSite } from "@/lib/siteUi";
import { useSiteAlign } from "../ui/siteAlign";
import { endJoined, moveDrag } from "./dragMove";
import { createGrabs, type Grabs } from "./grabs";
import { groundMove, groundUp } from "./groundTool";
import { lvPlan } from "./levelPlan";
import { paintAt } from "./paint2d";
import { placeWithTool } from "./placeWithTool";
import { planGrid } from "./planPoint";
import { groundCtx, type PointerEnv } from "./pointerEnv";
import { useGroundUi } from "./groundUi";

const MIN_ROOM_DRAW = 0.5; // smallest room a drag can draw (m)
const MIN_VOID_DRAW = 0.4; // smallest stairs opening a drag can draw (m)
const PAN_PICK_SLOP = 8; // px a finger may wander on a room's floor and still count as a tap

/** The handlers of the plan canvas, and the grab helpers that handles inside it call. */
export type PlanPointer = Grabs & {
  down: (e: RPE) => void;
  move: (e: RPE) => void;
  up: (e: RPE) => void;
  /** Capture phase: middle button, or Space + primary button, pans. */
  panStart: (e: RPE) => void;
  /** Capture phase: "Drag the map" moves the map under the plan. */
  alignStart: (e: RPE) => void;
};

/** What the pointer does on the plan canvas: place with the current tool, grab and drag things, pan, and finish what a press started. */
export function usePlanPointer(env: PointerEnv): PlanPointer {
  const { tool, g, point, px } = env;
  const grabs = createGrabs(env);
  const align = useSiteAlign((s) => s.align);

  const panStart = (e: RPE) => {
    if (e.button !== 1 && !(g.space && e.button === 0)) return;
    e.preventDefault();
    e.stopPropagation();
    grabs.startPan(e);
  };

  const alignStart = (e: RPE) => {
    if (!align || e.button !== 0 || g.space || g.pan.current) return;
    e.preventDefault();
    e.stopPropagation();
    point.capture(e);
    const site = siteOf(useStore.getState().plan.site);
    g.alignDrag.current = { from: point.rawPt(e), dx: site.dx, dy: site.dy };
    g.begin();
  };

  /** Wall, door, window, pillar and path points: a mouse press places them at once; a finger places them when it lifts (a second finger arriving first cancels them), where it lifts, so it can slide to adjust. */
  const defers = (e: RPE) => e.pointerType === "touch" && (tool === "wall" || tool === "door" || tool === "window" || tool === "pillar" || (tool === "garden" && useGroundUi.getState().mode === "path"));

  const down = (e: RPE) => {
    if (e.button !== 0) return;
    if (defers(e)) {
      g.tap.current = e.pointerId;
      move(e); // show where the point will land
      return;
    }
    placeWithTool(e, env, grabs.startPan);
  };

  const move = (e: RPE) => {
    if (g.alignDrag.current) {
      const a = g.alignDrag.current;
      const r = point.rawPt(e);
      useStore.getState().setSite(dragSite({ dx: a.dx, dy: a.dy }, useStore.getState().plan.bearing ?? 0, [r.x - a.from.x, r.y - a.from.y]));
      return;
    }
    const p = g.pan.current;
    if (p) {
      const k = p.v.w / (env.svg.current?.clientWidth || 1);
      const [dx, dy] = [e.clientX - p.x, e.clientY - p.y];
      if (p.pick && Math.hypot(dx, dy) > PAN_PICK_SLOP) p.pick = undefined; // it was a drag: look around, do not select
      env.autoFrame.current = false;
      env.setView({ ...p.v, cx: p.v.cx - dx * k, cy: p.v.cy - dy * k });
      return;
    }
    const drag = g.drag;
    const joined = drag?.kind === "wallEnd" ? endJoined(drag) : undefined;
    g.setCur(tool === "wall" ? point.wallPoint(e) : tool === "pillar" ? point.pillarPoint(e) : joined ? point.wallPoint(e, joined) : point.toPlan(e));
    g.setPtr(point.ptrOf(e));
    if (tool === "paint" && g.editing.current) paintAt(point.rawPt(e), e, px); // dragging with the bucket keeps painting: the whole drag is one undo step
    if (groundMove(groundCtx(env, e))) return;
    if (!drag) return;
    moveDrag(drag, {
      plan: lvPlan(),
      raw: point.rawPt(e),
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      grid: planGrid(e),
      at: (grid) => point.toPlan(e, grid),
      wallPoint: (skip) => point.wallPoint(e, skip),
      pillarPoint: (q) => point.pillarPoint(e, q),
      roomLast: g.roomLast,
      roomTotal: g.roomTotal,
      setDelta: g.setDelta,
    });
  };

  const up = (e: RPE) => {
    if (g.alignDrag.current) {
      g.finish();
      return;
    }
    if (g.pan.current) {
      const pick = g.pan.current.pick;
      g.pan.current = null;
      g.setPanning(false);
      if (pick) useStore.getState().select({ type: "room", id: pick });
      return;
    }
    if (g.tap.current === e.pointerId) {
      g.tap.current = null;
      placeWithTool(e, env, grabs.startPan);
      g.finish();
      return;
    }
    groundUp(groundCtx(env, e));
    commitRectangles(e, env);
    g.finish();
  };

  return { ...grabs, down, move, up, panStart, alignStart };
}

/** Releasing a dragged rectangle: a stairs opening or a room, if it is big enough. */
function commitRectangles(e: RPE, { g }: PointerEnv) {
  const { cur, voidStart, roomStart } = g;
  const store = useStore.getState();
  if (voidStart) {
    const w = Math.abs(cur.x - voidStart.x);
    const h = Math.abs(cur.y - voidStart.y);
    if (w >= MIN_VOID_DRAW && h >= MIN_VOID_DRAW) store.addVoid({ x: Math.min(cur.x, voidStart.x), y: Math.min(cur.y, voidStart.y), w, h });
  }
  if (!roomStart) return;
  const w = Math.abs(cur.x - roomStart.x);
  const h = Math.abs(cur.y - roomStart.y);
  if (w < MIN_ROOM_DRAW || h < MIN_ROOM_DRAW) return;
  // Shift held on release, starting inside a room: the new rectangle extends that room (L, T and U shaped rooms are rectangles joined into one)
  const host = e.shiftKey ? lvPlan().rooms.find((r) => !r.parent && roomStart.x >= r.x && roomStart.x <= r.x + r.w && roomStart.y >= r.y && roomStart.y <= r.y + r.h) : undefined;
  store.addRoom({ x: Math.min(cur.x, roomStart.x), y: Math.min(cur.y, roomStart.y), w, h, ...(host ? { parent: host.id } : {}) });
}
