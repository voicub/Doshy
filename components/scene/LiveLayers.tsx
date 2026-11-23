"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  MathUtils,
  NormalBlending,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  CapsuleGeometry,
  BufferGeometry,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RoomLive } from "@/lib/live";
import { useHouseLive, useLiveRooms } from "@/lib/useLive";
import { useLiveLayer } from "@/lib/liveLayer";
import { planBounds } from "@/lib/geometry";
import { planOfLevel } from "@/lib/levels";
import { roomGroup } from "@/lib/planOps";
import { useStore } from "@/lib/store";
import type { Plan, Room } from "@/lib/types";
import { useReducedMotion } from "./motion";
import { useNow } from "../useNow";
import SceneHtml from "./SceneHtml";
import Stream, { type StreamDrive, type StreamShape } from "./Stream";

const { damp, clamp } = MathUtils;

type LayerName = "heat" | "humidity" | "presence" | "power";
type Levels = Record<LayerName, number>;

const FADE_RATE = 4;
const FLOOR_Y = 0.088; // above the floor plate (0.06) and light pools (0.075)
const OVERLAY_OPACITY = 0.5;
const SHIMMER = 0.12;
const MAX_ROOM_WATTS = 1500; // a room at this draw glows fully
const MAX_HOUSE_WATTS = 4000; // full house gauge
const CYAN = new Color("#27e0ff");
const AMBER = new Color("#ffae2e");
const TEAL = new Color("#2fd4c8");
const GREY = new Color("#8aa0ad");
const FIGURE_H = 1.75;

// temperature ramp: <=17 deep blue, 20 teal, 22 green, 24 amber, >=27 red
const RAMP: [number, Color][] = [
  [17, new Color("#2a4fff")],
  [20, new Color("#1fc4c4")],
  [22, new Color("#4fd16a")],
  [24, new Color("#ffb02e")],
  [27, new Color("#ff3b2e")],
];
function rampColor(t: number, out: Color) {
  if (t <= RAMP[0][0]) return out.copy(RAMP[0][1]);
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0));
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

let feather: CanvasTexture | null = null;
/** White square whose alpha falls off softly towards every edge: a feathered rectangle once tinted. */
function featherTexture() {
  if (!feather) {
    const N = 64;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d")!;
    const img = g.createImageData(N, N);
    const edge = (u: number) => {
      const t = clamp(Math.min(u, 1 - u) / 0.22, 0, 1);
      return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const a = edge((x + 0.5) / N) * edge((y + 0.5) / N);
        const i = (y * N + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    feather = new CanvasTexture(c);
    feather.colorSpace = SRGBColorSpace;
  }
  return feather;
}

// ---- hologram figure -------------------------------------------------------------------------------------------------

let figureGeo: BufferGeometry | null = null;
/** Low-poly person: head, torso, two arms, two legs. One merged geometry, built once. */
function figureGeometry() {
  if (!figureGeo) {
    const parts: BufferGeometry[] = [];
    const add = (g: BufferGeometry, x: number, y: number, z = 0) => {
      g.translate(x, y, z);
      parts.push(g);
    };
    add(new SphereGeometry(0.11, 12, 10), 0, 1.6);
    add(new CapsuleGeometry(0.17, 0.42, 4, 10), 0, 1.2);
    add(new CapsuleGeometry(0.06, 0.5, 4, 8), -0.26, 1.15);
    add(new CapsuleGeometry(0.06, 0.5, 4, 8), 0.26, 1.15);
    add(new CapsuleGeometry(0.08, 0.62, 4, 8), -0.1, 0.4);
    add(new CapsuleGeometry(0.08, 0.62, 4, 8), 0.1, 0.4);
    figureGeo = mergeGeometries(parts.map((p) => p.toNonIndexed())) ?? new BufferGeometry();
    parts.forEach((p) => p.dispose());
  }
  return figureGeo;
}

const HOLO_VERT = /* glsl */ `
varying float vY;
varying float vF;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vY = position.y;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 v = normalize(cameraPosition - w.xyz);
  vF = pow(1.0 - abs(dot(n, v)), 2.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const HOLO_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform vec3 uColor;
varying float vY;
varying float vF;
void main() {
  float lines = 0.7 + 0.3 * step(0.5, fract(vY * 34.0 - uTime * 0.7));
  float scan = exp(-abs(fract(uTime * 0.22) * ${(FIGURE_H + 0.2).toFixed(2)} - vY) * 12.0) * 1.2;
  float a = uLevel * (0.16 + 0.5 * vF + scan) * lines;
  gl_FragColor = vec4(uColor * (1.0 + scan), a);
}
`;

// ---- shared per-frame state --------------------------------------------------------------------------------------------

type Shared = { levels: Levels; time: MutableRefObject<number>; reduced: boolean };

const minutesSince = (since: number) => Math.max(0, Math.floor((Date.now() - since) / 60000));

const humidityDensity = (rh: number) => clamp(0.1 + ((rh - 35) / 40) * 0.9, 0.1, 1);

function Overlay({ room, color, opacity, additive }: { room: Room; color: Color; opacity: MutableRefObject<number>; additive?: boolean }) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const m = mat.current;
    if (!m) return;
    m.color.copy(color);
    m.opacity = opacity.current;
  });
  return (
    <mesh position={[room.x + room.w / 2, FLOOR_Y, room.y + room.h / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={() => null}>
      <planeGeometry args={[room.w, room.h]} />
      <meshBasicMaterial
        ref={mat}
        map={featherTexture()}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
        blending={additive ? AdditiveBlending : NormalBlending}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function Ring({ radius, color, level, phase }: { radius: number; color: Color; level: MutableRefObject<number>; phase: MutableRefObject<number> }) {
  const mesh = useRef<Mesh>(null);
  const geo = useMemo(() => new RingGeometry(0.94, 1, 56), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const p = phase.current % 1;
    const s = radius * (0.55 + 0.45 * p);
    m.scale.set(s, s, 1);
    const mat = m.material as MeshBasicMaterial;
    mat.color.copy(color);
    mat.opacity = level.current * (1 - p) * 0.9;
    m.visible = level.current > 0.01;
  });
  return (
    <mesh ref={mesh} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y + 0.004, 0]} renderOrder={3} raycast={() => null} visible={false}>
      <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} blending={AdditiveBlending} side={DoubleSide} />
    </mesh>
  );
}

