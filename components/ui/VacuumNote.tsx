"use client";
import { useStore } from "@/lib/store";
import { livePosition } from "@/lib/vacuumDrive";
import MonoLabel from "./MonoLabel";

/** Device card line for a vacuum: is the robot in the 3D scene following the vacuum's own position, or a made-up route? */
export default function VacuumNote({ entity }: { entity: string }) {
  const attrs = useStore((s) => s.states[entity]?.attributes);
  const params = useStore((s) => s.plan.items.find((i) => i.entity === entity)?.params);
  const live = !!livePosition(attrs, params);
  return (
    <div className="field" role="note">
      <MonoLabel>{live ? "Live position" : "Simulated path"}</MonoLabel>
      <small className="field-note">
        {live
          ? "The robot in the 3D scene is drawn where the vacuum says it is."
          : "This vacuum does not tell where it is, so the robot follows a made-up cleaning route that matches its state."}
      </small>
    </div>
  );
}
