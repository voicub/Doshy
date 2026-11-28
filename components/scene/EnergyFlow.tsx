"use client";
import { BatteryMediumIcon, HouseIcon, PlugChargingIcon, PlugsConnectedIcon, SunIcon, type Icon } from "@phosphor-icons/react";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { BoxGeometry, CatmullRomCurve3, Color, InstancedMesh, Matrix4, Quaternion, TubeGeometry, Vector3 } from "three";
import { ENERGY_COLORS, flowLines, hasLiveSources, sourceStatus, type EnergyNow, type FlowSegment, type SourceKey } from "@/lib/energy";
import { arcPoints, energyLayout } from "@/lib/energyLayout";
import { intensity, formatPower, isIdle, makePath, pointAt, pulseOf, smoothTo, type Path, type Pulse } from "@/lib/flows";
import { keepAlive } from "@/lib/framePacer";
import { levelIdOf } from "@/lib/levels";
import { useLiveLayer } from "@/lib/liveLayer";
import type { V3 } from "@/lib/mathUtil";
import { useKnobs } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { useEnergy, useEnergyNow, useEnergySources } from "@/lib/useEnergy";
import { useLiveRooms } from "@/lib/useLive";
import CarEvRing from "./CarEvRing";
import { Marker } from "./DeclutterLayer";
import { useLevelVisibility } from "./levelState";
import { useReducedMotion } from "./motion";
import "./flows.css";
import "./energyFlow.css";

/** All pulses of every line share one instanced mesh. */
const MAX_PULSES = 400;
const MAX_PER_LINE = 40;
/** Rooms with the biggest draw get a line; the rest would only add clutter (and pulses). */
const MAX_ROOM_LINES = 24;
const TUBE_R = 0.018;
/** Eco, Light and reduced motion draw still lines, thicker so that they read without motion. */
const STILL_TUBE_R = 0.04;
const DASH = 3;
const FADE_LEN = 0.35;
const GLOW = 1.5;
const Z = new Vector3(0, 0, 1);
const tmp = { pos: [0, 0, 0] as V3, tan: [0, 0, 0] as V3, v: new Vector3(), q: new Quaternion(), m: new Matrix4(), scale: new Vector3(), col: new Color() };

type Shape = { key: string; path: Path; /** where the watt label hangs */ mid: V3 };
type Anim = { w: number; phase: number };

const SOURCES: Record<SourceKey, { name: string; Icon: Icon }> = {
  solar: { name: "Solar", Icon: SunIcon },
  grid: { name: "Grid", Icon: PlugsConnectedIcon },
  battery: { name: "Battery", Icon: BatteryMediumIcon },
  ev: { name: "Car charger", Icon: PlugChargingIcon },
};
const SOURCE_ORDER: SourceKey[] = ["solar", "grid", "battery", "ev"];

function sourceColor(kind: SourceKey, n: EnergyNow): string {
  if (kind === "grid") return n.exportW > n.importW ? ENERGY_COLORS.export : ENERGY_COLORS.import;
  return ENERGY_COLORS[kind];
}

/** A source standing outside the building: its icon, its name, what it is doing in words (so direction reads without motion) and, for the battery, its charge. */
function SourceTag({ kind, now }: { kind: SourceKey; now: EnergyNow }) {
  const { name, Icon } = SOURCES[kind];
  const status = sourceStatus(kind, now);
  const soc = kind === "battery" && now.socPct !== undefined ? ` ${Math.round(now.socPct)}%` : "";
  return (
    <span className="ef-src" style={{ "--fc": sourceColor(kind, now) } as CSSProperties} title={`${name}: ${status}${soc}`}>
      <Icon size={14} weight="bold" aria-hidden />
      <b>{name}{soc}</b>
      <small>{status}</small>
    </span>
  );
}

