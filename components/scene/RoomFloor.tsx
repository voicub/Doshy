"use client";
import { Marker } from "./DeclutterLayer";
import { ListBulletsIcon } from "@phosphor-icons/react";
import { useRoomSheet } from "@/components/ui/roomSheetStore";
import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import type { MeshStandardMaterial } from "three";
import { isOn } from "@/lib/light";
import { roomItems, roomLightEntities } from "@/lib/rooms";
import { useStore } from "@/lib/store";
import { useLiveRooms } from "@/lib/useLive";
import { tiledTexture } from "@/lib/textures";
import { FLOORS, floorOf } from "@/lib/materials";
import { useKnobs } from "@/lib/quality";
import { FLOOR_SURFACE } from "@/lib/shellLook";
import { levelIdOf } from "@/lib/levels";
import { activeVoids, holesIn } from "@/lib/voids";
import type { Room } from "@/lib/types";
import { useHoledSlab } from "./holedSlab";
import { shellBox, useMetricUv } from "./shellGeometry";
import { surfaceProps } from "./shellMaterials";
import { useWetSurface } from "./useWet";
import { useReducedMotion } from "./motion";

const FLOOR_T = 0.06;
const DRAG_PX = 6;

export default function RoomFloor({ room }: { room: Room }) {
  const kind = floorOf(room);
  const def = FLOORS[kind];
  const k = useKnobs();
  const surf = k.textures > 0 ? FLOOR_SURFACE[kind] : undefined; // kinds without a PBR look (lawn, water, sand, gravel...) keep the voxel texture at every tier
  const tex = useMemo(() => (surf ? null : tiledTexture(kind, room.w, room.h, room.x, room.y)), [surf, kind, room.w, room.h, room.x, room.y]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const maps = useMemo(() => (surf ? surfaceProps(surf, k, def.rough) : null), [surf, k, def.rough]);
  const plan = useStore((s) => s.plan);
  // stairwells of this level cut real holes in the floor (the lowest level lies on the ground and has none)
  const holes = useMemo(() => holesIn(room, activeVoids(plan, levelIdOf(plan, room))), [plan.voids, plan.levels, room.x, room.y, room.w, room.h, room.level]); // keyed by the room rect values, so dragging another room does not rebuild
  const hole = useHoledSlab(room, holes, FLOOR_T);
  const states = useStore((s) => s.states);
  // metric uvs in world metres: the planks and tiles keep their size and run on through the next room
  const slab = useMemo(
    () => (surf && !hole ? shellBox(room.w, FLOOR_T, room.h, k.bevelSegments, 0.008, [room.x + room.w / 2, FLOOR_T / 2, room.y + room.h / 2], () => ({ tile: surf.tile })) : null),
    [surf, hole, room.w, room.h, room.x, room.y, k.bevelSegments],
  );
  useEffect(() => () => slab?.dispose(), [slab]);
  useMetricUv(hole, surf?.tile);
  const toggleMany = useStore((s) => s.toggleMany);
  const setFocusRoom = useStore((s) => s.setFocusRoom);
  const isLive = useStore((s) => s.view === "live"); // the room chip toggles lights: editing views must never do that

  const lights = roomLightEntities(plan, room);
  const linked = useMemo(() => roomItems(plan, room).some((i) => i.entity), [plan, room]); // the devices button only where something is linked
  const lit = lights.filter((id) => isOn(states[id]));
  const live = useLiveRooms()[room.id];
  const temp = live?.temp ?? (room.tempEntity ? states[room.tempEntity] && { value: states[room.tempEntity].state, unit: states[room.tempEntity].attributes.unit_of_measurement ?? "" } : undefined);
  const outdoor = def.outdoor;
  const mat = useRef<MeshStandardMaterial>(null);
  useWetSurface(mat, room.color ?? "#ffffff", maps?.roughness ?? def.rough, Math.min(0.3, def.rough), 0.3, outdoor);
  // pool water drifts slowly (a still surface when the user prefers reduced motion)
  const still = useReducedMotion();
  useFrame(({ clock }) => {
    if (kind !== "water" || still || !k.ambient) return;
    const t = clock.elapsedTime;
    tex?.offset.set(room.x / def.tileM + t * 0.012, room.y / def.tileM + Math.sin(t * 0.35) * 0.03);
    keepAlive(false);
  });

  // Tap the chip: if anything is lit turn it all off, otherwise turn it all on.
  const down = useRef<{ x: number; y: number } | null>(null);
  const toggleRoom = (e: MouseEvent<HTMLButtonElement>) => {
    const d = down.current;
    down.current = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) return; // pressed, dragged, released on the chip: not a tap
    void toggleMany(lit.length > 0 ? lit : lights.filter((id) => !isOn(states[id])));
  };

  return (
    <group>
      <mesh
        position={hole ? [0, 0, 0] : [room.x + room.w / 2, FLOOR_T / 2, room.y + room.h / 2]}
        receiveShadow
        onDoubleClick={(e) => {
          e.stopPropagation();
          setFocusRoom(room.id);
        }}
      >
        {hole ? <primitive object={hole} attach="geometry" /> : slab ? <primitive object={slab} attach="geometry" /> : <boxGeometry args={[room.w, FLOOR_T, room.h]} />}
        <meshStandardMaterial ref={mat} {...(maps ?? { map: tex, roughness: def.rough })} color={room.color} metalness={def.metal} />
      </mesh>
      {!room.parent && isLive && (
        <Marker id={`${room.id}:chip`} kind="chip" group={room.id} position={[room.x + room.w / 2, outdoor ? 0.4 : 0.9, room.y + room.h / 2]} label={room.name}>
          <div className="chip-row">
            <button className={`chip ${lit.length ? "lit" : ""}`} disabled={!lights.length} onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })} onClick={toggleRoom} title={lights.length ? (lit.length ? "Turn room lights off" : "Turn room lights on") : room.name}>
              <span className="chip-dot" />
              {room.name}
              {live?.presence === true && <span className="chip-occ" title="Occupied" />}
              {temp && <span className="chip-val">{`${temp.value}${temp.unit}`}</span>}
              {live?.humidity && <span className="chip-val">{`${Math.round(live.humidity.value)}%`}</span>}
            </button>
            {linked && (
              <button type="button" className="chip-dev" aria-label={`Devices in ${room.name}`} title="Every device in this room" onClick={() => useRoomSheet.getState().open(room.id)}>
                <ListBulletsIcon size={14} aria-hidden />
              </button>
            )}
          </div>
        </Marker>
      )}
    </group>
  );
}
