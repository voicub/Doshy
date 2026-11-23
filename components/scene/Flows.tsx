"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { BoxGeometry, Color, Curve, InstancedMesh, Matrix4, Quaternion, TubeGeometry, Vector3, type MeshBasicMaterial } from "three";
import {
  effectiveRoles, flowColor, flowsOf, flowWatts, formatPower, isIdle, itemById, itemLabel, makePath, pointAt, pulseOf, roleOf, routeFlow, smoothTo, socOf, toneOf, type Path, type Pulse,
} from "@/lib/flows";
import type { V3 } from "@/lib/mathUtil";
import { useStore } from "@/lib/store";
import { levelIdOf } from "@/lib/levels";
import type { Flow, Item, Plan } from "@/lib/types";
import { boxOf } from "./edit/Outlines";
import { useFlowUi } from "./edit/flowUi";
import { useLevelVisibility } from "./levelState";
import { useReducedMotion } from "./motion";
import SceneHtml from "./SceneHtml";
import { Marker } from "./DeclutterLayer";
import "./flows.css";

/** Pulses of every flow share one instanced mesh. */
const MAX_PULSES = 1600;
const MAX_PER_FLOW = 60;
const TUBE_R = 0.014;
/** Pulses are small dashes this many times longer than wide. */
const DASH = 3;
/** Pulses grow in and shrink out over this many metres at both ends of a line. */
const FADE_LEN = 0.35;
/** Static dashes (reduced motion) are at least this far apart (m). */
const STATIC_GAP = 0.5;
const GLOW = 1.5;
const UNAVAILABLE_ALPHA = 0.1;
const SOC_STEPS = 5;
const SOC_LOW = 20;

class PathCurve extends Curve<Vector3> {
  constructor(private path: Path) {
    super();
  }
  override getPoint(t: number, target = new Vector3()) {
    const p = pointAt(this.path, t * this.path.len);
    return target.set(p[0], p[1], p[2]);
  }
}

type Line = { flow: Flow; from: Item; to: Item; path: Path; mid: V3 };
type Anim = { w: number; phase: number };

const Z = new Vector3(0, 0, 1);
const tmp = { pos: [0, 0, 0] as V3, tan: [0, 0, 0] as V3, v: new Vector3(), q: new Quaternion(), m: new Matrix4(), scale: new Vector3(), col: new Color() };

function FlowLabel({ line, watts, color, selected, interactive }: { line: Line; watts?: number; color: string; selected: boolean; interactive: boolean }) {
  const text = !line.flow.entity ? "Pick a sensor" : watts === undefined ? "n/a" : formatPower(watts);
  const cls = `flow-label${isIdle(watts) ? " idle" : ""}${selected ? " sel" : ""}`;
  const style = { "--fc": color } as CSSProperties;
  if (!interactive) return <span className={cls} style={style}>{text}</span>;
  return (
    <button type="button" className={cls} style={style} aria-pressed={selected} aria-label={`${itemLabel(line.from)} to ${itemLabel(line.to)}, ${text}. Edit this line`} onClick={() => useFlowUi.getState().selectFlow(selected ? null : line.flow.id)}>
      {text}
    </button>
  );
}

/** Lit bars over a battery that has a charge sensor (Item.params.soc). */
function SocBadges() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  return (
    <>
      {plan.items.map((it) => {
        if (typeof it.params?.soc !== "string" || roleOf(it.kind) !== "battery") return null;
        const soc = socOf(it, states);
        const b = boxOf(plan, { type: "item", id: it.id });
        if (!b) return null;
        const lit = soc === undefined ? 0 : Math.max(soc > 0 ? 1 : 0, Math.round((soc / 100) * SOC_STEPS));
        return (
          <Marker key={it.id} id={`${it.id}:soc`} kind="flow" position={[b.x, b.y1 + 0.28, b.z]}>
            <span className={`soc${soc !== undefined && soc < SOC_LOW ? " low" : ""}`} role="img" aria-label={soc === undefined ? "Battery charge unavailable" : `Battery ${Math.round(soc)} percent`}>
              {Array.from({ length: SOC_STEPS }, (_, i) => <i key={i} className={i < lit ? "on" : undefined} />)}
              <b>{soc === undefined ? "n/a" : `${Math.round(soc)}%`}</b>
            </span>
          </Marker>
        );
      })}
    </>
  );
}

/** FROM / TO tags on the items picked so far with the Connect tool. */
function Picks() {
  const plan = useStore((s) => s.plan);
  const { from, to } = useFlowUi();
  return (
    <>
      {([[from, "From"], [to, "To"]] as const).map(([id, tag]) => {
        const b = id ? boxOf(plan, { type: "item", id }) : null;
        return b ? (
          <SceneHtml key={tag} position={[b.x, b.y1 + 0.3, b.z]}>
            <span className="flow-pick">{tag}</span>
          </SceneHtml>
        ) : null;
      })}
    </>
  );
}

/** The lines to draw: every flow whose two ends are on shown storeys and far enough apart, routed. */
function buildLines(plan: Plan, visible: Record<string, boolean>): Line[] {
  return flowsOf(plan).flatMap((flow) => {
    const from = itemById(plan, flow.from);
    const to = itemById(plan, flow.to);
    if (!from || !to) return [];
    if (!visible[levelIdOf(plan, from)] || !visible[levelIdOf(plan, to)]) return [];
    const path = makePath(routeFlow(plan, from, to));
    if (path.len < 0.05) return [];
    const mid = pointAt(path, path.len / 2);
    return [{ flow, from, to, path, mid: [mid[0], mid[1] + 0.14, mid[2]] as V3 }];
  });
}