const LABEL_Y = 1.55;
const NO_DATA: RoomLive = { presence: null };

/** The damped per-frame values of one room's layers, kept off React state. */
type RoomDrive = {
  heatColor: Color;
  heatOp: MutableRefObject<number>;
  humOp: MutableRefObject<number>;
  mistLevel: MutableRefObject<number>;
  /** Damped 0..1 occupied. */
  occ: MutableRefObject<number>;
  occRingLevel: MutableRefObject<number>;
  emptyLevel: MutableRefObject<number>;
  ringPhase: MutableRefObject<number>;
  figure: RefObject<Group | null>;
  scan: RefObject<Mesh | null>;
  powOp: MutableRefObject<number>;
  powRing: MutableRefObject<number>;
  powPhase: MutableRefObject<number>;
};

/** Eases one room's heat, humidity, presence and power layers toward its live data every frame. */
function useRoomDrive(data: RoomLive, shared: Shared): RoomDrive {
  const { levels, reduced } = shared;
  const dataRef = useRef(data);
  dataRef.current = data;
  const heatColor = useMemo(() => new Color(), []);
  const heatOp = useRef(0);
  const humOp = useRef(0);
  const mistLevel = useRef(0);
  const occ = useRef(0);
  const occRingLevel = useRef(0);
  const emptyLevel = useRef(0);
  const ringPhase = useRef(0);
  const figure = useRef<Group>(null);
  const scan = useRef<Mesh>(null);
  const powOp = useRef(0);
  const powRing = useRef(0);
  const powPhase = useRef(0);

  const t0 = useMemo(() => Math.random() * 10, []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const d = dataRef.current;
    const t = shared.time.current + t0;
    const shimmer = reduced ? 1 : 1 - SHIMMER + SHIMMER * Math.sin(t * 0.7);

    heatOp.current = d.temp ? levels.heat * OVERLAY_OPACITY * shimmer : 0;
    if (d.temp) rampColor(d.temp.value, heatColor);

    const dens = d.humidity ? humidityDensity(d.humidity.value) : 0;
    humOp.current = levels.humidity * dens * 0.55 * shimmer;
    mistLevel.current = levels.humidity * dens;

    const present = d.presence === true;
    occ.current = damp(occ.current, present ? 1 : 0, 3, dt);
    if (levels.presence > 0 && Math.abs(occ.current - (present ? 1 : 0)) > 0.002) keepAlive(false);
    occRingLevel.current = levels.presence * occ.current;
    emptyLevel.current = levels.presence * (d.presence === false ? 1 : 0) * 0.35;
    ringPhase.current += dt * (reduced ? 0 : 0.55);
    const f = figure.current;
    if (f) {
      const k = levels.presence * occ.current;
      f.visible = k > 0.01;
      f.scale.setScalar(0.85 + 0.15 * k);
      f.rotation.y = reduced ? 0 : t * 0.35;
    }
    const s = scan.current;
    if (s) {
      s.position.y = 0.05 + ((reduced ? 0.5 : (t * 0.22) % 1) * (FIGURE_H + 0.2));
      s.visible = levels.presence * occ.current > 0.01;
    }

    const w = d.powerW ?? 0;
    const pk = clamp(w / MAX_ROOM_WATTS, 0, 1);
    powOp.current = w > 0 ? levels.power * (0.12 + 0.5 * Math.sqrt(pk)) * shimmer : 0;
    powRing.current = w > 0 ? levels.power * (0.3 + 0.7 * Math.sqrt(pk)) : 0;
    powPhase.current += dt * (reduced ? 0 : clamp(0.25 + w / 700, 0.25, 2.5));
  });
  return { heatColor, heatOp, humOp, mistLevel, occ, occRingLevel, emptyLevel, ringPhase, figure, scan, powOp, powRing, powPhase };
}

