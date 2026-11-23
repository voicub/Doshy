"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Vector3, type Object3D } from "three";

const HTML_Z = 5; // below the app HUD
const tmp = new Vector3();

/**
 * A DOM label pinned to a 3D position. Replaces drei's <Html>, whose cleanup unmounts its React root synchronously
 * and makes React 19 log "Attempted to synchronously unmount a root while React was already rendering".
 * The label lives in its own root inside the canvas wrapper; unmounting is deferred out of the render phase.
 */
export default function SceneHtml({ position, children }: { position: [number, number, number]; children: ReactNode }) {
  const anchor = useRef<Object3D>(null);
  const rootRef = useRef<Root | null>(null);
  const gl = useThree((s) => s.gl);
  const host = useMemo(() => {
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;will-change:transform;z-index:${HTML_Z};visibility:hidden`;
    return el;
  }, []);

  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    parent.appendChild(host);
    const root = createRoot(host);
    rootRef.current = root;
    root.render(children);
    return () => {
      rootRef.current = null;
      host.remove();
      setTimeout(() => root.unmount(), 0);
    };
    // children are re-rendered by the effect below; the root itself only depends on the canvas
  }, [gl, host]);

  useEffect(() => {
    rootRef.current?.render(children);
  });

  useFrame(({ camera, size }) => {
    const a = anchor.current;
    if (!a) return;
    a.getWorldPosition(tmp).project(camera);
    let shown = tmp.z <= 1;
    for (let o: Object3D | null = a; shown && o; o = o.parent) shown = o.visible; // a hidden storey takes its labels with it
    host.style.visibility = shown ? "visible" : "hidden";
    host.style.transform = `translate3d(${(tmp.x * 0.5 + 0.5) * size.width}px,${(-tmp.y * 0.5 + 0.5) * size.height}px,0) translate(-50%,-50%)`;
  });

  return <object3D ref={anchor} position={position} />;
}
