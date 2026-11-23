"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import {
  AppWindowIcon, CellSignalHighIcon, CloudIcon, CloudRainIcon, DoorOpenIcon, DropIcon, DropHalfIcon, EyeIcon, FireIcon, FlameIcon, GaugeIcon, LightbulbFilamentIcon,
  LightningIcon, LockIcon, MicrophoneIcon, PersonSimpleWalkIcon, PlantIcon, PlayIcon, PlugIcon, RulerIcon, SirenIcon, SnowflakeIcon, SunIcon, ThermometerHotIcon, ThermometerSimpleIcon,
  VibrateIcon, WarningIcon, WaveSineIcon, WifiHighIcon, WifiSlashIcon, WindIcon, BatteryMediumIcon, CheckIcon, ArrowsClockwiseIcon, type Icon,
} from "@phosphor-icons/react";
import { useMemo, useRef } from "react";
import { AdditiveBlending, MathUtils, type Mesh, type MeshBasicMaterial, type SpriteMaterial } from "three";
import type { Def } from "@/lib/catalog";
import { WALL_CUT_H } from "@/lib/geometry";
import { classify } from "@/lib/placement";
import { runLabel } from "@/lib/running";
import type { SensorIcon, SensorInfo } from "@/lib/sensors";
import { glowTexture } from "@/lib/textures";
import type { Item } from "@/lib/types";
import { useReducedMotion } from "./motion";
import { useNow } from "../useNow";
import { Marker } from "./DeclutterLayer";
import Stream, { type StreamDrive, type StreamShape } from "./Stream";
import { useItemLive, type RunLive } from "./useItemLive";
import "./SensorFx.css";

const ICONS: Record<SensorIcon, Icon> = {
  motion: PersonSimpleWalkIcon, presence: EyeIcon, door: DoorOpenIcon, window: AppWindowIcon, lock: LockIcon, smoke: FireIcon, gas: FlameIcon, leak: DropIcon, vibration: VibrateIcon,
  alert: WarningIcon, battery: BatteryMediumIcon, plug: PlugIcon, sound: WaveSineIcon, light: LightbulbFilamentIcon, cold: SnowflakeIcon, heat: ThermometerHotIcon, wifi: WifiHighIcon,
  running: PlayIcon, update: ArrowsClockwiseIcon, temp: ThermometerSimpleIcon, humidity: DropHalfIcon, pressure: GaugeIcon, lux: SunIcon, uv: SunIcon, air: CloudIcon, noise: MicrophoneIcon,
  power: LightningIcon, energy: LightningIcon, wind: WindIcon, rain: CloudRainIcon, distance: RulerIcon, signal: CellSignalHighIcon, gauge: GaugeIcon, siren: SirenIcon, soil: PlantIcon, check: CheckIcon,
};
const OFFLINE_ICON = WifiSlashIcon;

const RINGS = 3;
const RADAR_PERIOD = 3.2; // s per ring lifetime: calm
const RING_MAX_R = { ceiling: 1.6, mounted: 0.5, floor: 0.7 } as const;
const HALO_SIZE = 0.42;
const BADGE_LIFT = 0.3; // metres above the item's top, like the generic badge it replaces
const DRIP_SHAPE_H = 0.34;

/** Where a small device's marker sits (its LED, else its first part), in the item's local metres. Rings and halos centre here. */
function anchorOf(item: Item, def: Def, elev: number): [number, number, number] {
  const part = def.parts.find((p) => p.glow) ?? def.parts[0];
  return [(part.p[0] * item.w) / def.w, elev + (part.p[1] * item.h) / def.h, (part.p[2] * item.d) / def.d];
}

