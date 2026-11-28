"use client";
import { useFrame } from "@react-three/fiber";
import { MeshBasicMaterial } from "three";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import type { Room } from "@/lib/types";
import { Marker } from "./DeclutterLayer";
import { useIsoZone } from "./isoState";
import { useReducedMotion } from "./motion";

const FLOOR_TOP = 0.06; // top of the floor slab (RoomFloor's FLOOR_T)
const LIFT = 0.003; // above the floor, under the robot's trail
const BASE = 0.13;
const PULSE = 0.05; // opacity swing of the breathing tint
const PULSE_RAD_S = 2.2;
const LABEL_Y = 1.1; // m above the floor: the label floats at about the height of the furniture
const CYAN = "#5ad7ff"; // the HUD's cyan

/** One material for every highlighted room: a polygon offset keeps the thin tint from flickering against the floor slab. */
const TINT = new MeshBasicMaterial({ color: CYAN, transparent: true, opacity: BASE, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/**
 * The room a vacuum says it is cleaning: a soft cyan tint on its floor (breathing where the tier animates, still otherwise) and a label
 * ("Cleaning Kitchen · 23 m²"). In Room mode only the entered room shows it. Drawn inside the vacuum's own level group.
 */
export default function CleaningRoom({ itemId, room, line }: { itemId: string; room: Room; line: string }) {
  const reduced = useReducedMotion();
  const animated = useKnobs().ambient && !reduced;
  const zone = useIsoZone();
  useFrame(({ clock }) => {
    TINT.opacity = animated ? BASE + PULSE * Math.sin(clock.elapsedTime * PULSE_RAD_S) : BASE;
    if (animated) keepAlive(false);
  });
  if (zone && !zone.rooms.includes(room.id)) return null;
  const cx = room.x + room.w / 2;
  const cz = room.y + room.h / 2;
  return (
    <>
      <mesh position={[cx, FLOOR_TOP + LIFT, cz]} rotation={[-Math.PI / 2, 0, 0]} material={TINT} raycast={() => null}>
        <planeGeometry args={[room.w, room.h]} />
      </mesh>
      <Marker id={`${itemId}:clean`} kind="badge" position={[cx, LABEL_Y, cz]} label={line}>
        <div className="badge">{line}</div>
      </Marker>
    </>
  );
}
