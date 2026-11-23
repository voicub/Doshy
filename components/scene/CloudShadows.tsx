"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, type Group, type MeshBasicMaterial } from "three";
import { live } from "./skyLive";
import type { Season } from "@/lib/season";
import { useSky } from "@/lib/useSky";
import { useReducedMotion } from "./motion";

const COUNT = 4;
const AREA = 60; // wrap-around square side, metres
const BASE = 0.12; // shadow strength under a clear sky
const CLOUDY = 0.22; // extra strength at full cover
const WIND_BOOST = 0.25; // blob speed gained per m/s of wind
/** Season multiplier of the shadow strength: crisp summer shade, heavier autumn overcast, soft shadows over bright snow. */
const SEASON_GAIN: Record<Season, number> = { spring: 1, summer: 1.25, autumn: 1.15, winter: 0.7 };

// Deterministic blob layout: [x, z, size, speed]
const BLOBS = [
  [-18, -10, 16, 0.22],
  [6, 14, 20, 0.16],
  [20, -20, 14, 0.27],
  [-8, 22, 18, 0.19],
] as const;

export default function CloudShadows({ cx, cz }: { cx: number; cz: number }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.5, "#777");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new CanvasTexture(c);
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);

  const reduced = useReducedMotion();
  const group = useRef<Group>(null);
  const season = useRef<Season>("summer");
  season.current = useSky().season.season;
  const mats = useRef<(MeshBasicMaterial | null)[]>([]);
  const fade = useRef(0);

  const { ambient } = useKnobs();
  useFrame((_, dt) => {
    if (!ambient) return;
    const g = group.current;
    if (!g) return;
    // shadows come from the sun: none at night, denser and faster with cloud cover and wind
    fade.current = live.daylight * (BASE + CLOUDY * live.cloud) * SEASON_GAIN[season.current];
    mats.current.forEach((m) => m && (m.opacity = fade.current));
    g.visible = fade.current > 0.002;
    if (reduced) return;
    keepAlive();
    const speed = 1 + WIND_BOOST * live.wind;
    g.children.forEach((m, i) => {
      m.position.x += live.windX * BLOBS[i][3] * speed * dt;
      m.position.z += live.windZ * BLOBS[i][3] * speed * dt;
      if (m.position.x > AREA / 2) m.position.x -= AREA;
      else if (m.position.x < -AREA / 2) m.position.x += AREA;
      if (m.position.z > AREA / 2) m.position.z -= AREA;
      else if (m.position.z < -AREA / 2) m.position.z += AREA;
    });
  });

  if (!ambient) return null;
  return (
    <group ref={group} position={[cx, 0.12, cz]}>
      {BLOBS.slice(0, COUNT).map(([x, z, size], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, z]} renderOrder={2}>
          <planeGeometry args={[size, size * 0.7]} />
          <meshBasicMaterial ref={(m) => { mats.current[i] = m; }} color="#05080f" alphaMap={tex} transparent opacity={fade.current} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