/** Expanding radar rings: on the floor below a ceiling or standing sensor, on the wall around a wall-mounted one. Reduced motion: one static ring. */
function Rings({ item, def, elev, color, reduced }: { item: Item; def: Def; elev: number; color: string; reduced: boolean }) {
  const place = classify(def, item.kind);
  const [ax, ay, az] = useMemo(() => anchorOf(item, def, elev), [item, def, elev]);
  const maxR = place === "ceiling" ? RING_MAX_R.ceiling : place === "mounted" ? RING_MAX_R.mounted : RING_MAX_R.floor;
  const wall = place === "mounted";
  const meshes = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    for (let i = 0; i < RINGS; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      const k = reduced ? 0.6 : (clock.elapsedTime / RADAR_PERIOD + i / RINGS) % 1;
      m.scale.setScalar(Math.max(0.01, maxR * (0.1 + 0.9 * k)));
      (m.material as MeshBasicMaterial).opacity = reduced ? (i === 0 ? 0.45 : 0) : Math.min(1, k * 12) * (1 - k) ** 1.5 * 0.6;
    }
    if (!reduced) keepAlive(false);
  });
  const pos: [number, number, number] = wall ? [ax, ay, item.d / 2 + 0.006] : [ax, place === "ceiling" ? 0.03 : elev + 0.012, az];
  return (
    <group position={pos} rotation={wall ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh key={i} ref={(m) => void (meshes.current[i] = m)} renderOrder={3} raycast={() => null}>
          <ringGeometry args={[0.94, 1, 72]} />
          <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

/** A soft round halo on the device: pulses (alarms), blinks (open door) or sits steady. */
function Halo({ pos, color, mode, reduced }: { pos: [number, number, number]; color: string; mode: "pulse" | "blink" | "steady"; reduced: boolean }) {
  const mat = useRef<SpriteMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const t = clock.elapsedTime;
    mat.current.opacity = reduced || mode === "steady" ? 0.55 : mode === "pulse" ? 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.4)) : Math.sin(t * 6) > 0 ? 0.75 : 0.12;
    if (!reduced && mode !== "steady") keepAlive(false);
  });
  return (
    <sprite position={pos} scale={[HALO_SIZE, HALO_SIZE, 1]} renderOrder={3}>
      <spriteMaterial ref={mat} map={glowTexture()} color={color} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </sprite>
  );
}

/** Drops falling onto a leak sensor. */
function Drip({ pos, color }: { pos: [number, number, number]; color: string }) {
  const shape = useMemo<StreamShape>(() => ({ origin: [pos[0], pos[1] + DRIP_SHAPE_H / 2 + 0.02, pos[2]], ext: [0.06, 0, 0.06], dir: [0, -DRIP_SHAPE_H, 0], flat: 1, px: 3.4 }), [pos]);
  const drive = useMemo<StreamDrive>(() => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
    return (u) => {
      u.uLevel.value = 0.9;
      u.uColor.value.set(r, g, b);
      return 0.9;
    };
  }, [color]);
  return <Stream count={8} shape={shape} drive={drive} />;
}

/**
 * Live look of an item linked to a sensor: radar rings for presence / motion, a pulsing or blinking halo for alarms and open doors, drops for a leak.
 * (Shake and the LED colour are driven in ItemMesh, where the parts live.) With reduced motion everything is a static ring / halo.
 */
export default function SensorFx({ item, def, elev, info }: { item: Item; def: Def; elev: number; info: SensorInfo }) {
  const reduced = useReducedMotion();
  const pos = useMemo(() => anchorOf(item, def, elev), [item, def, elev]);
  const { anim, color } = info;
  return (
    <>
      {anim === "radar" && <Rings item={item} def={def} elev={elev} color={color} reduced={reduced} />}
      {(anim === "pulse" || anim === "drip") && <Halo pos={pos} color={color} mode="pulse" reduced={reduced} />}
      {anim === "blink" && <Halo pos={pos} color={color} mode="blink" reduced={reduced} />}
      {anim === "shake" && <Halo pos={pos} color={color} mode="steady" reduced={reduced} />}
      {anim === "drip" && !reduced && <Drip pos={pos} color={color} />}
      <SensorMarker id={`${item.id}:s`} position={[0, Math.min(item.h + elev, 2.4) + BADGE_LIFT, 0]} info={info} />
    </>
  );
}

