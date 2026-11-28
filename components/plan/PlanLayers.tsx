"use client";
import type { PointerEvent as RPE } from "react";
import { CATALOG, isPillar } from "@/lib/catalog";
import { wallLen } from "@/lib/geometry";
import { levelIdOf, planOfLevel } from "@/lib/levels";
import type { Frame } from "@/lib/planView";
import { useStore, type Tool } from "@/lib/store";
import type { Level, Opening, Plan, Sel, SelType, SlabVoid, Wall } from "@/lib/types";
import { levelAbove, turnVoid } from "@/lib/voids";
import type { Box } from "@/lib/viewInset";
import { AxisGrid, OpeningTags, OverallDimensions, RoomDimensions, WallDimensions, WallThickness } from "./Dimensions";
import { CutWalls, DragRoomOutline, LevelBelow, RectDraft, RoomChips, RoomFloors, WallDraft, WallEndHandles, WallPicks, isSelected } from "./EditorLayers";
import { GroundDraft, GroundHandles, GroundLayer } from "./GroundMark";
import HallwayMark from "./HallwayMark";
import LampMarks from "./LampMarks";
import LinesDraft from "./LinesDraft";
import OpeningMark from "./OpeningMark";
import { Dim, SolidShape, SnapCursor, ticks } from "./PlanBits";
import { PillarGhost, PillarLayer } from "./Pillars";
import StairwellMark from "./StairwellMark";
import { PaintHover } from "./paint2d";
import { presetOf, usePillarUi } from "./pillarUi";
import { MONO } from "./planStyle";
import { openingAt } from "./planPoint";
import { inOneStep } from "./oneStep";
import { ROOM_DRAG, openingDrag } from "./grabs";
import type { Gesture } from "./useGesture";
import type { PlanPointer } from "./usePlanPointer";
import TraceLayer, { TraceUnderlay } from "./TraceLayer";
import DaylightOverlay from "./DaylightOverlay";
import { PlanAnnotations } from "./AnnotateLayer";
import WallLengthLabels from "./MeasureLabels";
import MeasureLayer from "./MeasureLayer";
import { PlanUtilities } from "./UtilityLayer";

import DevicePins from "./DevicePins";
type Props = {
  /** Every level, and the active level's own plan. */
  full: Plan;
  plan: Plan;
  activeLevel: string;
  lower: Level | undefined;
  sel: Sel;
  tool: Tool;
  hatchOf: Record<string, Wall["style"]>;
  /** The visible rectangle of the plan (metres), screen-constant unit, metres per pixel, and px for dimension tags. */
  vb: Frame;
  u: number;
  px: number;
  dpx: number;
  /** Handle size multiplier (1.7 on touchscreens), compact screens, dimensions shown. */
  touch: number;
  tiny: boolean;
  showDims: boolean;
  /** How far from a wall a tap still lands on it (metres), and the area the bars leave free. */
  reach: number;
  free: Box;
  g: Gesture;
  pointer: PlanPointer;
};

/** Flip a door's hinge end or the side it opens to: one undo step. */
const flipDoor = (o: Opening, what: "hinge" | "side") => {
  const patch = what === "hinge" ? { hinge: o.hinge === "end" ? ("start" as const) : ("end" as const) } : { swing: o.swing === "right" ? ("left" as const) : ("right" as const) };
  inOneStep(() => useStore.getState().patch("opening", o.id, patch));
};
/** Quarter turn of a stairs opening: one undo step. */
const turnVoidNow = (v: SlabVoid) => inOneStep(() => useStore.getState().patch("void", v.id, turnVoid(v)));

/** Everything drawn inside the plan canvas, bottom to top: paper, ground, rooms, walls, openings, handles, dimensions, and the shape being drawn. */
export default function PlanLayers(p: Props) {
  return (
    <>
      <BackdropLayers {...p} />
      <StructureLayers {...p} />
      <OverlayLayers {...p} />
    </>
  );
}