/** Writes one line's pulses into the shared instanced mesh from slot `n`; returns the next free slot. */
function placePulses(mesh: InstancedMesh, l: Line, a: Anim, p: Pulse, still: boolean, color: string, dt: number, n: number): number {
  const { pos, tan, v, q, m, scale, col } = tmp;
  const len = l.path.len;
  const gap = still ? Math.max(STATIC_GAP, p.spacing) : p.spacing;
  if (!still) a.phase = (a.phase + p.speed * dt) % 1e4;
  const forward = a.w >= 0;
  const count = Math.min(MAX_PER_FLOW, MAX_PULSES - n, Math.floor(len / gap) + 1);
  col.set(color).multiplyScalar(GLOW);
  for (let k = 0; k < count; k++) {
    const s = still ? gap * (k + 0.5) : (a.phase + k * gap) % len;
    if (s > len) continue;
    const along = forward ? s : len - s;
    pointAt(l.path, along, pos, tan);
    const dir = forward ? 1 : -1;
    v.set(tan[0] * dir, tan[1] * dir, tan[2] * dir);
    if (v.lengthSq() < 0.5) q.identity(); // a zero-length segment has no direction
    else q.setFromUnitVectors(Z, v);
    const grow = still ? 0.5 + along / len : 1; // static dashes grow toward the destination
    const fade = still ? 1 : Math.min(1, Math.min(s, len - s) / FADE_LEN);
    const t = p.size * fade;
    scale.set(t, t, t * DASH * grow);
    m.compose(v.set(pos[0], pos[1], pos[2]), q, scale);
    mesh.setMatrixAt(n, m);
    mesh.setColorAt(n, col);
    n++;
  }
  return n;
}

/**
 * Live energy flows: a dim line between the two items of each Flow with pulses running along it (speed and density follow the power on a
 * log scale, direction follows the sensor's sign) and a floating value label. Idle or unavailable sensors leave a still, dim line.
 * With reduced motion the pulses are static dashes that grow toward the destination. `interactive`: labels are buttons that select the line.
 */
export default function Flows({ interactive }: { interactive: boolean }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const selected = useFlowUi((s) => s.flow);
  const { visible } = useLevelVisibility();
  const reduced = useReducedMotion();

  const lines = useMemo(() => buildLines(plan, visible), [plan, visible]);
  const watts = useMemo(() => lines.map((l) => flowWatts(l.flow, states)), [lines, states]);
  const colors = useMemo(
    () =>
      lines.map((l, i) => {
        const { src, dst } = effectiveRoles(roleOf(l.from.kind), roleOf(l.to.kind), watts[i]);
        return flowColor(l.flow.kind, toneOf(src, dst));
      }),
    [lines, watts],
  );
  const geos = useMemo(() => lines.map((l) => new TubeGeometry(new PathCurve(l.path), Math.max(8, Math.ceil(l.path.len * 8)), TUBE_R, 4, false)), [lines]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  const dash = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => dash.dispose(), [dash]);

  const mats = useRef<(MeshBasicMaterial | null)[]>([]);
  const pulses = useRef<InstancedMesh>(null);
  const anim = useRef(new Map<string, Anim>());
  const now = useRef({ lines, watts, colors, reduced, selected });
  now.current = { lines, watts, colors, reduced, selected };

  useFrame((_, delta) => {
    const mesh = pulses.current;
    if (!mesh) return;
    const { lines: ls, watts: ws, colors: cs, reduced: still, selected: sel } = now.current;
    const dt = Math.min(delta, 0.1);
    let n = 0;
    ls.forEach((l, i) => {
      const a = anim.current.get(l.flow.id) ?? { w: ws[i] ?? 0, phase: 0 };
      anim.current.set(l.flow.id, a);
      a.w = smoothTo(a.w, ws[i] ?? 0, dt);
      const known = ws[i] !== undefined;
      const p = pulseOf(known ? a.w : undefined);
      const mat = mats.current[i];
      if (mat) {
        mat.color.set(cs[i]);
        mat.opacity = !known ? UNAVAILABLE_ALPHA : l.flow.id === sel ? Math.max(p.alpha, 0.6) : p.alpha;
      }
      if (!still && p.speed !== 0) keepAlive(false);
      else if (known && Math.abs(a.w - (ws[i] ?? 0)) > 0.01) keepAlive(false);
      if (p.speed === 0 || n >= MAX_PULSES) return;
      n = placePulses(mesh, l, a, p, still, cs[i], dt, n);
    });
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      {lines.map((l, i) => (
        <mesh key={l.flow.id} geometry={geos[i]} renderOrder={21} frustumCulled={false}>
          <meshBasicMaterial ref={(mat) => void (mats.current[i] = mat)} color={colors[i]} transparent opacity={0.3} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={pulses} args={[dash, undefined, MAX_PULSES]} count={0} renderOrder={22} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.95} depthTest={false} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {lines.map((l, i) => (
        <Marker key={l.flow.id} id={`${l.flow.id}:flow`} kind="flow" position={l.mid}>
          <FlowLabel line={l} watts={watts[i]} color={colors[i]} selected={l.flow.id === selected} interactive={interactive} />
        </Marker>
      ))}
      <SocBadges />
      {interactive && <Picks />}
    </>
  );
}
