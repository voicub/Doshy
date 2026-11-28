// Turns the bytes of a Radiance .hdr picture into the light the scene uses. Loaded on demand (HdriEnv imports it only once a real sky is wanted and the tier allows it),
// so Eco and Light never fetch or compile any of it. Browser module (WebGL); the pure parts are lib/polyhavenEnv.ts.
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, LinearSRGBColorSpace, PMREMGenerator, RGBAFormat, UVMapping, ClampToEdgeWrapping, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { findSun, type PictureSun } from "@/lib/polyhavenEnv";

/** A picture larger than this is not one of Poly Haven's (a 2k map is 2048 x 1024): refused before anything is uploaded. */
const MAX_SIDE = 4096;

export type BuiltEnv = {
  /** Prefiltered light for `scene.environment` (and, blurred, `scene.background`). The caller disposes it. */
  target: WebGLRenderTarget;
  /** Only looked for when asked: null = the picture has no clear sun. */
  sun: PictureSun | null | undefined;
};

/** Decode the picture, find the sun when `wantSun`, prefilter it for lighting and reflections, and free the full picture again (only the small prefiltered map stays on the GPU). */
export function buildEnv(gl: WebGLRenderer, bytes: ArrayBuffer, wantSun: boolean): BuiltEnv {
  const parsed = new HDRLoader().parse(bytes); // half floats: half the memory of full floats, filtered everywhere
  const { data, width, height, type } = parsed;
  if (!data || !width || !height || width > MAX_SIDE || height > MAX_SIDE) throw new Error("That lighting picture could not be read.");
  const sun = wantSun ? findSun(data, width, height, type === HalfFloatType ? DataUtils.fromHalfFloat : undefined) : undefined;
  const source = new DataTexture(data, width, height, RGBAFormat, type, UVMapping, ClampToEdgeWrapping, ClampToEdgeWrapping, LinearFilter, LinearFilter);
  source.colorSpace = LinearSRGBColorSpace;
  source.generateMipmaps = false;
  source.flipY = true; // the file's top row looks up
  source.needsUpdate = true;
  const pmrem = new PMREMGenerator(gl);
  try {
    return { target: pmrem.fromEquirectangular(source), sun };
  } finally {
    source.dispose();
    pmrem.dispose();
  }
}
