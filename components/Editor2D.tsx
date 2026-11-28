"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { REF_W, rectOf } from "@/lib/planView";
import { findLevel, planOfLevel, sortedLevels } from "@/lib/levels";
import { sectionStyle } from "@/lib/materials";
import { useVp } from "@/lib/useVp";
import { activeLevelId, useStore } from "@/lib/store";
import BlueprintPaper, { PAPER } from "./plan/BlueprintPaper";
import { OPENING_SNAP_DIST } from "./plan/planPoint";
import { PlanCorner } from "./plan/PlanBits";
import PlanLayers from "./plan/PlanLayers";
import SiteAlignBar from "./plan/SiteAlignBar";
import TraceBar from "./plan/TraceBar";
import SiteUnderlay from "./plan/SiteUnderlay";
import TitleBlock from "./plan/TitleBlock";
import { groundSettle, useGroundDraft } from "./plan/groundTool";
import { linesCancel, linesFinish, useLinesDraft } from "./plan/linesTool";
import { useSiteAlign } from "./ui/siteAlign";
import type { PointerEnv } from "./plan/pointerEnv";
import { useGesture } from "./plan/useGesture";
import { usePlanCamera } from "./plan/usePlanCamera";
import { usePlanKeys, type PlanActions } from "./plan/usePlanKeys";
import { usePlanPoint } from "./plan/usePlanPoint";
import { usePlanPointer } from "./plan/usePlanPointer";
import { usePlanView } from "./plan/usePlanView";
import "./plan/compactPlan.css";

const TINY_U = 62; // on small screens one screen-constant unit is this many css px, so type stays readable at any zoom
const TOUCH_SCALE = 1.7; // handle size multiplier on touchscreens
const FINGER_WALL_REACH_PX = 30; // how far from a wall a finger's tap still lands on it
const IDLE_ACTIONS: PlanActions = { finish: () => undefined, fit: () => undefined, finishLine: () => undefined };

/** Plan mode: the floor plan as a blueprint, drawn with the select, wall, room, opening, pillar, paint, garden, garden lines and stairs tools. */
export default function Editor2D() {
  const full = useStore((s) => s.plan);
  const sel = useStore((s) => s.sel);
  const tool = useStore((s) => s.tool);
  const activeLevel = useStore(activeLevelId);
  const plan = useMemo(() => planOfLevel(full, activeLevel), [full, activeLevel]); // every geometry helper below sees the active level only
  const hatchOf = useMemo(() => Object.fromEntries(plan.walls.map((w) => [w.id, sectionStyle(plan, w)])), [plan]); // each cut wall is hatched like its outside face
  const svg = useRef<SVGSVGElement>(null);
  const g = useGesture();
  const [showDims, setShowDims] = useState(true);
  const align = useSiteAlign((s) => s.align);
  const { vp, coarse } = useVp();
  const tiny = vp !== "regular"; // "compact" screens: the tiny and small classes (800x480, 1024x600, phones)
  const live = useRef<PlanActions>(IDLE_ACTIONS); // what the keys, the edit strip and the view ask of the editor; always the latest render's

  const gdBusy = useGroundDraft((s) => !!(s.rect || s.grab));
  const lineBusy = useLinesDraft((s) => s.points.length > 0);
  const gestureActive = !!g.drag || !!g.roomStart || !!g.wallStart || !!g.voidStart || gdBusy || lineBusy;
  const { view, setView, viewRef, autoFrame, size, free, fit } = usePlanView({ svg, live, activeLevel, tiny, sel, gestureActive, dragActive: !!g.drag });
  const vb = rectOf(view, size.w / size.h);
  const px = vb.w / size.w; // one screen pixel, in metres
  const u = tiny ? px * TINY_U : vb.w / REF_W; // 1 screen-constant unit: keeps type and hairlines the same size at any zoom
  const dpx = tiny ? px * 1.5 : px; // dimension lines and tags are drawn in px units: bigger on small screens so their type is readable
  const touch = coarse ? TOUCH_SCALE : 1;
  const reach = Math.max(OPENING_SNAP_DIST, touch > 1 ? FINGER_WALL_REACH_PX * px : 0);

  const point = usePlanPoint({ svg, viewRef, px, touch });
  const env: PointerEnv = { svg, tool, activeLevel, px, reach, g, point, viewRef, autoFrame, setView };
  const pointer = usePlanPointer(env);
  const camera = usePlanCamera({ svg, viewRef, autoFrame, setView, onPinchStart: g.finish });
  live.current = { finish: g.finish, fit, finishLine: () => linesFinish({ begin: g.begin, end: g.end }) };
  usePlanKeys(live, g.wallStartRef, g.setSpace, g.setWallStart);

  useEffect(() => {
    g.setWallStart(null);
    groundSettle();
    linesCancel();
    if (tool.startsWith("add:")) useStore.getState().setTool("select"); // furniture is placed in the Furniture view
  }, [tool]);
  useEffect(() => {
    if (tiny) setShowDims(false); // the room labels already carry the sizes
  }, [tiny]);

  const level = findLevel(full, activeLevel);
  const levels = sortedLevels(full);
  const levelNo = levels.findIndex((l) => l.id === level.id);
  const lower = levelNo > 0 ? levels[levelNo - 1] : undefined;
  const cursor = g.panning ? "grabbing" : align ? "move" : g.space ? "grab" : tool === "select" ? "default" : "crosshair";

  return (
    <>
    <svg
      ref={svg}
      className="plan-svg"
      role="application"
      aria-label="Floor plan editor"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={{ width: "100%", height: "100%", cursor, touchAction: "none", background: PAPER }}
      onPointerDownCapture={(e) => { camera.touchDown(e); if (!camera.isPinching()) { pointer.panStart(e); pointer.alignStart(e); } }}
      onPointerMoveCapture={camera.touchMove}
      onPointerUpCapture={camera.touchUp}
      onPointerCancelCapture={camera.touchUp}
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onPointerDown={pointer.down}
      onDoubleClick={() => tool === "lines" && live.current.finishLine()}
      onPointerMove={pointer.move}
      onPointerUp={pointer.up}
      onPointerCancel={g.finish}
      onPointerEnter={() => g.setHover(true)}
      onPointerLeave={() => g.setHover(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (camera.isTouching()) return; // a long press is not a right click: it must not end the wall
        g.setWallStart(null);
        live.current.finishLine();
      }}
    >
      <SiteUnderlay />
      <BlueprintPaper vb={vb} px={px} />
      <PlanLayers full={full} plan={plan} activeLevel={activeLevel} lower={lower} sel={sel} tool={tool} hatchOf={hatchOf} vb={vb} u={u} px={px} dpx={dpx} touch={touch} tiny={tiny} showDims={showDims} reach={reach} free={free} g={g} pointer={pointer} />
    </svg>
    <PlanCorner onFit={fit} dims={showDims} onDims={() => setShowDims((v) => !v)} />
    {align && <SiteAlignBar />}
    <TraceBar />
    {!tiny && <TitleBlock plan={plan} level={level} levelNo={levelNo} px={px} bearing={full.bearing ?? 0} />}
    </>
  );
}
