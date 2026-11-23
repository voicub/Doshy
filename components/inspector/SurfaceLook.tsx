"use client";
import { useMemo, useState } from "react";
import { levelIdOf } from "@/lib/levels";
import {
  FLOORS, WALLS, faceLabels, floorOf, paintFloor, paintLevelWalls, paintRoomWalls, paintWallId, roomWalls, wallFaces, wallSides,
  type WallTarget,
} from "@/lib/materials";
import { useStore } from "@/lib/store";
import type { Room, Wall } from "@/lib/types";
import { Group } from "./shared";
import { ColourField, MaterialGrid } from "./PaintPanel";

/** A wall's material and colour, one side at a time: Inside / Outside for a house wall, the two rooms for a partition. Shown as pictures, not drop-downs. */
export function WallLook({ wall }: { wall: Wall }) {
  const plan = useStore((s) => s.plan);
  const editPlan = useStore((s) => s.editPlan);
  const sides = useMemo(() => wallSides(plan, wall), [plan, wall]);
  const labels = faceLabels(sides);
  const exterior = sides.kind === "exterior" ? sides : null;
  const options: { id: WallTarget; label: string }[] = exterior
    ? [{ id: exterior.outside, label: "Outside" }, { id: exterior.inside, label: "Inside" }, { id: "both", label: "Both" }]
    : [{ id: "both", label: "Both sides" }, { id: "A", label: labels.A }, { id: "B", label: labels.B }];
  const [picked, setPicked] = useState<WallTarget | null>(null);
  const target = picked ?? options[0].id;
  const faces = wallFaces(wall);
  const look = target === "B" ? faces[1] : faces[0];
  const differ = target === "both" && (faces[0].style !== faces[1].style || faces[0].color !== faces[1].color);
  const scope = exterior && target === exterior.outside ? "outside" : exterior && target === exterior.inside ? "inside" : "all";
  const level = levelIdOf(plan, wall);

  return (
    <>
      <Group label="Side">
        <div className="seg" role="group" aria-label="Which side of the wall">
          {options.map((o) => (
            <button key={o.id} type="button" aria-pressed={target === o.id} onClick={() => setPicked(o.id)}>{o.label}</button>
          ))}
        </div>
        {differ && <small className="field-note">The two sides differ: a choice here repaints both.</small>}
      </Group>
      <Group label="Material">
        <MaterialGrid kind="wall" value={look.style} tint={look.color ?? null} onPick={(id) => editPlan((p) => paintWallId(p, wall.id, target, { material: { kind: "wall", id }, color: look.color ?? null }))} />
      </Group>
      <Group label="Colour">
        <ColourField undoable value={look.color ?? null} reset="Natural" natural={WALLS[look.style].color} onChange={(color) => editPlan((p) => paintWallId(p, wall.id, target, { material: null, color }))} />
      </Group>
      <button className="btn" onClick={() => editPlan((p) => paintLevelWalls(p, level, scope, { material: { kind: "wall", id: look.style }, color: look.color ?? null }))}>
        {scope === "outside" ? "Use on all outside walls" : scope === "inside" ? "Use on all inside walls" : "Use on every wall of this level"}
      </button>
    </>
  );
}

/** A room's floor material and colour (and, folded away, the paint of the walls around it) as pictures. */
export function RoomLook({ room }: { room: Room }) {
  const plan = useStore((s) => s.plan);
  const editPlan = useStore((s) => s.editPlan);
  const kind = floorOf(room);
  const custom = room.color !== FLOORS[kind].color ? room.color : null; // a colour the user chose survives a change of floor kind
  const mine = roomWalls(plan, room.id)[0];
  const wallLook = mine ? wallFaces(mine.wall)[mine.face === "A" ? 0 : 1] : null;

  return (
    <>
      <Group label="Floor">
        <MaterialGrid kind="floor" value={kind} tint={custom} onPick={(id) => editPlan((p) => paintFloor(p, room.id, { material: { kind: "floor", id }, color: custom }))} />
      </Group>
      <Group label="Floor colour">
        <ColourField undoable value={custom} reset="Natural" natural={FLOORS[kind].color} onChange={(color) => editPlan((p) => paintFloor(p, room.id, { material: null, color }))} />
      </Group>
      {mine && wallLook && (
        <details className="look-fold">
          <summary>Walls around this room</summary>
          <MaterialGrid kind="wall" value={wallLook.style} tint={wallLook.color ?? null} onPick={(id) => editPlan((p) => paintRoomWalls(p, room.id, { material: { kind: "wall", id }, color: wallLook.color ?? null }))} />
          <ColourField undoable value={wallLook.color ?? null} reset="Natural" natural={WALLS[wallLook.style].color} onChange={(color) => editPlan((p) => paintRoomWalls(p, room.id, { material: null, color }))} />
        </details>
      )}
    </>
  );
}
