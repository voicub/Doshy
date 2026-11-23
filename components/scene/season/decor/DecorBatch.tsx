"use client";
import { keepAlive } from "@/lib/framePacer";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { AdditiveBlending, BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, PlaneGeometry, Quaternion, Vector3, type InstancedMesh } from "three";
import { glowTexture } from "@/lib/textures";
import { live } from "../../skyLive";
import type { Batch, Piece } from "./batch";

const noRaycast = () => null;
const TWINKLE = 2.2; // rad/s
const E = new Euler(), Q = new Quaternion(), P = new Vector3(), S = new Vector3(), M = new Matrix4();

/** Writes the pieces' transforms into the mesh, each shrunk about its own centre by `k` (the fade in / out at a holiday's edges). */
function place(mesh: InstancedMesh, pieces: Piece[], k: number) {
  pieces.forEach((p, i) => {
    Q.setFromEuler(E.set(p.r?.[0] ?? 0, p.r?.[1] ?? 0, p.r?.[2] ?? 0));
    mesh.setMatrixAt(i, M.compose(P.set(p.p[0], p.p[1], p.p[2]), Q, S.set(p.s[0] * k, p.s[1] * k, p.s[2] * k)));
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/** Lit parts (tree tiers, presents, pumpkins, eggs): one instanced mesh per geometry, coloured per instance. */
function Lit({ pieces, fade, children }: { pieces: Piece[]; fade: number; children: ReactNode }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new Color();
    pieces.forEach((p, i) => mesh.setColorAt(i, c.set(p.c)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [pieces]);
  useLayoutEffect(() => {
    if (ref.current) place(ref.current, pieces, fade);
  }, [pieces, fade]);
  if (!pieces.length) return null;
  return (
    <instancedMesh key={pieces.length} ref={ref} args={[undefined, undefined, pieces.length]} frustumCulled={false} castShadow raycast={noRaycast}>
      {children}
    </instancedMesh>
  );
}

/**
 * Emissive parts: HDR instance colours (never tone mapped) so the bloom pass lights them. They twinkle, are dimmer in daylight and fade
 * with the holiday's strength. `dayMin` is the share of the brightness left at noon. Reduced motion freezes the twinkle.
 */
function Glow({ pieces, fade, reduced, dayMin, children }: { pieces: Piece[]; fade: number; reduced: boolean; dayMin: number; children: ReactNode }) {
  const ref = useRef<InstancedMesh>(null);
  const base = useMemo(() => pieces.map((p) => new Color(p.c)), [pieces]);
  const last = useRef({ night: -1, fade: -1, t: -1 });
  const tmp = useMemo(() => new Color(), []);
  useLayoutEffect(() => {
    if (ref.current) place(ref.current, pieces, fade);
    last.current.t = -1;
  }, [pieces, fade]);
  const twinkles = useMemo(() => pieces.some((p) => p.tw), [pieces]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const night = dayMin + (1 - dayMin) * (1 - live.daylight);
    const t = reduced ? 0 : clock.elapsedTime * TWINKLE;
    if (!reduced && twinkles && fade > 0) keepAlive(false);
    const l = last.current;
    if (reduced && Math.abs(l.night - night) < 0.01 && l.fade === fade && l.t === 0) return;
    l.night = night;
    l.fade = fade;
    l.t = reduced ? 0 : t;
    pieces.forEach((p, i) => {
      const tw = p.tw ?? 0;
      const dip = tw ? 1 - tw * (reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t + (p.ph ?? 0))) : 1;
      mesh.setColorAt(i, tmp.copy(base[i]).multiplyScalar((p.e ?? 1) * dip * night * fade));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  if (!pieces.length) return null;
  return (
    <instancedMesh key={pieces.length} ref={ref} args={[undefined, undefined, pieces.length]} frustumCulled={false} raycast={noRaycast} renderOrder={4}>
      {children}
    </instancedMesh>
  );
}

function Wire({ points, color, fade }: { points: Batch["wire"]; color: string; fade: number }) {
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(points.flat(), 3));
    return g;
  }, [points]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!points.length) return null;
  return (
    <lineSegments geometry={geo} raycast={noRaycast} frustumCulled={false}>
      <lineBasicMaterial color={color} transparent opacity={fade} />
    </lineSegments>
  );
}

/** Renders one holiday's parts: a handful of instanced meshes plus the wire. */
export default function DecorBatch({ batch, fade, reduced }: { batch: Batch; fade: number; reduced: boolean }) {
  const flat = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const tex = useMemo(() => glowTexture(), []);
  useEffect(() => () => flat.dispose(), [flat]);
  return (
    <group>
      <Lit pieces={batch.boxes} fade={fade}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.75} />
      </Lit>
      <Lit pieces={batch.cones} fade={fade}>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </Lit>
      <Lit pieces={batch.spheres} fade={fade}>
        <sphereGeometry args={[1, 12, 9]} />
        <meshStandardMaterial roughness={0.6} />
      </Lit>
      <Lit pieces={batch.tori} fade={fade}>
        <torusGeometry args={[1, 0.22, 8, 24]} />
        <meshStandardMaterial roughness={0.9} />
      </Lit>
      <Glow pieces={batch.bulbs} fade={fade} reduced={reduced} dayMin={0.45}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial toneMapped={false} />
      </Glow>
      <Glow pieces={batch.glowBoxes} fade={fade} reduced={reduced} dayMin={0.5}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </Glow>
      <Glow pieces={batch.pools} fade={fade} reduced={reduced} dayMin={0.25}>
        <primitive object={flat} attach="geometry" />
        <meshBasicMaterial map={tex} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </Glow>
      <Wire points={batch.wire} color={batch.wireColor} fade={fade} />
    </group>
  );
}