/** The line's own opacity: dim while idle, brighter with power (on the log scale of the pulses). Still lines are bolder. */
const alphaOf = (w: number, still: boolean) => (still ? (isIdle(w) ? 0.2 : 0.5 + 0.35 * intensity(w)) : pulseOf(w).alpha);

/** Writes one line's pulses into the shared instanced mesh from slot `n`; returns the next free slot. */
function placePulses(mesh: InstancedMesh, path: Path, a: Anim, dir: 1 | -1, p: Pulse, color: string, dt: number, n: number, cap: number): number {
  const { pos, tan, v, q, m, scale, col } = tmp;
  const len = path.len;
  a.phase = (a.phase + p.speed * dt) % 1e4;
  const count = Math.min(cap, MAX_PULSES - n, Math.floor(len / p.spacing) + 1);
  col.set(color).multiplyScalar(GLOW);
  for (let k = 0; k < count; k++) {
    const s = (a.phase + k * p.spacing) % len;
    pointAt(path, dir === 1 ? s : len - s, pos, tan);
    v.set(tan[0] * dir, tan[1] * dir, tan[2] * dir);
    if (v.lengthSq() < 0.5) q.identity(); // a zero-length segment has no direction
    else q.setFromUnitVectors(Z, v);
    const t = p.size * Math.min(1, Math.min(s, len - s) / FADE_LEN);
    scale.set(t, t, t * DASH);
    m.compose(v.set(pos[0], pos[1], pos[2]), q, scale);
    mesh.setMatrixAt(n, m);
    mesh.setColorAt(n, col);
    n++;
  }
  return n;
}

/**
 * The moving dots (balanced tier and up, no reduced motion). Speed and spacing follow the watts on the log scale of the plan flows; direction follows
 * the power. The frame loop is kept awake only while a dot moves or a reading is still easing in.
 */