/** Axis ticks, garden ground, room floors, the level below and the hallway. */
function BackdropLayers({ full, plan, activeLevel, lower, sel, tool, vb, u, dpx, pointer }: Props) {
  const below = lower ? planOfLevel(full, lower.id) : null;
  return (
    <>
      <TraceUnderlay trace={full.trace} />
      <g fontSize={0.22 * u} fill="rgb(var(--dim-rgb) / 0.8)" style={MONO} pointerEvents="none">
        {ticks(vb.x, vb.w).map((x) => <text key={`x${x}`} x={x + 0.1 * u} y={vb.y + 0.4 * u}>{x}</text>)}
        {ticks(vb.y, vb.h).map((y) => <text key={`y${y}`} x={vb.x + 0.1 * u} y={y - 0.1 * u}>{y}</text>)}
      </g>
      <GroundLayer plan={plan} selId={sel?.type === "ground" || sel?.type === "path" ? sel.id : undefined} tool={tool} u={u} onGrab={pointer.grabGround} />
      <RoomFloors rooms={plan.rooms} sel={sel} u={u} onDown={(e, r) => (e.pointerType === "touch" ? pointer.panRoom(e, r.id) : pointer.startDrag(e, "room", r.id, ROOM_DRAG))} />
      <DaylightOverlay level={activeLevel} />
      {below && lower && <LevelBelow below={below} name={lower.name} vb={vb} u={u} />}
      <HallwayMark plan={full} level={activeLevel} u={u} px={dpx} />
    </>
  );
}

/** Cut walls, columns, stairs openings, wall picks, pillars and doors/windows. */
function StructureLayers({ full, plan, activeLevel, sel, tiny, showDims, hatchOf, u, px, touch, pointer }: Props) {
  const isSel = (type: SelType, id: string) => isSelected(sel, type, id);
  const myVoids = (full.voids ?? []).filter((v) => levelIdOf(full, v) === activeLevel);
  const upLevel = levelAbove(full, activeLevel);
  const upVoids = upLevel ? (full.voids ?? []).filter((v) => levelIdOf(full, v) === upLevel.id) : [];
  const pillars = plan.items.filter((it) => isPillar(it.kind));
  return (
    <>
      <CutWalls walls={plan.walls} hatchOf={hatchOf} px={px} />
      {/* structural columns and risers stay in plan mode, hatched like concrete */}
      <g pointerEvents="none">
        {plan.items.map((it) => (CATALOG[it.kind] ? <SolidShape key={it.id} it={it} def={CATALOG[it.kind]} /> : null))}
      </g>
      <LampMarks items={plan.items} px={px} />
      {/* stairs openings: the hole in the floor above shows as a dashed UP, holes in this floor as hatched DN */}
      {upVoids.map((v) => <StairwellMark key={v.id} v={v} mode="up" u={u} px={px} />)}
      {myVoids.map((v) => (
        <StairwellMark key={v.id} v={v} mode="down" selected={isSel("void", v.id)} showDims={showDims} u={u} px={px} touch={touch}
          onDown={v.auto ? undefined : (e) => pointer.startDrag(e, "void", v.id, { kind: "void", x: v.x, y: v.y })}
          onCorner={v.auto ? undefined : (e, c) => pointer.startVoidCorner(e, v, c)}
          onTurn={v.auto ? undefined : () => turnVoidNow(v)} />
      ))}
      <WallPicks walls={plan.walls} sel={sel} px={px} touch={touch} onDown={(e, w) => pointer.startDrag(e, "wall", w.id, { kind: "wall", a: w.a, b: w.b })} />
      {/* pillars are picked above the walls: a column in a facade is grabbed before the wall behind it */}
      <PillarLayer items={pillars} selId={sel?.type === "item" ? sel.id : undefined} u={u} px={px} touch={touch} onDown={(e, it) => pointer.startDrag(e, "item", it.id, (raw) => ({ kind: "item", x: it.x, y: it.y, off: { x: it.x - raw.x, y: it.y - raw.y } }))} onGrip={pointer.startPillarGrip} />
      {plan.openings.map((o) => {
        const w = plan.walls.find((x) => x.id === o.wallId);
        const onDown = (e: RPE) => pointer.startDrag(e, "opening", o.id, (raw) => openingDrag(o, w, raw));
        return w ? <OpeningMark key={o.id} o={o} wall={w} plan={plan} on={isSel("opening", o.id)} quiet={tiny && !showDims} u={u} px={px} touch={touch} onDown={onDown} onFlip={(what) => flipDoor(o, what)} /> : null;
      })}
    </>
  );
}

