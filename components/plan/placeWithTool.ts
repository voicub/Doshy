import type { PointerEvent as RPE } from "react";
import { addPillar } from "@/lib/pillars";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/uid";
import { groundDown } from "./groundTool";
import { linesDown, linesPoint } from "./linesTool";
import { lvPlan } from "./levelPlan";
import { paintAt } from "./paint2d";
import { presetOf, usePillarUi } from "./pillarUi";
import { groundCtx, type PointerEnv } from "./pointerEnv";
import { openingAt } from "./planPoint";
import { useWallUi } from "./wallUi";

/** The primary button (or a finger lifting) with the current tool: place a wall or garden line point, start a room or stairs rectangle, place an opening or pillar, paint, start a garden shape, or select nothing. */
export function placeWithTool(e: RPE, env: PointerEnv, startPan: (e: RPE) => void) {
  const { tool, g, point, px } = env;
  const store = useStore.getState();
  if (tool === "wall") {
    const p = point.wallPoint(e);
    g.begin();
    if (g.wallStart && (g.wallStart.x !== p.x || g.wallStart.y !== p.y)) store.addWall(g.wallStart, p, useWallUi.getState().style);
    g.end();
    g.setCur(p);
    g.setWallStart(p); // keep chaining; Esc or Done ends
  } else if (tool === "room") {
    point.capture(e);
    g.begin();
    g.setRoomStart(point.toPlan(e));
  } else if (tool === "door" || tool === "window") {
    const o = openingAt(tool, point.ptrOf(e), lvPlan().walls, store.openingDefaults[tool], env.reach);
    g.begin();
    if (o) store.addOpening(o);
    g.end();
  } else if (tool === "paint") {
    point.capture(e);
    g.begin();
    paintAt(point.rawPt(e), e, px);
  } else if (tool === "pillar") {
    g.begin();
    store.editPlan((p) => addPillar(p, env.activeLevel, presetOf(usePillarUi.getState().preset), point.pillarPoint(e), uid()));
    g.end();
  } else if (tool === "garden") {
    groundDown(groundCtx(env, e));
  } else if (tool === "lines") {
    linesDown(linesPoint(point, e));
  } else if (tool === "stairwell") {
    point.capture(e);
    g.begin();
    g.setVoidStart(point.toPlan(e));
  } else {
    store.select(null);
    if (e.pointerType === "touch" && tool === "select") startPan(e); // touch: dragging empty canvas pans, like a map
  }
}
