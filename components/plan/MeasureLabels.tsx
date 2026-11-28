"use client";
import { useMemo } from "react";
import { roomPerimeter } from "@/lib/measure";
import { wallFaces } from "@/lib/measureWalls";
import type { Plan, Room } from "@/lib/types";
import { DimLine } from "./Dimensions";
import { useMeasureSettings } from "./measureUi";

const MIN_LABEL_PX = 34; // a face shorter than this on screen is not labelled (the same rule DimLine uses for its text)
const LIFT_PX = 9; // the dimension line stands this far off the face, on the side of the face

/**
 * The length of every wall face of the level, along the face: an outside wall shows its outer and inner face, an inside wall shows both faces, one on each side.
 * Lengths come from where the walls really meet (lib/measureWalls.ts), so a 4 m wall of 12 cm shows 4.12 outside and 3.88 inside. Switched on in the corner of the plan.
 */
export default function WallLengthLabels({ plan, px }: { plan: Plan; px: number }) {
  const on = useMeasureSettings((s) => s.wallLengths);
  const faces = useMemo(() => (on ? wallFaces(plan.walls) : []), [on, plan.walls]);
  return faces.map((f, i) =>
    f.length / px < MIN_LABEL_PX ? null : <DimLine key={`${f.wallId}:${f.side}:${i}`} a={f.a} b={f.b} off={(f.side === "left" ? 1 : -1) * LIFT_PX * px} label={f.length.toFixed(2)} px={px} ext={false} />,
  );
}

/**
 * What "Show room areas" adds to a room's label: the way round, as "14.20 m around", on a line of its own under the size, for a room that is not an extension (the host's number counts its extensions,
 * like its area does). Nothing, "", when the switch is off or for an extension.
 */
export function useRoomAround(): (plan: Plan, room: Room) => string {
  const on = useMeasureSettings((s) => s.roomAreas);
  return (plan, room) => (on && !room.parent ? `${roomPerimeter(plan, room).toFixed(2)} m around` : "");
}
