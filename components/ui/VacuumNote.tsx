"use client";
import { useMemo } from "react";
import { matchRoomName } from "@/lib/ambientNames";
import { useStore } from "@/lib/store";
import { livePosition } from "@/lib/vacuumDrive";
import { readVacuumReport } from "@/lib/vacuumReport";
import MonoLabel from "./MonoLabel";

/** Device card line for a vacuum: is the robot in the 3D scene following the vacuum's own position, or a made-up route? And does it say which room it is in? */
export default function VacuumNote({ entity }: { entity: string }) {
  const attrs = useStore((s) => s.states[entity]?.attributes);
  const params = useStore((s) => s.plan.items.find((i) => i.entity === entity)?.params);
  const rooms = useStore((s) => s.plan.rooms);
  const live = !!livePosition(attrs, params);
  const report = useMemo(() => readVacuumReport(attrs), [attrs]);
  const room = report.room ? matchRoomName(report.room, rooms) : undefined;
  const done = [report.cleanedAreaM2 !== undefined && `${Math.round(report.cleanedAreaM2)} m² cleaned`, report.minutes !== undefined && `${Math.round(report.minutes)} min`].filter(Boolean).join(" · ");
  return (
    <div className="field" role="note">
      <MonoLabel>{live ? "Live position" : "Simulated path"}</MonoLabel>
      <small className="field-note">
        {live
          ? "The robot in the 3D scene is drawn where the vacuum says it is."
          : "This vacuum does not tell where it is, so the robot follows a made-up cleaning route that matches its state."}
      </small>
      {report.room && (
        <>
          <MonoLabel>Knows its room</MonoLabel>
          <small className="field-note">
            {room
              ? `It says it is in ${report.room}. While it cleans, that room is lit up in the 3D scene${live ? "." : " and the made-up route stays inside it."}`
              : `It says it is in ${report.room}, but no room in your plan has that name. Give the room the same name to see it lit up.`}
            {done && ` (${done})`}
          </small>
        </>
      )}
    </div>
  );
}
