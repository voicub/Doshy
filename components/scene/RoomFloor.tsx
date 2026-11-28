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
import { turnUv, usePhotoUv } from "./floorPhotoUv";
import { useFloorPhoto } from "./useFloorPhoto";
import { lookKey, useMaterialLook } from "./useMaterialLook";
import { useWetSurface } from "./useWet";
import { macroVariation } from "./groundMacro";
import { macroOf, roomGain, scaleColor } from "@/lib/groundLook";
import { useReducedMotion } from "./motion";
import { withinTapSlop } from "@/lib/tapSlop";

const FLOOR_T = 0.06;

export default function RoomFloor({ room }: { room: Room }) {
  const kind = floorOf(room);
  const def = FLOORS[kind];
  const k = useKnobs();
  const materialLook = useMaterialLook(room.floorMaterial); // a Poly Haven texture (lib/materialRef.ts): worn exactly like a floor photo, and wins over one
  const photoLook = useFloorPhoto(room.floorMaterial ? undefined : room.floorPhoto); // a photo of the real floor: the colour at Eco and Light, the picture at Balanced and above (lib/floorPhoto.ts)
  const photo = materialLook ?? photoLook; // whichever picture floor the room wears
  const surf = !photo && k.textures > 0 ? FLOOR_SURFACE[kind] : undefined; // kinds without a PBR look keep the voxel texture at every tier
  const hasPhoto = !!photo;
  const tex = useMemo(() => (surf || hasPhoto ? null : tiledTexture(kind, room.w, room.h, room.x, room.y)), [surf, hasPhoto, kind, room.w, room.h, room.x, room.y]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const maps = useMemo(() => (photo ? (photo.props ?? { roughness: def.rough }) : surf ? surfaceProps(surf, k, def.rough) : null), [photo, surf, k, def.rough]);
  const macro = useMemo(() => {
    const m = surf && macroOf(kind); // world-space tone patches break the repeat of an outdoor surface's tile
    return m ? macroVariation(m.tone, m.hue) : null;
  }, [surf, kind]);
  const plan = useStore((s) => s.plan);
  // stairwells of this level cut real holes in the floor (the lowest level lies on the ground and has none)
  const holes = useMemo(() => holesIn(room, activeVoids(plan, levelIdOf(plan, room))), [plan.voids, plan.levels, room.x, room.y, room.w, room.h, room.level]); // keyed by the room rect values, so dragging another room does not rebuild
  const hole = useHoledSlab(room, holes, FLOOR_T);
  const states = useStore((s) => s.states);
  // metric uvs in world metres: the planks and tiles keep their size and run on through the next room
  const photoTile = photo?.props ? photo.tile : undefined; // the picture is on the floor: its metres per repeat; otherwise the colour alone needs no uvs
  const photoTurn = photo?.rotation ?? 0;
  const tile = photoTile ?? surf?.tile;
  const slab = useMemo(() => {
    if (!tile || hole) return null;
    const g = shellBox(room.w, FLOOR_T, room.h, k.bevelSegments, 0.008, [room.x + room.w / 2, FLOOR_T / 2, room.y + room.h / 2], () => ({ tile }));
    if (photoTile) turnUv(g, photoTurn);
    return g;
  }, [tile, photoTile, photoTurn, hole, room.w, room.h, room.x, room.y, k.bevelSegments]);
  useEffect(() => () => slab?.dispose(), [slab]);
  useMetricUv(hole, photoTile ? undefined : surf?.tile);
  usePhotoUv(hole, photoTile, photoTurn);
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
  const tint = photo ? (photo.props ? "#ffffff" : photo.color) : surf ? scaleColor(room.color ?? "#ffffff", roomGain(kind)) : room.color; // a photo floor is tinted by nothing; a kind that used to wear the voxel texture keeps its brightness
  useWetSurface(mat, tint ?? "#ffffff", maps?.roughness ?? def.rough, Math.min(0.3, def.rough), 0.3, outdoor);
  // pool water drifts slowly (a still surface when the user prefers reduced motion)
  const still = useReducedMotion();
  useFrame(({ clock }) => {
    if (kind !== "water" || photo || still || !k.ambient) return; // a photo's textures are shared: never drift them
    const t = clock.elapsedTime;
    const [x, y] = [t * 0.012, Math.sin(t * 0.35) * 0.03];
    tex?.offset.set(room.x / def.tileM + x, room.y / def.tileM + y);
    for (const m of maps ? [maps.map, maps.roughnessMap, maps.normalMap] : []) m?.offset.set(x, y); // the textures of a surface kind are shared: every pool drifts together
    keepAlive(false);
  });

  // Tap the chip: if anything is lit turn it all off, otherwise turn it all on.
  const down = useRef<{ x: number; y: number; type: string } | null>(null);
  const toggleRoom = (e: MouseEvent<HTMLButtonElement>) => {
    const d = down.current;
    down.current = null;
    if (d && !withinTapSlop(e.clientX - d.x, e.clientY - d.y, d.type)) return; // pressed, dragged, released on the chip: not a tap
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
        <meshStandardMaterial key={`${maps ? "pbr" : "flat"}-${macro ? "macro" : "plain"}-${lookKey(photo)}`} ref={mat} {...(maps ?? { map: tex, roughness: def.rough })} {...macro} color={tint} metalness={def.metal} />
      </mesh>
      {!room.parent && isLive && (
        <Marker id={`${room.id}:chip`} kind="chip" group={room.id} position={[room.x + room.w / 2, outdoor ? 0.4 : 0.9, room.y + room.h / 2]} label={room.name}>
          <div className="chip-row">
            <button className={`chip ${lit.length ? "lit" : ""}`} disabled={!lights.length} onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY, type: e.pointerType })} onClick={toggleRoom} title={lights.length ? (lit.length ? "Turn room lights off" : "Turn room lights on") : room.name}>
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