/** Garden handles, dimensions, the opening ghost, tool hovers, room chips, wall-end handles and every shape being drawn. */
function OverlayLayers({ plan, activeLevel, sel, tool, vb, u, px, dpx, touch, tiny, showDims, reach, free, g, pointer }: Props) {
  const openingDefaults = useStore((s) => s.openingDefaults);
  const pillarPreset = usePillarUi((s) => s.preset);
  const { cur, ptr, hover, panning, wallStart, roomStart, voidStart, drag, delta } = g;
  const selWall = sel?.type === "wall" ? plan.walls.find((w) => w.id === sel.id) : undefined;
  const opGhost = hover && ptr && (tool === "door" || tool === "window") ? openingAt(tool, ptr, plan.walls, openingDefaults[tool], reach) : null;
  const opGhostWall = opGhost ? plan.walls.find((x) => x.id === opGhost.wallId) : undefined;
  const dragRoom = drag?.kind === "room" ? plan.rooms.find((r) => r.id === drag.id) : undefined;
  const fingerWall = touch > 1 && tool === "wall" && wallStart;
  return (
    <>
      <GroundHandles plan={plan} sel={sel} tool={tool} u={u} px={px} touch={touch} onGrab={pointer.grabGround} />
      {showDims && (
        <>
          <AxisGrid plan={plan} px={dpx} />
          <WallDimensions plan={plan} px={dpx} />
          <OverallDimensions plan={plan} px={dpx} />
          <RoomDimensions plan={plan} px={dpx} />
          <WallThickness plan={plan} px={dpx} />
          <OpeningTags plan={plan} px={dpx} />
        </>
      )}
      <WallLengthLabels plan={plan} px={dpx} />
      <DevicePins items={plan.items} px={px} />
      <PlanAnnotations plan={plan} activeLevel={activeLevel} tool={tool} vb={vb} u={u} px={px} dpx={dpx} touch={touch} />
      {opGhost && opGhostWall && <OpeningMark o={opGhost} wall={opGhostWall} plan={plan} on ghost u={u} px={px} touch={touch} />}
      {tool === "paint" && hover && ptr && !panning && <PaintHover plan={plan} at={ptr} px={px} both={ptr.shiftKey} />}
      {tool === "garden" && !panning && <GroundDraft cur={cur} hover={hover} u={u} />}
      {tool === "lines" && !panning && <LinesDraft cur={cur} hover={hover || touch > 1} u={u} px={px} />}
      {tool === "pillar" && hover && !panning && <PillarGhost preset={presetOf(pillarPreset)} at={cur} u={u} px={px} />}
      <RoomChips plan={plan} sel={sel} tool={tool} tiny={tiny} showDims={showDims} u={u} px={px} touch={touch} onGrab={(e, r) => pointer.startDrag(e, "room", r.id, ROOM_DRAG)} />
      {selWall && tool === "select" && <WallEndHandles wall={selWall} px={px} touch={touch} onDown={(e, k) => pointer.startEnd(e, selWall, k)} />}
      {selWall && <Dim a={selWall.a} b={selWall.b} u={u} text={`${wallLen(selWall).toFixed(2)} m`} />}
      {tool === "wall" && wallStart && <WallDraft start={wallStart} cur={cur} u={u} px={px} touch={touch} />}
      {voidStart && <RectDraft start={voidStart} cur={cur} u={u} dashed />}
      {roomStart && <RectDraft start={roomStart} cur={cur} u={u} />}
      {dragRoom && <DragRoomOutline plan={plan} room={dragRoom} px={px} />}
      <TraceLayer vb={vb} px={px} touch={touch} tool={tool} />
      {tool === "ruler" && <MeasureLayer plan={plan} activeLevel={activeLevel} vb={vb} u={u} px={px} dpx={dpx} touch={touch} />}
      <PlanUtilities plan={plan} activeLevel={activeLevel} tool={tool} vb={vb} u={u} px={px} dpx={dpx} touch={touch} />
      {/* snap cursor: crosshair + coordinate readout */}
      {(hover || fingerWall) && tool !== "ruler" && tool !== "annotate" && tool !== "pipes" && (
        <SnapCursor cur={cur} vb={vb} u={u} px={px} finger={touch > 1} free={free} delta={drag ? delta : null} wallLen={fingerWall && wallStart ? Math.hypot(cur.x - wallStart.x, cur.y - wallStart.y) : null} />
      )}
    </>
  );
}