/** A sensor's badge as a declutter marker: alerts and anything detecting stay in full, a calm reading may shrink to a status dot. */
function SensorMarker({ id, position, info }: { id: string; position: [number, number, number]; info: SensorInfo }) {
  const calm = !info.alert && !(info.active && info.num === undefined);
  return (
    <Marker id={id} kind="sensor" position={position} alert={info.alert} dot={calm ? info.color : undefined} label={`${info.label}: ${info.value}`}>
      <SensorBadge info={info} />
    </Marker>
  );
}

function SensorBadge({ info }: { info: SensorInfo }) {
  const Glyph = info.unavailable ? OFFLINE_ICON : ICONS[info.icon];
  return (
    <div className={`sfx-badge ${info.alert ? "alert" : ""} ${info.active ? "on" : ""}`} data-anim={info.anim} style={{ ["--sc" as string]: info.color }} title={`${info.label}: ${info.value}`}>
      <Glyph size={13} weight={info.active || info.alert ? "fill" : "regular"} aria-hidden />
      <span className="sfx-val">{info.value}</span>
    </div>
  );
}

/** Badge for an appliance on a smart plug: what it is doing and the live watts ("Washing, 412 W / Running 0:42", "Finished / 3 min ago"). */
function RunBadge({ run }: { run: RunLive }) {
  const live = run.status.state === "running" || run.status.state === "finished";
  const now = useNow(run.status.state === "running" ? 1000 : 15_000, live); // ticks between the 3 s state polls
  const { title, sub } = runLabel(run.family, run.status, run.watts, now);
  return (
    <div className={`sfx-badge run ${run.status.state}`} style={{ ["--sc" as string]: run.status.state === "finished" ? "#43d17a" : "#5ad7ff" }} aria-live="off">
      <span className="sfx-val">{title}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/** Steam rising off a kettle or coffee machine while it runs. */
function Steam({ item, elev, running }: { item: Item; elev: number; running: boolean }) {
  const level = useRef(0);
  const target = useRef(0);
  target.current = running ? 1 : 0;
  const shape = useMemo<StreamShape>(
    () => ({ origin: [0, elev + item.h + 0.02, 0], ext: [Math.max(0.04, item.w * 0.3), 0, Math.max(0.04, item.d * 0.3)], dir: [0, 0.4, 0], sway: 0.05, px: 3 }),
    [elev, item.h, item.w, item.d],
  );
  const drive = useMemo<StreamDrive>(
    () => (u, dt) => {
      level.current = MathUtils.damp(level.current, target.current, 2.5, dt);
      u.uLevel.value = level.current * 0.45;
      u.uColor.value.set(0.92, 0.95, 1);
      return 0.45;
    },
    [],
  );
  return <Stream count={22} shape={shape} drive={drive} />;
}

/** Plug-driven extras of an appliance: steam, and the state badge above it. */
export function RunFx({ item, elev, run }: { item: Item; elev: number; run: RunLive }) {
  const reduced = useReducedMotion();
  return (
    <>
      {run.steam && !reduced && <Steam item={item} elev={elev} running={run.running} />}
      <Marker id={`${item.id}:run`} kind="run" position={[0, Math.min(item.h + elev, 2.4) + BADGE_LIFT + 0.32, 0]} dot={run.status.state === "running" || run.status.state === "finished" ? undefined : "#8a98a3"} label="Appliance">
        <RunBadge run={run} />
      </Marker>
    </>
  );
}

/** Walls lowered (cut-away live view): a wall or ceiling sensor goes with its wall, so only its badge stays, at the height of the cut wall tops. */
export function SensorStub({ item }: { item: Item }) {
  const info = useItemLive(item).sensor;
  if (!info) return null;
  return (
    <group position={[item.x, 0, item.y]}>
      <SensorMarker id={`${item.id}:s`} position={[0, Math.min(item.h + (item.elev ?? 0), WALL_CUT_H) + BADGE_LIFT, 0]} info={info} />
    </group>
  );
}
