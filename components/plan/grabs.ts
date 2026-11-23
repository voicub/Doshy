import type { PointerEvent as RPE } from "react";
import type { Corner } from "@/lib/ground";
import { projectOnWall, wallLen } from "@/lib/geometry";
import { useStore } from "@/lib/store";
import type { Item, Opening, Pt, SelType, SlabVoid, Wall } from "@/lib/types";
import { endsAt, type DragKind } from "./dragMove";
import { groundCtx, type PointerEnv } from "./pointerEnv";
import { groundGrab, type GrabSpec } from "./groundTool";
import { lvPlan } from "./levelPlan";

export const ROOM_DRAG: DragKind = { kind: "room" };

/** Where an opening's drag starts: the grabbed point stays under the pointer (`off` metres along the wall from the opening's centre). */
export const openingDrag = (o: Opening, wall: Wall | undefined, raw: Pt): DragKind => ({
  kind: "opening",
  wallId: o.wallId,
  off: wall ? o.t * wallLen(wall) - projectOnWall(wall, raw).t * wallLen(wall) : 0,
});

/** The ways to take hold of something on the plan with the select tool. */
export type Grabs = {
  startPan: (e: RPE, pick?: string) => void;
  panRoom: (e: RPE, id: string) => void;
  startDrag: (e: RPE, type: SelType, id: string, kind: DragKind | ((raw: Pt) => DragKind)) => void;
  startVoidCorner: (e: RPE, v: SlabVoid, corner: Corner) => void;
  startPillarGrip: (e: RPE, it: Item) => void;
  startEnd: (e: RPE, wall: Wall, which: "a" | "b") => void;
  grabGround: (e: RPE, spec: GrabSpec) => void;
};

export function createGrabs(env: PointerEnv): Grabs {
  const { tool, g, point } = env;
  const { select } = useStore.getState();

  /** The select tool's primary button on a handle: nothing underneath reacts, the pointer is captured. */
  const claim = (e: RPE): boolean => {
    if (tool !== "select" || e.button !== 0) return false;
    e.stopPropagation();
    point.capture(e);
    return true;
  };

  /** Start looking around: the pointer is captured and the view follows it until it lifts. */
  const startPan = (e: RPE, pick?: string) => {
    point.capture(e);
    g.pan.current = { x: e.clientX, y: e.clientY, v: env.viewRef.current, pick };
    g.setPanning(true);
  };

  /** A finger on a room's floor looks around (the floor is most of the screen, and moving a room takes its walls and furniture along: that is the move handle's job); a tap selects the room. */
  const panRoom = (e: RPE, id: string) => {
    if (claim(e)) startPan(e, id);
  };

  /** Grab a wall, room, opening or piece: it is selected and follows the pointer. `kind` may need the exact pointer (to keep the grabbed point under it). */
  const startDrag = (e: RPE, type: SelType, id: string, kind: DragKind | ((raw: Pt) => DragKind)) => {
    if (!claim(e)) return;
    select({ type, id });
    g.begin();
    g.roomLast.current = point.toPlan(e, e.shiftKey ? 0.25 : 0.05);
    g.roomTotal.current = { x: 0, y: 0 };
    g.setDelta({ x: 0, y: 0 });
    g.setDrag({ ...(typeof kind === "function" ? kind(point.rawPt(e)) : kind), id, start: point.toPlan(e) });
  };

  /** Grab a corner of the selected stairs opening: the opposite corner stays where it is. */
  const startVoidCorner = (e: RPE, v: SlabVoid, corner: Corner) => {
    if (!claim(e)) return;
    g.begin();
    g.setDrag({ kind: "voidCorner", corner, x: v.x, y: v.y, w: v.w, h: v.h, id: v.id, start: point.toPlan(e) });
  };

  /** Grab a corner handle of the selected pillar: it grows or shrinks about its centre. */
  const startPillarGrip = (e: RPE, it: Item) => {
    if (!claim(e)) return;
    g.begin();
    g.setDrag({ kind: "pillarGrip", id: it.id, start: point.toPlan(e) });
  };

  /** Grab a wall end: it, and every other wall end at the same point, follow the pointer so joined corners stay joined. */
  const startEnd = (e: RPE, wall: Wall, which: "a" | "b") => {
    if (!claim(e)) return;
    select({ type: "wall", id: wall.id });
    g.begin();
    const at = wall[which];
    g.setDelta({ x: 0, y: 0 });
    g.setDrag({ kind: "wallEnd", ends: endsAt(lvPlan(), at), id: wall.id, start: at });
  };

  /** Grab the body, a corner, the turn knob or a bend of a selected garden area or path. */
  const grabGround = (e: RPE, spec: GrabSpec) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    groundGrab(groundCtx(env, e), spec);
  };

  return { startPan, panRoom, startDrag, startVoidCorner, startPillarGrip, startEnd, grabGround };
}
