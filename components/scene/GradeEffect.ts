import { wrapEffect } from "@react-three/postprocessing";
import { BlendFunction, Effect } from "postprocessing";
import { Uniform, Vector3 } from "three";

// Split-toning + gentle S-curve, done in display-referred (gamma) space after tone mapping.
const FRAG = /* glsl */ `
uniform vec3 shadowLift;
uniform vec3 highlightTint;
uniform float contrast;
uniform float saturation;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = pow(max(inputColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  float hi = smoothstep(0.4, 0.95, l);
  c += shadowLift * sh;
  c *= mix(vec3(1.0), highlightTint, hi);
  c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
  float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(g), c, saturation);
  outputColor = vec4(pow(max(c, vec3(0.0)), vec3(2.2)), inputColor.a);
}
`;

type GradeOptions = {
  shadowLift?: [number, number, number]; // added to dark tones (teal)
  highlightTint?: [number, number, number]; // multiplied into bright tones (amber)
  contrast?: number;
  saturation?: number;
};

export class GradeEffectImpl extends Effect {
  private readonly lift: Vector3;
  private readonly tint: Vector3;
  private readonly contrast: Uniform<number>;
  private readonly saturation: Uniform<number>;

  constructor({ shadowLift = [0, 0.02, 0.03], highlightTint = [1.06, 1, 0.9], contrast = 0.25, saturation = 1 }: GradeOptions = {}) {
    const lift = new Vector3(...shadowLift);
    const tint = new Vector3(...highlightTint);
    const contrastU = new Uniform(contrast);
    const saturationU = new Uniform(saturation);
    super("GradeEffect", FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["shadowLift", new Uniform(lift)],
        ["highlightTint", new Uniform(tint)],
        ["contrast", contrastU],
        ["saturation", saturationU],
      ]),
    });
    this.lift = lift;
    this.tint = tint;
    this.contrast = contrastU;
    this.saturation = saturationU;
  }

  /** Rewrites the grade in place (called every frame as the sky changes: no allocation). */
  setLook(l: Required<GradeOptions>): void {
    this.lift.set(...l.shadowLift);
    this.tint.set(...l.highlightTint);
    this.contrast.value = l.contrast;
    this.saturation.value = l.saturation;
  }
}

export const Grade = wrapEffect(GradeEffectImpl);
