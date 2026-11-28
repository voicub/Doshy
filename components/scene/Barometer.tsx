"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, MathUtils, SRGBColorSpace, type Group } from "three";
import { keepAlive } from "@/lib/framePacer";
import { DIAL, dialAngle, entityHpa, type PressureEntity } from "@/lib/pressure";
import { useKnobs, useQuality } from "@/lib/quality";
import { useReducedMotion } from "./motion";

const INK = "#302d26";
const PAPER = "#f4ecd9";
const RATE = 9;
const SETTLED = 0.001;

/** Painted once per texture tier: no remote font or per-frame text work. */
function dialTexture(size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const point = (hpa: number, radius: number): [number, number] => [c - Math.sin(dialAngle(hpa)) * c * radius, c - Math.cos(dialAngle(hpa)) * c * radius];
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = ctx.fillStyle = INK;
  ctx.lineWidth = size / 256;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let hpa = DIAL.min; hpa <= DIAL.max; hpa += 2) {
    const major = hpa % 10 === 0;
    ctx.beginPath();
    ctx.moveTo(...point(hpa, major ? 0.79 : 0.85));
    ctx.lineTo(...point(hpa, 0.92));
    ctx.stroke();
    if (major) {
      ctx.font = `${size * 0.045}px system-ui, sans-serif`;
      ctx.fillText(String(hpa), ...point(hpa, 0.69));
    }
  }
  ctx.font = `600 ${size * 0.052}px Georgia, serif`;
  for (const { hpa, word } of DIAL.marks) ctx.fillText(word[0] + word.slice(1).toLowerCase(), ...point(hpa, 0.49));
  ctx.font = `${size * 0.05}px system-ui, sans-serif`;
  ctx.fillText("hPa", c, size * 0.78);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Reads the same state map as useItemLive, including the replay's historical map. Missing readings never pretend to be fair weather. */
export default function Barometer({ state, edit }: { state?: PressureEntity; edit: boolean }) {
  const hpa = entityHpa(state);
  const target = hpa === undefined ? 0 : dialAngle(hpa);
  const reduced = useReducedMotion();
  const eco = useQuality((s) => s.tier === "eco");
  const knobs = useKnobs();
  const invalidate = useThree((s) => s.invalidate);
  const needle = useRef<Group>(null);
  const angle = useRef(target);
  const previousValid = useRef(hpa !== undefined);
  const snap = eco || reduced || edit;
  const texture = useMemo(() => dialTexture(knobs.textureSize), [knobs.textureSize]);
  useEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => {
    if (snap || !previousValid.current || hpa === undefined) angle.current = target;
    previousValid.current = hpa !== undefined;
    if (needle.current) needle.current.rotation.z = angle.current;
    invalidate();
  }, [target, hpa, snap, invalidate]);
  useFrame((_, dt) => {
    if (snap || hpa === undefined || angle.current === target) return;
    angle.current = Math.abs(angle.current - target) < SETTLED ? target : MathUtils.damp(angle.current, target, RATE, Math.min(dt, 0.1));
    if (needle.current) needle.current.rotation.z = angle.current;
    if (angle.current !== target) keepAlive(false);
  });
  return (
    <group position={[0, 1.5, 0.0181]}>
      <mesh>
        <circleGeometry args={[0.089, 24 + knobs.detail * 12]} />
        <meshStandardMaterial map={texture} roughness={0.8} />
      </mesh>
      <group ref={needle} position={[0, 0, 0.001]} visible={hpa !== undefined}>
        <mesh position={[0, 0.026, 0]}>
          <boxGeometry args={[0.0025, 0.076, 0.001]} />
          <meshStandardMaterial color={INK} roughness={0.4} metalness={0.35} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.0017]}>
        <circleGeometry args={[0.006, 16]} />
        <meshStandardMaterial color="#b89550" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}