/** The hologram material, lit by how occupied the room is (registered after the drive's frame callback, so it reads this frame's value). */
function useHoloMaterial(shared: Shared, occ: MutableRefObject<number>): ShaderMaterial {
  const holoMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: HOLO_VERT,
        fragmentShader: HOLO_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uColor: { value: CYAN.clone() } },
      }),
    [],
  );
  useEffect(() => () => holoMat.dispose(), [holoMat]);
  useFrame(() => {
    holoMat.uniforms.uTime.value = shared.time.current;
    holoMat.uniforms.uLevel.value = shared.levels.presence * occ.current;
  });
  return holoMat;
}

/** The text on a room's floating badge for the layer being shown (null: nothing to say). */
function roomLabel(layer: string, data: RoomLive): string | null {
  if (layer === "heat" && data.temp) return `${data.temp.value.toFixed(1)} C`;
  if (layer === "humidity" && data.humidity) return `${Math.round(data.humidity.value)} %`;
  if (layer === "presence" && data.presence === true) {
    const mins = data.presenceSince != null ? minutesSince(data.presenceSince) : null;
    return `OCCUPIED${mins != null ? ` ${mins} MIN` : ""}`;
  }
  if (layer === "power" && data.powerW != null) return `${Math.round(data.powerW)} W`;
  return null;
}

/** The hologram of a person (the merged figure plus a scan ring that rises through it). */
function RoomFigure({ figure, scan, holoMat }: { figure: RefObject<Group | null>; scan: RefObject<Mesh | null>; holoMat: ShaderMaterial }) {
  const scanGeo = useScanGeometry();
  return (
    <group ref={figure} visible={false}>
      <mesh geometry={figureGeometry()} material={holoMat} renderOrder={4} raycast={() => null} />
      <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]} geometry={scanGeo} renderOrder={4} raycast={() => null}>
        <meshBasicMaterial color={CYAN} transparent opacity={0.8} depthWrite={false} toneMapped={false} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
    </group>
  );
}

function RoomLayers({ room, data, shared, group }: { room: Room; data: RoomLive; shared: Shared; group: Room[] }) {
  useNow(30_000); // re-renders the occupied-for text
  const drive = useRoomDrive(data, shared);
  const holoMat = useHoloMaterial(shared, drive.occ);
  const layer = useLiveLayer((s) => s.layer);
  const label = roomLabel(layer, data);

  const radius = Math.min(room.w, room.h) * 0.42;
  const mist = useMemo<StreamShape>(() => ({ origin: [0, 0.5, 0], ext: [room.w * 0.9, 0.9, room.h * 0.9], dir: [0.1, 0.35, 0.05], sway: 0.2, px: 3.6 }), [room.w, room.h]);
  const mistDrive = useMemo<StreamDrive>(
    () => (u) => {
      u.uLevel.value = drive.mistLevel.current * 0.9;
      u.uColor.value.set(TEAL.r, TEAL.g, TEAL.b).multiplyScalar(1.3);
      return 0.12;
    },
    [drive.mistLevel],
  );

  return (
    <>
      {group.map((r) => (
        <Group4 key={r.id} room={r} heatColor={drive.heatColor} heatOp={drive.heatOp} humOp={drive.humOp} powOp={drive.powOp} />
      ))}
      <group position={[room.x + room.w / 2, 0, room.y + room.h / 2]}>
        <Stream count={70} shape={mist} drive={mistDrive} />
        <Ring radius={radius} color={CYAN} level={drive.occRingLevel} phase={drive.ringPhase} />
        <Ring radius={radius * 0.7} color={GREY} level={drive.emptyLevel} phase={drive.ringPhase} />
        <Ring radius={radius} color={AMBER} level={drive.powRing} phase={drive.powPhase} />
        <RoomFigure figure={drive.figure} scan={drive.scan} holoMat={holoMat} />
        {label && (
          <SceneHtml position={[0, LABEL_Y, -Math.min(0.6, room.h * 0.15)]}>
            <div className="badge">{label}</div>
          </SceneHtml>
        )}
      </group>
    </>
  );
}

