"use client";
import { useMemo } from "react";
import { onLevel } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { headingTip, mapBounds, mapStairs, mapViewBox, mapWalls } from "@/lib/walkMap";
import { useWalk, useWalkPose } from "@/lib/walkStore";

const ASPECT = 4 / 3;
const PAD = 1; // metres of air round the storey
const ARROW_PX = 12; // the arrow is this long on screen, whatever the size of the home
const MAP_PX = 160; // the map's width in CSS pixels at its largest (WalkHud.css scales it down on small screens): only used to size the arrow

/** A small top-down map of the storey being walked: rooms, walls with their doors left open, stairs, and an arrow for where you stand and look. Plan metres are the SVG's units. */
export default function WalkMiniMap() {
  const plan = useStore((s) => s.plan);
  const level = useWalk((s) => s.level);
  const { x, y, yaw } = useWalkPose();
  const shapes = useMemo(() => {
    const view = mapViewBox(mapBounds(plan, level), ASPECT, PAD);
    const rooms = onLevel(plan, level).rooms;
    return { view, rooms, walls: mapWalls(plan, level), stairs: mapStairs(plan, level) };
  }, [plan, level]);
  const { view } = shapes;
  const u = view.w / MAP_PX; // metres per map pixel
  const len = ARROW_PX * u;
  const tip = headingTip(x, y, yaw, len);
  const [l, r] = [headingTip(x, y, yaw - 2.5, len * 0.7), headingTip(x, y, yaw + 2.5, len * 0.7)];
  return (
    <svg className="walk-map hud" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" aria-label="Map of this floor. The arrow is where you stand and look.">
      {shapes.rooms.map((rm) => (
        <rect key={rm.id} x={rm.x} y={rm.y} width={rm.w} height={rm.h} className="wm-room" />
      ))}
      {shapes.walls.map((w, i) => (
        <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} className="wm-wall" />
      ))}
      {shapes.stairs.map((s, i) => (
        <polygon key={i} points={s.map((p) => `${p.x},${p.y}`).join(" ")} className="wm-stair" />
      ))}
      <polygon points={`${tip.x},${tip.y} ${l.x},${l.y} ${x},${y} ${r.x},${r.y}`} className="wm-you" />
    </svg>
  );
}
