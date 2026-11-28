"use client";
import { useEffect, useMemo } from "react";
import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, RGBAFormat, RepeatWrapping, UnsignedByteType, Vector2, Vector3, type WebGLProgramParametersWithUniforms } from "three";
import { useThree } from "@react-three/fiber";
import { useKnobs } from "@/lib/quality";
import { fbm } from "@/lib/pbrNoise";
import { useStore } from "@/lib/store";
import { STUDIO_FLOOR as F } from "@/lib/studioLook";
import { useThemeColors } from "@/lib/useThemeColors";
import type { ThemeColors } from "@/lib/theme";

const SPAN = 140; // metres covered by the plane: far beyond where the floor has faded into the backdrop
const GRAIN_PX = 128;
const GRAIN_TILE_M = 7; // metres one grain tile covers (a second, smaller scale is sampled from the same tile)

/** Two periodic fractal-noise channels (broad satin cloudiness, finer mottling): the only texture of the floor, 64 KB. */
function grainTexture(): DataTexture {
  const data = new Uint8Array(GRAIN_PX * GRAIN_PX * 4);
  for (let y = 0; y < GRAIN_PX; y++)
    for (let x = 0; x < GRAIN_PX; x++) {
      const u = (x + 0.5) / GRAIN_PX, v = (y + 0.5) / GRAIN_PX, o = (y * GRAIN_PX + x) * 4;
      data[o] = fbm(u, v, 3, 3, 4, 3) * 255;
      data[o + 1] = fbm(u, v, 9, 9, 3, 11) * 255;
      data[o + 3] = 255;
    }
  const t = new DataTexture(data, GRAIN_PX, GRAIN_PX, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// The floor is analytic: the pool of light, the measuring grid and the fade into the backdrop are computed per pixel from the world position, so the plane needs
// no big canvas (the old 2600 px plate was 27 MB of video memory) and the grid lines stay one pixel sharp at every zoom.
const FRAG = /* glsl */ `
uniform vec3 uCentre;
uniform vec3 uMid;
uniform vec3 uEdge;
uniform vec3 uLine;
uniform vec2 uC;
uniform vec3 uK;
uniform vec2 uGrid;
uniform float uGrain;
uniform sampler2D uGrainMap;
varying vec2 vFloorP;

float gridLine(vec2 p, float cell) {
  vec2 w = fwidth(p / cell);
  vec2 d = abs(fract(p / cell - 0.5) - 0.5) / max(w, vec2(1e-5));
  float l = 1.0 - min(min(d.x, d.y), 1.0);
  return l * (1.0 - smoothstep(0.35, 0.9, max(w.x, w.y))); // lines denser than the pixels fade out instead of shimmering
}
`;

const BODY = /* glsl */ `
{
  float r = length(vFloorP - uC);
  float pool = pow(1.0 - smoothstep(0.0, uK.x, r), 1.6);
  float fade = 1.0 - smoothstep(uK.y, uK.z, r);
  vec3 col = mix(uMid, uCentre, pool);
  vec2 g = texture2D(uGrainMap, vFloorP / ${GRAIN_TILE_M.toFixed(1)}).rg;
  col *= 1.0 + (g.r - 0.5 + (texture2D(uGrainMap, vFloorP / ${(GRAIN_TILE_M / 3.7).toFixed(2)}).g - 0.5) * 0.5) * uGrain;
  col = mix(col, uLine, (gridLine(vFloorP, 1.0) * uGrid.x + gridLine(vFloorP, 5.0) * uGrid.y) * fade);
  diffuseColor.rgb = mix(uEdge, col, fade);
}
`;

/** The floor's material, the one uniform that moves (the middle of the pool of light, world x, z) and the four colour uniforms the theme recolours. */
function floorMaterial(grain: DataTexture, textured: boolean, c: ThemeColors) {
  const material = new MeshBasicMaterial({ toneMapped: true });
  const centre = new Vector2();
  const colors = { centre: new Color(c.studioCentre), mid: new Color(c.studioMid), edge: new Color(c.sceneBackdrop), line: new Color(c.studioLine) };
  const uniforms = {
    uCentre: { value: colors.centre },
    uMid: { value: colors.mid },
    uEdge: { value: colors.edge }, // the clear colour (Scene3D): the floor must melt into exactly this
    uLine: { value: colors.line },
    uC: { value: centre },
    uK: { value: new Vector3(F.pool, F.fadeFrom, F.fadeTo) },
    uGrid: { value: new Vector2(F.grid.minor, F.grid.major) },
    uGrain: { value: textured ? F.grain : 0 }, // Eco: a flat satin tone (no cloudiness) and the same grid
    uGrainMap: { value: grain },
  };
  material.customProgramCacheKey = () => "studio-floor";
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFloorP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFloorP = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${BODY}`);
  };
  return { material, centre, colors };
}

const SHADOW_OPACITY = 0.6;

/** The Studio's ground: a satin graphite floor with a soft pool of light under the building, a faint 1 m / 5 m measuring grid, and an edge that melts into the backdrop. */
export default function StudioFloor({ cx, cz }: { cx: number; cz: number }) {
  const textured = useKnobs().textures > 0;
  const grain = useMemo(grainTexture, []);
  const themed = useThemeColors();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- built once with the colours of the moment; the effect below recolours it when the theme changes
  const { material, centre, colors } = useMemo(() => floorMaterial(grain, textured, themed), [grain, textured]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    // a theme change recolours the uniforms in place (no new material, no shader recompile) and asks for one frame, since the scene may be idling between frames
    colors.centre.set(themed.studioCentre); colors.mid.set(themed.studioMid); colors.edge.set(themed.sceneBackdrop); colors.line.set(themed.studioLine);
    invalidate();
  }, [themed, colors, invalidate]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => grain.dispose(), [grain]);
  const setFocusRoom = useStore((s) => s.setFocusRoom);
  // Unlit plate (interior lamps must not bleed onto the ground through walls) plus a shadow-only layer for the sun.
  // Snapped to whole metres so the grid lines sit on world integers.
  const [x, z] = [Math.round(cx), Math.round(cz)];
  centre.set(x, z);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.002, z]}>
      <mesh onDoubleClick={() => setFocusRoom(null)} material={material}>
        <planeGeometry args={[SPAN, SPAN]} />
      </mesh>
      <mesh position={[0, 0, 0.001]} receiveShadow raycast={() => null}>
        <planeGeometry args={[SPAN, SPAN]} />
        <shadowMaterial transparent opacity={SHADOW_OPACITY} />
      </mesh>
    </group>
  );
}
