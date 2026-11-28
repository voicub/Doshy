"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, InstancedMesh, LineBasicMaterial, MeshBasicMaterial, Object3D, ShaderMaterial, Vector3 } from "three";
import { useAlerts } from "@/lib/alertsStore";
import { keepAlive } from "@/lib/framePacer";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { useLiveLayer } from "@/lib/liveLayer";
import { useKnobs } from "@/lib/quality";
import { useStore } from "@/lib/store";
import type { Plan } from "@/lib/types";
import { heightOf, KINDS, widthOf, type UtilityKind } from "@/lib/utilities";
import { mediumOfAlert, suggestShutoff, type ShutoffTarget } from "@/lib/utilitiesShutoff";
import { useUtilitySafety } from "../ui/utilitySafetyUi";
import { useLevelVisibility } from "./levelState";
import { useReducedMotion } from "./motion";

type Segment = { ax: number; az: number; bx: number; bz: number; y: number; width: number; kind: UtilityKind };
const NO_PICK = () => null;

function drawnSegments(plan: Plan, visible: Record<string, boolean>): Segment[] {
  return (plan.utilities ?? []).flatMap((line) => {
    const level = levelIdOf(plan, line);
    if (!visible[level]) return [];
    const y = elevationOf(plan, level) + heightOf(line);
    return line.pts.slice(1).map((b, i) => ({ ax: line.pts[i].x, az: line.pts[i].y, bx: b.x, bz: b.y, y, width: widthOf(line), kind: line.kind }));
  });
}

/** Eco/Light: one merged flat-line draw call, no tubes, shaders or animation callbacks. */
function FlatPipes({ segments, highlighted }: { segments: Segment[]; highlighted: boolean }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new Color();
    for (const s of segments) {
      positions.push(s.ax, s.y, s.az, s.bx, s.y, s.bz);
      color.set(KINDS[s.kind].color);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return geo;
  }, [segments]);
  const material = useMemo(() => new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: highlighted ? 1 : .5, depthTest: false, depthWrite: false, toneMapped: false }), [highlighted]);
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => () => { material.dispose(); }, [material]);
  return <lineSegments geometry={geometry} material={material} renderOrder={highlighted ? 16 : 15} raycast={NO_PICK} />;
}

const VERTEX = `
  varying vec3 vColor;
  varying float vTravel;
  void main() {
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vTravel = p.x + p.z;
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }
`;
const FRAGMENT = `
  uniform float time;
  varying vec3 vColor;
  varying float vTravel;
  void main() {
    float band = 0.5 + 0.5 * cos(vTravel * 5.0 - time * 2.5);
    gl_FragColor = vec4(vColor * (0.8 + band * 0.3), 0.65 + band * 0.35);
  }
`;

/** Mounted only while a highlighted path actually animates: there is no idle useFrame subscription. */
function PipePulse({ material }: { material: ShaderMaterial }) {
  useFrame(({ clock }) => {
    material.uniforms.time.value = clock.elapsedTime;
    keepAlive(false);
  });
  return null;
}

/** All segments share one cylinder and material; instance transforms are built only when their path changes. */
function Tubes({ segments, highlighted, animate, detail }: { segments: Segment[]; highlighted: boolean; animate: boolean; detail: number }) {
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 4 + detail * 2, 1), [detail]);
  const material = useMemo(() => animate ? new ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }) : new MeshBasicMaterial({ transparent: true, opacity: highlighted ? 1 : .5, depthTest: false, depthWrite: false, toneMapped: false }), [animate, highlighted]);
  const mesh = useMemo(() => {
    const batch = new InstancedMesh(geometry, material, segments.length);
    const transform = new Object3D();
    const direction = new Vector3();
    const up = new Vector3(0, 1, 0);
    const color = new Color();
    segments.forEach((s, i) => {
      direction.set(s.bx - s.ax, 0, s.bz - s.az);
      const length = direction.length();
      transform.position.set((s.ax + s.bx) / 2, s.y, (s.az + s.bz) / 2);
      transform.quaternion.setFromUnitVectors(up, direction.normalize());
      const radius = s.width / 2 + (highlighted ? .012 : 0);
      transform.scale.set(radius, length, radius);
      transform.updateMatrix();
      batch.setMatrixAt(i, transform.matrix);
      batch.setColorAt(i, color.set(KINDS[s.kind].color));
    });
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.renderOrder = highlighted ? 16 : 15;
    batch.raycast = NO_PICK;
    return batch;
  }, [segments, geometry, material, highlighted]);
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => () => { material.dispose(); }, [material]);
  useEffect(() => () => { mesh.dispose(); }, [mesh]);
  return <><primitive object={mesh} />{material instanceof ShaderMaterial && <PipePulse material={material} />}</>;
}

function Pipes() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const active = useAlerts((s) => s.active);
  const request = useUtilitySafety((s) => s.request);
  const showAll = useLiveLayer((s) => s.layer === "pipes");
  const { visible } = useLevelVisibility();
  const { detail, ambient } = useKnobs();
  const reduced = useReducedMotion();
  const segments = useMemo(() => drawnSegments(plan, visible), [plan, visible]);
  const highlighted = useMemo(() => {
    const targets: ShutoffTarget[] = active.flatMap((a) => {
      const medium = mediumOfAlert(a.kind);
      return medium ? [{ medium, alert: a.kind, itemId: a.itemId, entity: a.entity, roomId: a.roomId }] : [];
    });
    if (request) targets.push(request.target);
    const lines = new Map((plan.utilities ?? []).map((line) => [line.id, line]));
    const seen = new Set<string>();
    return targets.flatMap((target) => (suggestShutoff(plan, states, target)?.trace.pieces ?? []).flatMap((piece) => {
      const line = lines.get(piece.line);
      const key = `${piece.line}:${piece.ax},${piece.ay}:${piece.bx},${piece.by}`;
      if (!line || !visible[piece.level] || seen.has(key)) return [];
      seen.add(key);
      return [{ ax: piece.ax, az: piece.ay, bx: piece.bx, bz: piece.by, y: elevationOf(plan, piece.level) + heightOf(line), width: widthOf(line), kind: piece.kind }];
    }));
  }, [plan, states, active, request, visible]);
  const flat = detail === 0;
  return <>
    {showAll && segments.length > 0 && (flat ? <FlatPipes segments={segments} highlighted={false} /> : <Tubes segments={segments} highlighted={false} animate={false} detail={detail} />)}
    {highlighted.length > 0 && (flat ? <FlatPipes segments={highlighted} highlighted /> : <Tubes segments={highlighted} highlighted animate={ambient && !reduced} detail={detail} />)}
  </>;
}

export default function PipesLayer() {
  const live = useStore((s) => s.view === "live" && !s.cinema);
  return live ? <Pipes /> : null;
}
