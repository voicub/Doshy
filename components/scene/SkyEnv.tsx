"use client";
import { Environment, Lightformer } from "@react-three/drei";
import { useMemo } from "react";
import { BackSide, BufferAttribute, Color, SphereGeometry } from "three";

// A painted sky for image-based lighting: bright zenith, pale warm horizon, mossy ground bounce, one big soft "sun" box and a cool opposite fill.
// Rendered once into a cube map (no network, no HDR file); its strength follows the sky through `scene.environmentIntensity` (SkyDriver).
const GAIN = 0.7; // overall strength against the original Studio environment (tuned by eye: higher washes out the sun shadows)
// Values are linear and above 1 on purpose: the cube map is half-float, so the bright parts really light.
const SKY = { zenith: new Color(0.22, 0.32, 0.55), mid: new Color(0.45, 0.52, 0.66), horizon: new Color(1.1, 1.0, 0.86), ground: new Color(0.2, 0.2, 0.12), floor: new Color(0.06, 0.06, 0.05) };
const STUDIO_SKY = { zenith: new Color(0.1, 0.16, 0.3), mid: new Color(0.2, 0.26, 0.4), horizon: new Color(0.5, 0.5, 0.5), ground: new Color(0.08, 0.08, 0.08), floor: new Color(0.03, 0.03, 0.035) };

/** Sphere whose vertex colours run zenith -> horizon -> ground by height. */
function skyGeometry(p: typeof SKY): SphereGeometry {
  const g = new SphereGeometry(1, 32, 24);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); // -1 (down) .. 1 (up)
    if (y >= 0) c.copy(p.horizon).lerp(p.mid, Math.min(1, y * 2.2)).lerp(p.zenith, Math.max(0, y * 1.6 - 0.4));
    else c.copy(p.horizon).lerp(p.ground, Math.min(1, -y * 6)).lerp(p.floor, Math.max(0, -y * 1.5 - 0.2));
    c.multiplyScalar(GAIN).toArray(col, i * 3);
  }
  g.setAttribute("color", new BufferAttribute(col, 3));
  return g;
}

/** Procedural sky environment. `garden`: open daylight; otherwise a cooler, dimmer dome for the studio. Remount (key) to repaint. */
export default function SkyEnv({ garden }: { garden: boolean }) {
  const palette = garden ? SKY : STUDIO_SKY;
  const geometry = useMemo(() => skyGeometry(palette), [palette]);
  return (
    <Environment resolution={256} frames={1} key={garden ? "garden" : "studio"}>
      <mesh scale={80} geometry={geometry}>
        <meshBasicMaterial vertexColors side={BackSide} toneMapped={false} />
      </mesh>
      <Lightformer form="rect" intensity={(garden ? 5 : 3) * GAIN} color="#fff0dc" position={[-10, 14, 6]} scale={[16, 10, 1]} />
      <Lightformer form="rect" intensity={1.2 * GAIN} color="#9cc0ff" position={[10, 5, -8]} scale={[14, 5, 1]} />
      <Lightformer form="rect" intensity={0.5 * GAIN} color="#ffd9a8" position={[0, 0.4, 12]} scale={[24, 1.4, 1]} />
    </Environment>
  );
}
