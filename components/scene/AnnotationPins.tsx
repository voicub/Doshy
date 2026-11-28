"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, Color, ConeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { annotationLabel, pinPoint } from "@/lib/annotationTools";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { useLevelVisibility } from "./levelState";
import SceneHtml from "./SceneHtml";
import "./annotationPins.css";

const HEAD = 0.12; // radius of the round head (m): big enough to find in an iso view of a whole flat, small enough to stay a marker
const TIP = 0.38; // height of the cone under it
const LIFT = TIP + HEAD * 1.3; // where the text floats: above the head

/** A pin: a cone with its tip down on the floor and a ball on top, merged into one geometry so every pin of the plan is a single draw call. Built on first use, shared by every instance. */
let pinGeo: BufferGeometry | null = null;
function pin(): BufferGeometry {
  if (!pinGeo) {
    const cone = new ConeGeometry(HEAD * 0.7, TIP, 10).rotateX(Math.PI).translate(0, TIP / 2, 0); // apex down, tip at y = 0
    const ball = new SphereGeometry(HEAD, 12, 8).translate(0, TIP + HEAD * 0.6, 0);
    pinGeo = mergeGeometries([cone.toNonIndexed(), ball.toNonIndexed()]) ?? new BufferGeometry();
    cone.dispose();
    ball.dispose();
  }
  return pinGeo;
}
const material = new MeshBasicMaterial({ toneMapped: false }); // unlit: no lights to pay for, the colour comes per instance

type Pin = { id: string; x: number; y: number; floor: number; color: string; text: string };

/**
 * The annotations marked "show as a 3D pin" (notes and zones): a small pin standing on the floor of their level, in the Live, Furniture and Home Assistant views.
 * One instanced mesh, built when the annotations change and never touched per frame; nothing at all is rendered without pins. Hovering a pin (or tapping it) shows its words.
 */
export default function AnnotationPins() {
  const plan = useStore((s) => s.plan);
  const { visible } = useLevelVisibility();
  const [shown, setShown] = useState<string | null>(null);
  const mesh = useRef<InstancedMesh>(null);

  const pins = useMemo<Pin[]>(
    () =>
      (plan.annotations ?? []).flatMap((a) => {
        const at = a.pin ? pinPoint(a) : null;
        const level = levelIdOf(plan, a);
        return at && visible[level] !== false ? [{ id: a.id, x: at.x, y: at.y, floor: elevationOf(plan, level), color: a.color ?? "#5ad7ff", text: annotationLabel(a) }] : [];
      }),
    [plan, visible],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const at = new Matrix4();
    const c = new Color();
    pins.forEach((p, i) => {
      m.setMatrixAt(i, at.makeTranslation(p.x, p.floor, p.y));
      m.setColorAt(i, c.set(p.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere(); // the pointer ray culls against it
  }, [pins]);

  if (!pins.length) return null;
  const on = (e: { instanceId?: number }) => e.instanceId !== undefined && setShown(pins[e.instanceId]?.id ?? null);
  const tip = pins.find((p) => p.id === shown);
  return (
    <>
      <instancedMesh key={pins.length} ref={mesh} args={[pin(), material, pins.length]} frustumCulled={false} onPointerMove={on} onPointerOut={() => setShown(null)} onClick={(e) => { e.stopPropagation(); on(e); }} />
      {tip && (
        <SceneHtml position={[tip.x, tip.floor + LIFT, tip.y]}>
          <div className="ann-tip" role="status">{tip.text}</div>
        </SceneHtml>
      )}
    </>
  );
}