function Pulses({ segments, shapes }: { segments: FlowSegment[]; shapes: Shape[] }) {
  const mesh = useRef<InstancedMesh>(null);
  const anim = useRef(new Map<string, Anim>());
  const dash = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => dash.dispose(), [dash]);
  const now = useRef({ segments, shapes });
  now.current = { segments, shapes };
  useFrame((_, delta) => {
    const target = mesh.current;
    if (!target) return;
    const { segments: ss, shapes: sh } = now.current;
    const dt = Math.min(delta, 0.1);
    const cap = Math.min(MAX_PER_LINE, Math.max(4, Math.floor(MAX_PULSES / Math.max(1, ss.length))));
    let n = 0;
    ss.forEach((s, i) => {
      const a = anim.current.get(s.key) ?? { w: s.watts, phase: 0 };
      anim.current.set(s.key, a);
      a.w = smoothTo(a.w, s.watts, dt);
      if (a.w !== s.watts) keepAlive(false); // still easing toward the new reading
      const p = pulseOf(a.w);
      if (s.direction === 0 || p.speed === 0 || sh[i].path.len < 0.05) return;
      keepAlive(false);
      n = placePulses(target, sh[i].path, a, s.direction, p, s.color, dt, n, cap);
    });
    target.count = n;
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[dash, undefined, MAX_PULSES]} count={0} renderOrder={22} frustumCulled={false}>
      <meshBasicMaterial transparent opacity={0.95} depthTest={false} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** The lines, the sources and the labels of the energy flow (the Power layer of the Live view). */
function EnergyScene() {
  const plan = useStore((s) => s.plan);
  const sources = useEnergySources();
  const now = useEnergyNow();
  const liveRooms = useLiveRooms();
  const { visible } = useLevelVisibility();
  const reduced = useReducedMotion();
  const animate = useKnobs().ambient && !reduced;

  // where things stand: only when the plan or the shown storeys change
  const anchors = useMemo(() => {
    const base = energyLayout(plan);
    if (!base) return null;
    const level = new Map(plan.rooms.map((r) => [r.id, levelIdOf(plan, r)]));
    return { ...base, rooms: base.rooms.filter((r) => visible[level.get(r.id) ?? ""]) };
  }, [plan, visible]);
  const roomWatts = useMemo(() => {
    const ids = new Set(anchors?.rooms.map((r) => r.id));
    const w = Object.entries(liveRooms).flatMap(([id, r]) => (ids.has(id) && r.powerW !== undefined ? [[id, r.powerW] as const] : []));
    return Object.fromEntries(w.sort((a, b) => b[1] - a[1]).slice(0, MAX_ROOM_LINES));
  }, [anchors, liveRooms]);
  const segments = useMemo(() => (anchors ? flowLines(anchors, now, roomWatts) : []), [anchors, now, roomWatts]);

  // the curves and their geometry change only with the endpoints (a new reading moves nothing)
  const shapeKey = segments.map((s) => `${s.key}|${s.from}|${s.to}`).join(";");
  const shapes = useMemo<Shape[]>(
    () =>
      segments.map((s) => {
        const path = makePath(arcPoints(s.from, s.to));
        const mid = pointAt(path, path.len / 2);
        return { key: s.key, path, mid: [mid[0], mid[1] + 0.14, mid[2]] };
      }),
    // `segments` only matters through the endpoints, which are all in the key
    [shapeKey],
  );
  const geos = useMemo(
    () => shapes.map((s) => new TubeGeometry(new CatmullRomCurve3(s.path.pts.map((p) => new Vector3(p[0], p[1], p[2]))), 24, animate ? TUBE_R : STILL_TUBE_R, 4, false)),
    [shapes, animate],
  );
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);

  if (!anchors) return null;
  return (
    <>
      {segments.map((s, i) => (
        <mesh key={s.key} geometry={geos[i]} renderOrder={21} frustumCulled={false}>
          <meshBasicMaterial color={s.color} transparent opacity={alphaOf(s.watts, !animate)} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {animate && <Pulses segments={segments} shapes={shapes} />}
      {segments.map((s, i) => (
        <Marker key={s.key} id={`energy:${s.key}:w`} kind="flow" position={shapes[i].mid}>
          <span className={`flow-label${isIdle(s.watts) ? " idle" : ""}`} style={{ "--fc": s.color } as CSSProperties}>{formatPower(s.watts)}</span>
        </Marker>
      ))}
      {SOURCE_ORDER.filter((k) => sources[k] && anchors.sources[k]).map((k) => (
        <Marker key={k} id={`energy:src:${k}`} kind="flow" position={anchors.sources[k] ?? anchors.hub}>
          <SourceTag kind={k} now={now} />
        </Marker>
      ))}
      {now.houseW !== undefined && (
        <Marker id="energy:hub" kind="flow" position={[anchors.hub[0], anchors.hub[1] + 0.2, anchors.hub[2]]}>
          <span className="ef-src ef-hub" style={{ "--fc": "var(--hi)" } as CSSProperties} title="What the house uses (the car is not counted)">
            <HouseIcon size={14} weight="bold" aria-hidden />
            <b>{formatPower(now.houseW)}</b>
            <small>house</small>
          </span>
        </Marker>
      )}
    </>
  );
}

/**
 * The energy flow of the whole home in the Live view: solar, grid, battery and the car charger around the building, a hub inside, and a line to each
 * room that has a power sensor. Shown with the Power layer when at least one source is picked (Energy panel > Set up energy sources); the ring on a
 * linked car also shows while it charges. Everything it draws reads the app's states, so the history replay drives it too.
 */
export default function EnergyFlow() {
  const live = useStore((s) => s.view === "live" && !s.cinema);
  const power = useLiveLayer((s) => s.layer === "power");
  const configured = useEnergy((s) => hasLiveSources(s.sources));
  if (!live || !configured) return null;
  return (
    <>
      {power && <EnergyScene />}
      <CarEvRing power={power} />
    </>
  );
}
