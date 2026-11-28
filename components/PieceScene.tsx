"use client";
import { OrbitControls } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { useThemeColors } from "@/lib/useThemeColors";
import { BoxGeometry, EdgesGeometry, Plane, Vector2, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Part } from "@/lib/catalog";
import { partHalf } from "@/lib/customCatalog";

const CYAN = "#5ad7ff";
const SNAP = 0.01; // metres: dragged shapes snap to whole centimetres
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

type Drag = (e: ThreeEvent<PointerEvent>, i: number, mode: "floor" | "lift") => void;

function Outline({ p }: { p: Part }) {
  const geo = useMemo(() => new EdgesGeometry(new BoxGeometry(p.s[0], p.s[1], p.s[2])), [p.s]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} position={p.p} rotation={p.r ?? [0, 0, 0]}>
      <lineBasicMaterial color={CYAN} depthTest={false} />
    </lineSegments>
  );
}

function Shape({ p, i, drag, pick }: { p: Part; i: number; drag: Drag; pick: (i: number) => void }) {
  return (
    <mesh
      position={p.p}
      rotation={p.r ?? [0, 0, 0]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        pick(i);
        drag(e, i, "floor");
      }}
    >
      {p.shape === "cyl" ? <cylinderGeometry args={[p.s[0] / 2, p.s[0] / 2, p.s[1], 24]} /> : p.shape === "sph" ? <sphereGeometry args={[p.s[0] / 2, 24, 18]} /> : <boxGeometry args={p.s} />}
      <meshStandardMaterial color={p.c} roughness={0.8} />
    </mesh>
  );
}

/** Adding or removing a shape re-frames the view so everything stays in sight. */
function useReframe(orbit: OrbitControlsImpl | null, parts: Part[]) {
  const { camera, invalidate } = useThree();
  const count = parts.length;
  useEffect(() => {
    if (!orbit) return;
    const lo = [Infinity, 0, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) {
      const half = partHalf(p);
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], p.p[i] - half[i]);
        hi[i] = Math.max(hi[i], p.p[i] + half[i]);
      }
    }
    const mid = new Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    const far = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 2.2 + 0.8;
    const dir = camera.position.clone().sub(orbit.target).normalize();
    orbit.target.copy(mid);
    camera.position.copy(mid).addScaledVector(dir, far);
    orbit.update();
    invalidate();
    // re-frames only when a shape is added or removed (`count`), not on every edit of `parts`
  }, [count, orbit]);
}

/** Dragging a shape: along the floor, or up and down ("lift"). The orbit controls pause while it moves. */
function usePartDrag(orbit: OrbitControlsImpl | null, parts: Part[], onBegin: () => void, onMove: (i: number, p: Partial<Part>) => void): Drag {
  const { camera, gl, raycaster } = useThree();
  return (e, i, mode) => {
    const p = parts[i];
    const pos = new Vector3(...p.p);
    const plane = new Plane();
    if (mode === "floor") plane.setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), pos);
    else {
      const n = camera.getWorldDirection(new Vector3());
      n.y = 0;
      plane.setFromNormalAndCoplanarPoint(n.lengthSq() < 1e-6 ? new Vector3(0, 0, 1) : n.normalize().negate(), pos);
    }
    const at = (ev: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      return raycaster.ray.intersectPlane(plane, new Vector3());
    };
    const first = at(e.nativeEvent);
    if (!first) return;
    const off = pos.clone().sub(first);
    onBegin();
    if (orbit) orbit.enabled = false;
    const move = (ev: PointerEvent) => {
      const h = at(ev);
      if (!h) return;
      h.add(off);
      if (mode === "floor") onMove(i, { p: [snap(h.x), p.p[1], snap(h.z)] });
      else onMove(i, { p: [p.p[0], Math.max(p.s[1] / 2, snap(h.y)), p.p[2]] });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (orbit) orbit.enabled = true;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
}

type SceneProps = { parts: Part[]; sel: number; pick: (i: number) => void; onBegin: () => void; onMove: (i: number, p: Partial<Part>) => void };

/** Everything inside the preview canvas: the shapes, the selection, and drag-to-move on the floor / drag-the-dot to lift. */
export default function PieceScene({ parts, sel, pick, onBegin, onMove }: SceneProps) {
  const controls = useThree((s) => s.controls);
  const orbit = controls as OrbitControlsImpl | null; // R3F types `controls` loosely; this is drei's OrbitControls (makeDefault)
  useReframe(orbit, parts);
  const drag = usePartDrag(orbit, parts, onBegin, onMove);
  const s = parts[sel];
  const { bg } = useThemeColors();
  return (
    <>
      <color attach="background" args={[bg]} />
      <hemisphereLight args={["#ffffff", "#445566", 1.4]} />
      <directionalLight position={[2, 4, 3]} intensity={2} />
      <gridHelper args={[4, 40, "#2a5566", "#14262f"]} />
      {parts.map((p, i) => (
        <Shape key={i} p={p} i={i} drag={drag} pick={pick} />
      ))}
      {s && (
        <>
          <Outline p={s} />
          <mesh
            position={[s.p[0], s.p[1] + partHalf(s)[1] + 0.12, s.p[2]]}
            renderOrder={10}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              drag(e, sel, "lift");
            }}
          >
            <sphereGeometry args={[0.045, 16, 12]} />
            <meshBasicMaterial color={CYAN} depthTest={false} />
          </mesh>
        </>
      )}
      <OrbitControls makeDefault enablePan={false} minDistance={0.4} maxDistance={12} maxPolarAngle={Math.PI / 2 - 0.02} />
    </>
  );
}
