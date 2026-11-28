import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType, type MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from "three";
import { fbm } from "@/lib/pbrNoise";
import { MACRO_SCALES_M } from "@/lib/groundLook";

// Anti-tiling for ground: a procedural tile repeats every 1-3 m and the eye finds the repeat on a big lawn or patio. This adds tone and warm/cool patches from the
// WORLD position at three scales (a few metres, tens of metres, and one that is not a multiple of any tile), so no two neighbouring tiles look the same. One 64 KB
// noise texture shared by every ground material and two extra texture reads per pixel; only on tiers that draw procedural textures (Balanced and up).

const MACRO_PX = 128;
let macro: DataTexture | null = null;

/** Three periodic noise channels (R broad, G medium, B fine); shared, one per page. */
export function macroTexture(): DataTexture {
  if (macro) return macro;
  const data = new Uint8Array(MACRO_PX * MACRO_PX * 4);
  for (let y = 0; y < MACRO_PX; y++)
    for (let x = 0; x < MACRO_PX; x++) {
      const u = (x + 0.5) / MACRO_PX, v = (y + 0.5) / MACRO_PX, o = (y * MACRO_PX + x) * 4;
      data[o] = fbm(u, v, 4, 4, 3, 71) * 255;
      data[o + 1] = fbm(u, v, 6, 6, 3, 72) * 255;
      data[o + 2] = fbm(u, v, 8, 8, 2, 73) * 255;
      data[o + 3] = 255;
    }
  macro = new DataTexture(data, MACRO_PX, MACRO_PX, RGBAFormat, UnsignedByteType);
  macro.wrapS = macro.wrapT = RepeatWrapping;
  macro.magFilter = LinearFilter;
  macro.minFilter = LinearMipmapLinearFilter;
  macro.generateMipmaps = true;
  macro.needsUpdate = true;
  return macro;
}

/** GLSL: `macroNoise(worldXZ)` = (tone, warm/cool), each about -0.5..0.5, from the three scales of one shared texture. Shared with the surroundings' ground shader. */
export const MACRO_GLSL = /* glsl */ `
uniform sampler2D uMacroMap;
vec2 macroNoise(vec2 p) {
  vec3 n = vec3(
    texture2D(uMacroMap, p / ${MACRO_SCALES_M[0].toFixed(1)}).r,
    texture2D(uMacroMap, p / ${MACRO_SCALES_M[1].toFixed(1)} + 0.37).g,
    texture2D(uMacroMap, p / ${MACRO_SCALES_M[2].toFixed(1)} + 0.71).b) - 0.5;
  return vec2(n.x * 0.42 + n.y * 0.34 + n.z * 0.16, n.y);
}
`;

const DECL = /* glsl */ `
${MACRO_GLSL}
uniform vec3 uMacro;
varying vec2 vMacroP;
`;

const APPLY = /* glsl */ `
{
  vec2 mn = macroNoise(vMacroP);
  diffuseColor.rgb *= 1.0 + mn.x * uMacro.x;
  diffuseColor.rgb *= vec3(1.0 + mn.y * uMacro.y, 1.0, 1.0 - mn.y * uMacro.y);
}
`;

/**
 * Props for a <meshStandardMaterial> that gets the macro variation: `tone` = how strong the light/dark patches are (0.4 = about +-8 % on a lawn), `hue` = the
 * warm/cool drift (0.12 = a few percent more red on one patch, more blue on the next). Spread the result into the material; call it once per material.
 */
export function macroVariation(tone: number, hue: number): Pick<MeshStandardMaterial, "onBeforeCompile" | "customProgramCacheKey"> {
  return {
    onBeforeCompile: (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uMacroMap = { value: macroTexture() };
      shader.uniforms.uMacro = { value: [tone, hue, 0] };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\nvarying vec2 vMacroP;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvMacroP = (modelMatrix * vec4(transformed, 1.0)).xz;`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${DECL}`).replace("#include <map_fragment>", `#include <map_fragment>\n${APPLY}`);
    },
    customProgramCacheKey: () => "ground-macro",
  };
}
