"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { DoubleSide } from "three";
import { gizmoSizes, handleZoom, RING_Y, ringRadius } from "@/lib/gizmoPick";
import { useStore } from "@/lib/store";
import { CYAN, WARN, boxOf } from "./Outlines";
import { useEditUi } from "./editStore";
import { isCoarse } from "./pointerKind";

const DEG = Math.PI / 180;
const HOT = "#d6f6ff"; // a handle under the pointer
const LINE_PX = 2;
const KNOB_PX = 7;
const CONE_PX = 5;
const CONE_LEN_PX = 14;
const KNOB_PX_COARSE = 11;
const CONE_PX_COARSE = 8;
const CONE_LEN_PX_COARSE = 20;

/** The camera zoom the handles are sized by (whole px per metre); the component re-renders when it changes. */
export function useHandleZoom() {
  const [zoom, setZoom] = useState(100);
  const last = useRef(0);
  useFrame(({ camera }) => {
    const z = handleZoom(camera.zoom);
    if (z === last.current) return;
    last.current = z;
    setZoom(z);
  });
  return zoom;
}

/**
 * Rotation ring on the floor and a vertical double arrow above the selected piece. Both are drawn at a constant size on screen (the zoom decides the metres) with a faint
 * grab band, and light up when the pointer is over them. The pointer logic hit-tests them with the same sizes (lib/gizmoPick.ts) before any piece, so a neighbour never steals them.
 * A locked piece has none.
 */
export default function Gizmos() {
  const sel = useStore((s) => s.sel);
  const plan = useStore((s) => s.plan);
  const gesture = useEditUi((s) => s.gesture);
  const hot = useEditUi((s) => s.hoverGizmo);
  const zoom = useHandleZoom();
  const box = useMemo(() => (sel?.type === "item" && !plan.items.find((i) => i.id === sel.id)?.locked ? boxOf(plan, sel) : null), [plan, sel]);
  const coarse = isCoarse();
  const s = useMemo(() => gizmoSizes(zoom, coarse), [zoom, coarse]);
  // a finger covers the handle: draw it bigger and show its grab band (the hit area itself is HANDLE_PX_COARSE in lib/gizmoPick.ts)
  const [linePx, knobPx, coneR, coneLen, bandOpacity] = coarse ? [LINE_PX + 1, KNOB_PX_COARSE, CONE_PX_COARSE, CONE_LEN_PX_COARSE, 0.14] : [LINE_PX, KNOB_PX, CONE_PX, CONE_LEN_PX, 0.07];
  const mode = gesture?.mode;
  const base = gesture?.blocked ? WARN : CYAN;
  const ring = !!box && mode !== "move" && mode !== "elev";
  const arrow = !!box && mode !== "move" && mode !== "rotate";
  const radius = box ? ringRadius(box.w, box.d, s) : 0;
  const ringColor = hot === "rotate" ? HOT : base;
  const arrowColor = hot === "elev" ? HOT : base;
  const line = s.px(linePx) * (hot === "rotate" || mode === "rotate" ? 1.6 : 1);
  return (
    <>
      {box && ring && (
        <group position={[box.x, box.lv + RING_Y, box.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={30}>
            <ringGeometry args={[radius - s.band, radius + s.band, 96]} />
            <meshBasicMaterial color={ringColor} transparent opacity={hot === "rotate" ? 0.2 : bandOpacity} depthTest={false} depthWrite={false} toneMapped={false} side={DoubleSide} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={31}>
            <ringGeometry args={[radius - line, radius + line, 96]} />
            <meshBasicMaterial color={ringColor} transparent opacity={0.9} depthTest={false} toneMapped={false} side={DoubleSide} />
          </mesh>
          {/* handle on the item's local +x axis: where the front edge turns */}
          <mesh position={[Math.cos(box.rot * DEG) * radius, 0, Math.sin(box.rot * DEG) * radius]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={32}>
            <circleGeometry args={[s.px(knobPx) * (hot === "rotate" ? 1.3 : 1), 24]} />
            <meshBasicMaterial color={ringColor} depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      )}
      {box && arrow && (
        <group position={[box.x, box.y1 + s.arrowGap, box.z]}>
          <mesh position={[0, s.arrowLen / 2, 0]} renderOrder={31}>
            <cylinderGeometry args={[s.arrowR, s.arrowR, s.arrowLen, 12]} />
            <meshBasicMaterial color={arrowColor} transparent opacity={hot === "elev" ? 0.2 : bandOpacity} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, s.arrowLen / 2, 0]} renderOrder={32}>
            <cylinderGeometry args={[line / 1.5, line / 1.5, s.arrowLen - s.px(coneLen), 6]} />
            <meshBasicMaterial color={arrowColor} depthTest={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, s.arrowLen - s.px(coneLen) / 2, 0]} renderOrder={32}>
            <coneGeometry args={[s.px(coneR), s.px(coneLen), 10]} />
            <meshBasicMaterial color={arrowColor} depthTest={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, s.px(coneLen) / 2, 0]} rotation={[Math.PI, 0, 0]} renderOrder={32}>
            <coneGeometry args={[s.px(coneR), s.px(coneLen), 10]} />
            <meshBasicMaterial color={arrowColor} depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      )}
    </>
  );
}
