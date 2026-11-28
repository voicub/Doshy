"use client";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { ClampToEdgeWrapping, DataTexture, LinearFilter, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2, Vector3 } from "three";
import { effectivePalette, type HeatMetric } from "@/lib/heatmap";
import { analyseHeat, type Field } from "@/lib/heatmapField";
import { paletteStops } from "@/lib/heatmapPalette";
import { useHeatMap, useShownHeat } from "@/lib/heatmapStore";
import { isLite, useQuality } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { useLiveRooms } from "@/lib/useLive";

const FLOOR_Y = 0.09; // just above the room tints of LiveLayers (0.088), above the floor plate (0.06) and light pools (0.075)
const OPACITY = 0.6;
const HATCH_PER_METRE = 5; // "no sensor" stripes repeat every 20 cm

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// R = value across the colour range, G = "no sensor here" (dimmed and hatched), A = inside a room (soft edge). Palette stops are sRGB, written as they are.
const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uPal[9];
uniform float uOpacity;
uniform vec2 uSizeM;
varying vec2 vUv;
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 d = texture2D(uTex, uv);
  float inside = smoothstep(0.3, 0.7, d.a);
  if (inside < 0.01) discard;
  vec3 c = uPal[0];
  for (int i = 0; i < 8; i++) c = mix(c, uPal[i + 1], clamp(d.r * 8.0 - float(i), 0.0, 1.0));
  float stripe = step(0.5, fract((uv.x * uSizeM.x + uv.y * uSizeM.y) * ${HATCH_PER_METRE.toFixed(1)}));
  c = mix(c, c * mix(0.62, 0.3, stripe), d.g);
  gl_FragColor = vec4(c, uOpacity * inside * mix(1.0, 0.75, d.g));
}
`;

function toTexture(f: Field): DataTexture {
  const t = new DataTexture(f.data, f.w, f.h, RGBAFormat, UnsignedByteType);
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** One quad over one level's rooms. Computed when the readings change, drawn like any static mesh: no frame callback, nothing keeps the render loop awake. */
function HeatQuad({ levelId, metric }: { levelId: string; metric: HeatMetric }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const live = useLiveRooms();
  const lite = useQuality((s) => isLite(s.tier));
  const palette = effectivePalette(metric, useHeatMap((s) => s.palette));
  const invalidate = useThree((s) => s.invalidate);

  // Eco: one flat value per room (no per-cell work). Light and up: the smooth picture.
  const field = useMemo(() => analyseHeat(plan, states, metric, lite, live).fields[levelId] ?? null, [plan, states, metric, lite, live, levelId]);
  const tex = useMemo(() => (field ? toTexture(field) : null), [field]);
  useEffect(() => () => tex?.dispose(), [tex]);

  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTex: { value: null }, uPal: { value: paletteStops("viridis").map(() => new Vector3()) }, uOpacity: { value: OPACITY }, uSizeM: { value: new Vector2(1, 1) } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);

  // layout effect: the uniforms must be right before the first frame that draws the new mesh
  useLayoutEffect(() => {
    mat.uniforms.uTex.value = tex;
    mat.uniforms.uSizeM.value.set(field ? field.w * field.cell : 1, field ? field.h * field.cell : 1);
    paletteStops(palette).forEach(([r, g, b], i) => (mat.uniforms.uPal.value as Vector3[])[i].set(r / 255, g / 255, b / 255));
    invalidate(); // the scene may be idling between frames
  }, [mat, tex, field, palette, invalidate]);

  if (!field || !tex) return null;
  const wm = field.w * field.cell;
  const hm = field.h * field.cell;
  return (
    <mesh position={[field.x0 + wm / 2, FLOOR_Y, field.y0 + hm / 2]} rotation={[-Math.PI / 2, 0, 0]} scale={[wm, hm, 1]} renderOrder={2} raycast={() => null} material={mat}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

/** The heat map of one level (temperature, humidity, CO2, light or noise as a smooth picture on the floor). Live view only, never in cinema; nothing at all while it is off. */
export default function HeatMap({ levelId }: { levelId: string }) {
  const view = useStore((s) => s.view);
  const cinema = useStore((s) => s.cinema);
  const metric = useShownHeat();
  if (view !== "live" || cinema || metric === "off") return null;
  return <HeatQuad levelId={levelId} metric={metric} />;
}
