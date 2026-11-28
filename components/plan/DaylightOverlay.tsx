"use client";
import { useMemo } from "react";
import { useDaylightPreview } from "@/lib/daylightPreview";
import { heatPixels, type DayResult, type HeatMode } from "@/lib/daylightRun";

/** The grid as one small picture (a pixel per cell) the plan stretches over the room: one SVG element however fine the grid is. */
function pictureOf(result: DayResult, mode: HeatMode, lit: Uint8Array | null): string | null {
  const { cols, rows } = result.grid;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(heatPixels(result, mode, lit), cols, rows), 0, 0);
  return canvas.toDataURL();
}

/** Sun hours (or the sunlit patches right now) over the analysed room's floor in the plan view, while "Sunlight in this room" is open. Drawn above the room floors, below the walls. */
export default function DaylightOverlay({ level }: { level: string }) {
  const show = useDaylightPreview((s) => s.active && s.heat && s.levelId === level);
  const result = useDaylightPreview((s) => s.result);
  const mode = useDaylightPreview((s) => s.mode);
  const lit = useDaylightPreview((s) => (s.mode === "now" ? s.lit : null)); // the hours picture does not move with the time of day
  const href = useMemo(() => (show && result ? pictureOf(result, mode, lit) : null), [show, result, mode, lit]);
  if (!href || !result) return null;
  const { grid } = result;
  return <image href={href} x={grid.x0} y={grid.y0} width={grid.cols * grid.cell} height={grid.rows * grid.cell} preserveAspectRatio="none" style={{ imageRendering: "pixelated" }} pointerEvents="none" aria-hidden />;
}
