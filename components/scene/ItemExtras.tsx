import type { Icon } from "@phosphor-icons/react";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Plane, Vector3, type SpriteMaterial } from "three";
import { roomAtLevel } from "@/lib/geometry";
import type { HAState } from "@/lib/ha";
import { elevationOf, floorY } from "@/lib/levels";
import { rgbCss, type RGB } from "@/lib/light";
import { useStore } from "@/lib/store";
import { glowTexture } from "@/lib/textures";
import type { Item } from "@/lib/types";
import { openZone } from "@/lib/zones";
import { Marker as DeviceMarker } from "./DeclutterLayer";
import { openDevice, type DeviceGesture } from "./itemGesture";
import { useLevel } from "./levelState";
import { SHADOW_MAP } from "./pointShadow";
import { useReducedMotion } from "./motion";
import Stream, { type StreamDrive, type StreamShape } from "./Stream";
import type { ItemFrame } from "./useItemFrame";

/** A device reporting one of these is an alert: never folded into a cluster, always on top. */
const ERROR_STATES = ["error", "fault", "problem", "tamper"];

/** Warm halo and rising heat shimmer for a heating radiator / climate item. `heat` is a 0..1 damped ref. */
export function HeatFx({ item, elev, heat }: { item: Item; elev: number; heat: { current: number } }) {
  const reduced = useReducedMotion();
  const halo = useRef<SpriteMaterial>(null);
  const shape = useMemo<StreamShape>(
    () => ({ origin: [0, elev + item.h, 0], ext: [Math.max(0.05, item.w * 0.9), 0, Math.max(0.05, item.d)], dir: [0, Math.min(0.9, 0.35 + item.h * 0.6), 0], sway: 0.07, px: 3.2 }),
    [elev, item.h, item.w, item.d],
  );
  const drive = useMemo<StreamDrive>(
    () => (u) => {
      u.uLevel.value = heat.current * 0.4;
      u.uColor.value.set(1, 0.62, 0.3);
      return 0.35;
    },
    [heat],
  );
  useFrame(() => {
    if (halo.current) halo.current.opacity = heat.current * 0.5;
  });
  return (
    <>
      <sprite position={[0, elev + item.h * 0.55, 0.05]} scale={[item.w * 2 + 0.35, item.h * 1.6 + 0.35, 1]} renderOrder={3}>
        <spriteMaterial ref={halo} map={glowTexture()} color="#ff7a2a" transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </sprite>
      {!reduced && <Stream count={24} shape={shape} drive={drive} />}
    </>
  );
}

/** Where an item stands and the floor space its light pool is clipped to: the pool stays inside the space it belongs to (it would otherwise spill through walls onto the ground). Rooms with no wall between them (hall, living room, kitchen) are one space. */
export function useFloorPool(item: Item) {
  const { id: levelId } = useLevel();
  // an item standing outside a raised building is on the ground: the level group sits at the floor, so drop by the difference
  const drop = useStore((s) => floorY(s.plan, item) - elevationOf(s.plan, levelId));
  const room = useStore((s) => roomAtLevel(s.plan, levelId, item.x, item.y));
  const rooms = useStore((s) => s.plan.rooms);
  const walls = useStore((s) => s.plan.walls);
  const clips = useMemo(() => {
    if (!room) return [undefined];
    const zone = openZone({ ...useStore.getState().plan, rooms, walls }, levelId, room);
    return zone.map((r) => [
      new Plane(new Vector3(1, 0, 0), -r.x),
      new Plane(new Vector3(-1, 0, 0), r.x + r.w),
      new Plane(new Vector3(0, 0, 1), -r.y),
      new Plane(new Vector3(0, 0, -1), r.y + r.h),
    ]);
  }, [room, rooms, walls, levelId]);
  return { drop, clips };
}

type LampProps = { frame: ItemFrame; clips: (Plane[] | undefined)[]; litPoint: boolean; castsPoint: boolean; lightY: number };

/** A light fixture's point light (the first few lamps only) and its soft pool on the floor, one per open space it reaches. */
export function LampLight({ frame, clips, litPoint, castsPoint, lightY }: LampProps) {
  const ceiling = lightY > 1.8;
  const poolSize = ceiling ? 5.2 : 3.4;
  return (
    <>
      {litPoint && (
        <pointLight
          ref={frame.lightRef}
          position={[0, lightY - 0.15, 0]}
          intensity={0}
          distance={castsPoint ? (ceiling ? 9 : 6) : 3} // without a shadow map the light would pass through walls, so keep it short
          decay={1.6}
          castShadow={castsPoint}
          shadow-autoUpdate={false}
          shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
          shadow-bias={-0.004}
          shadow-normalBias={0.03}
          shadow-camera-near={0.1}
          shadow-radius={3}
        />
      )}
      {clips.map((planes, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]} renderOrder={2}>
          <planeGeometry args={[poolSize, poolSize]} />
          <meshBasicMaterial ref={(m) => void (frame.poolMats.current[i] = m)} map={glowTexture()} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} clippingPlanes={planes} />
        </mesh>
      ))}
    </>
  );
}

type BadgeProps = {
  item: Item;
  st: HAState;
  label: string | undefined;
  /** Height of the marker above the item's floor. */
  y: number;
  canToggle: boolean;
  isCamera: boolean;
  lit: boolean;
  rgb: RGB;
  Icon: Icon;
  gesture: DeviceGesture;
  /** Taps open the curtain card instead of toggling. */
  openCurtain: ((x: number, y: number) => void) | null;
  toggle: (entity: string) => unknown;
};

/** The state badge of a linked device in the live view: a toggle ring, a camera button or a plain value chip. */
export function ItemBadge({ item, st, label, y, canToggle, isCamera, lit, rgb, Icon, gesture, openCurtain, toggle }: BadgeProps) {
  const alert = ERROR_STATES.includes(st.state);
  const on = lit || st.state === "on";
  return (
    <DeviceMarker
      id={`${item.id}:ring`}
      kind={canToggle ? "ring" : isCamera ? "camera" : "badge"}
      position={[0, y, 0]}
      alert={alert}
      dot={canToggle || isCamera || alert ? undefined : "#8a98a3"}
      label={`${label}: ${st.state}`}
    >
      {canToggle ? (
        <button
          className={`ring ${on ? "on" : ""}`}
          style={{ ["--lc" as string]: rgbCss(rgb), ["--lc-soft" as string]: rgbCss(rgb, 0.45) }}
          title={`${label}: ${st.state}`}
          aria-label={`${label}: ${st.state}`}
          aria-pressed={on}
          onClick={(e) => {
            e.stopPropagation();
            if (gesture.tap(e.shiftKey, e.clientX, e.clientY)) (openCurtain ? openCurtain(e.clientX, e.clientY) : void toggle(st.entity_id));
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            gesture.menu(e.clientX, e.clientY);
          }}
          onPointerDown={(e) => gesture.start(e.clientX, e.clientY)}
          onPointerUp={gesture.cancel}
          onPointerLeave={gesture.cancel}
        >
          <Icon weight={lit ? "fill" : "regular"} size={16} />
        </button>
      ) : isCamera ? (
        <button type="button" className="badge" title={`${label}: ${st.state}. Open the picture`} onClick={(e) => openDevice(st.entity_id, e.clientX, e.clientY)}>
          {`${label} ${st.state}`}
        </button>
      ) : (
        <div className="badge">{`${st.state}${st.attributes.unit_of_measurement ?? ""}`}</div>
      )}
    </DeviceMarker>
  );
}