function useScanGeometry() {
  const geo = useMemo(() => new RingGeometry(0.34, 0.37, 40), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/** The overlay meshes of one room rectangle (the parent and each of its alcoves) for every area layer. */
function Group4({ room, heatColor, heatOp, humOp, powOp }: { room: Room; heatColor: Color; heatOp: MutableRefObject<number>; humOp: MutableRefObject<number>; powOp: MutableRefObject<number> }) {
  return (
    <>
      <Overlay room={room} color={heatColor} opacity={heatOp} />
      <Overlay room={room} color={TEAL} opacity={humOp} />
      <Overlay room={room} color={AMBER} opacity={powOp} additive />
    </>
  );
}

// ---- house power gauge -------------------------------------------------------------------------------------------------

function HouseGauge({ plan, shared }: { plan: Plan; shared: Shared }) {
  const house = useHouseLive();
  const layer = useLiveLayer((s) => s.layer);
  const w = house?.powerW ?? 0;
  const b = planBounds(plan);
  const frac = clamp(w / MAX_HOUSE_WATTS, 0.02, 1);
  const R = b ? Math.max(3, Math.hypot(b.x1 - b.x0, b.y1 - b.y0) * 0.36) : 4;
  const track = useMemo(() => new RingGeometry(R, R + 0.06, 96, 1, 0, Math.PI * 1.5), [R]);
  const value = useMemo(() => new RingGeometry(R - 0.03, R + 0.09, 96, 1, 0, Math.PI * 1.5 * frac), [R, frac]);
  useEffect(() => () => track.dispose(), [track]);
  useEffect(() => () => value.dispose(), [value]);
  const grp = useRef<Group>(null);
  const valMat = useRef<MeshBasicMaterial>(null);
  const trkMat = useRef<MeshBasicMaterial>(null);
  const reduced = useReducedMotion();
  useFrame(({ clock }) => {
    const l = shared.levels.power;
    if (grp.current) grp.current.visible = l > 0.01;
    if (valMat.current) valMat.current.opacity = l * (reduced ? 0.95 : 0.75 + 0.2 * Math.sin(clock.elapsedTime * 2));
    if (trkMat.current) trkMat.current.opacity = l * 0.22;
  });
  if (!b || house?.powerW == null) return null;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.y0 + b.y1) / 2;
  return (
    <group ref={grp} position={[cx, 3.5, cz]} rotation={[-Math.PI / 2, 0, Math.PI * 0.75]} visible={false}>
      <mesh geometry={track} renderOrder={5} raycast={() => null}>
        <meshBasicMaterial ref={trkMat} color={AMBER} transparent opacity={0} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh geometry={value} renderOrder={5} raycast={() => null}>
        <meshBasicMaterial ref={valMat} color={AMBER} transparent opacity={0} depthWrite={false} toneMapped={false} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
      {layer === "power" && (
        <SceneHtml position={[0, 0, 0]}>
          <div className="badge">{`HOUSE ${Math.round(w)} W`}</div>
        </SceneHtml>
      )}
    </group>
  );
}

// ---- entry -------------------------------------------------------------------------------------------------------------

/** Live data painted onto the flat: heat map, humidity mist, presence holograms and power glow. Live view only; fades between layers. */
export default function LiveLayers({ levelId, gauge }: { levelId: string; gauge: boolean }) {
  const view = useStore((s) => s.view);
  const cinema = useStore((s) => s.cinema);
  const plan = useStore((s) => s.plan);
  const layer = useLiveLayer((s) => s.layer);
  const rooms = useLiveRooms();
  const reduced = useReducedMotion();
  const active = view === "live" && !cinema ? layer : "off";

  const shared = useMemo<Shared>(() => ({ levels: { heat: 0, humidity: 0, presence: 0, power: 0 }, time: { current: 0 }, reduced }), [reduced]);
  const want = useRef(active);
  want.current = active;
  useFrame((_, dt) => {
    shared.time.current += Math.min(dt, 0.1);
    for (const k of ["heat", "humidity", "presence", "power"] as const) {
      const want_ = want.current === k ? 1 : 0;
      shared.levels[k] = damp(shared.levels[k], want_, FADE_RATE, Math.min(dt, 0.1));
      if (shared.levels[k] < 0.002) shared.levels[k] = 0;
      // fading between layers, or a layer is up and shimmering / scanning / pulsing
      if (Math.abs(shared.levels[k] - want_) > 0.002 || (want_ === 1 && !reduced)) keepAlive(false);
    }
  });

  const lp = useMemo(() => planOfLevel(plan, levelId), [plan, levelId]);
  const top = lp.rooms.filter((r) => !r.parent);
  if (view !== "live") return null;
  return (
    <>
      {top.map((r) => (
        <RoomLayers key={r.id} room={r} data={rooms[r.id] ?? NO_DATA} shared={shared} group={roomGroup(lp, r)} />
      ))}
      {gauge && <HouseGauge plan={plan} shared={shared} />}
    </>
  );
}
