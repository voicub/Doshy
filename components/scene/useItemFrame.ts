import { useFrame } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import { Color, MathUtils, type Group, type MeshBasicMaterial, type MeshStandardMaterial, type PointLight } from "three";
import type { Def } from "@/lib/catalog";
import { twinkleLevel } from "@/lib/catalog.seasonal";
import { drapeAt } from "@/lib/curtain";
import { keepAlive } from "@/lib/framePacer";
import type { RGB } from "@/lib/light";
import type { Look as GlowLook } from "@/lib/securityLook";
import type { Item } from "@/lib/types";
import type { ItemMotion } from "./itemMotion";
import { SHADOW_EVERY, SHADOW_EVERY_EDIT } from "./pointShadow";
import { live } from "./skyLive";
import type { ItemLive } from "./useItemLive";

const MIN_VISIBLE_OPACITY = 0.003;
const FADE_RATE = 5; // light fade-in/out speed (1/s)
const POINT_LIGHT_INTENSITY = 7;
const POOL_OPACITY = 0.45;
const EMISSIVE_BOOST = 2.0; // >1 so the bloom pass picks lit fixtures up
const ECHO_PULSE = 1.8; // rad/s of the playing pulse
const SPIN_RATE = 1.5; // spin-up / spin-down damping (1/s)
const DRAPE_RATE = 1.1; // curtains draw slowly: about three seconds
const HEAT_RATE = 1.6;
const CYAN = new Color("#27e0ff");
const TV_COOL = new Color("#8fbaff");
const TV_WHITE = new Color("#eaf3ff");
const HEAT_ORANGE = new Color("#ff8a3c");
const THERMO_IDLE = new Color("#4aa3ff");

/** What the per-frame glow / motion needs to know about the item this render. */
type FrameArgs = {
  item: Item;
  def: Def;
  edit: boolean;
  reduced: boolean;
  echo: boolean;
  thermo: boolean;
  heating: boolean;
  media: boolean;
  sec: GlowLook | undefined;
  /** The linked entity's state ("playing" lights an Echo). */
  state: string | undefined;
  lv: ItemLive;
  /** Colour of a sensor's reading. */
  tint: Color;
  motion: ItemMotion;
  /** Glow level (0..1) the item eases toward. */
  targetLevel: number;
  /** The light's colour as 0..255 sRGB. */
  rgb: RGB;
};

/** Everything that changes every frame, kept off React state: refs the render hands to the scene graph, plus the damped values. */
export type ItemFrame = {
  /** The glow level now (read by a car's lamps). */
  level: { current: number };
  /** Eased 0..1 heat of a radiator (read by its halo). */
  heat: { current: number };
  glowMats: { current: (MeshStandardMaterial | null)[] };
  poolMats: { current: (MeshBasicMaterial | null)[] };
  partRefs: { current: (Group | null)[] };
  lightRef: RefObject<PointLight | null>;
  body: RefObject<Group | null>;
  target: number;
  color: Color;
  work: Color;
  shadowTick: number;
  angles: number[];
  spinK: number;
  swayK: number;
};

const makeFrame = (): ItemFrame => ({
  level: { current: 0 },
  heat: { current: 0 },
  glowMats: { current: [] },
  poolMats: { current: [] },
  partRefs: { current: [] },
  lightRef: { current: null },
  body: { current: null },
  target: 0,
  color: new Color(),
  work: new Color(),
  shadowTick: Math.floor(Math.random() * SHADOW_EVERY),
  angles: [],
  spinK: 0,
  swayK: 0,
});

/** The glow `l` and whether a time-based pulse is running (written by `driveGlow`, read at once: one frame at a time, nothing else touches it). */
const glow = { l: 0, anim: false };

/** Picks the glow colour (into `f.work`) and level for this frame from what the device is doing. */
function driveGlow(a: FrameArgs, f: ItemFrame, t: number) {
  const { work } = f;
  const { reduced, lv, sec } = a;
  let l = f.level.current;
  let anim = false; // a time-based pulse or flicker is running on this device
  work.copy(f.color);
  if (a.thermo) work.copy(a.heating ? HEAT_ORANGE : THERMO_IDLE);
  else if (a.echo && a.state === "playing") {
    work.copy(CYAN);
    if (!reduced) (l *= 0.7 + 0.3 * Math.sin(t * ECHO_PULSE)), (anim = true);
  } else if (a.media) {
    work.copy(TV_COOL).lerp(TV_WHITE, 0.5 + 0.5 * Math.sin(t * 0.8 + 1.3));
    anim = !reduced;
    if (!reduced) l *= 0.86 + 0.07 * Math.sin(t * 1.7) + 0.05 * Math.sin(t * 4.3 + 0.6) + 0.03 * Math.sin(t * 9.1);
  } else if (sec) {
    work.setRGB(sec.rgb[0] / 255, sec.rgb[1] / 255, sec.rgb[2] / 255, "srgb");
    if (!reduced && sec.pulse) (l *= 0.65 + 0.35 * Math.sin(t * sec.pulse * 2 * Math.PI)), (anim = true);
  } else if (lv.sensor) {
    work.copy(a.tint);
    if (!reduced && lv.sensor.anim === "pulse") (l *= 0.65 + 0.35 * Math.sin(t * 3.4)), (anim = true);
    else if (!reduced && lv.sensor.anim === "blink") (l *= Math.sin(t * 6) > 0 ? 1 : 0.25), (anim = true);
  } else if (lv.wash && l > 0) {
    work.copy(lv.wash.tint);
    if (!reduced && lv.wash.badge.attention) (l *= 0.7 + 0.3 * Math.sin(t * 2.2)), (anim = true); // laundry waiting / a problem: a slow pulse
  } else if (lv.run?.running && lv.run.tint) {
    work.copy(lv.run.tint);
    if (!reduced && lv.run.pulse) (l *= 0.75 + 0.25 * Math.sin(t * 2.2)), (anim = true);
  }
  glow.l = l;
  glow.anim = anim;
}

/** Writes the glow into the item's emissive parts, its point light and its floor pools; true when a part twinkles. */
function paintGlow(a: FrameArgs, f: ItemFrame, l: number, t: number): boolean {
  const { work } = f;
  const k = a.def.light?.k ?? 1;
  let twinkling = false;
  for (let i = 0; i < f.glowMats.current.length; i++) {
    const m = f.glowMats.current[i];
    if (!m) continue;
    m.emissive.copy(work);
    const tw = a.def.parts[i]?.twinkle; // fairy lights and candle flames shimmer, each bulb on its own phase (steady under reduced motion)
    if (tw && !a.reduced) twinkling = true;
    m.emissiveIntensity = l * EMISSIVE_BOOST * (tw && !a.reduced ? twinkleLevel(t, i, tw) : 1);
  }
  const light = f.lightRef.current;
  if (light) {
    light.color.copy(work);
    light.intensity = l * POINT_LIGHT_INTENSITY * k;
    // the shadow map is redrawn only while the lamp is lit, a few times a second
    if (light.castShadow && l > 0.003 && ++f.shadowTick % (a.edit ? SHADOW_EVERY_EDIT : SHADOW_EVERY) === 0) light.shadow.needsUpdate = true;
  }
  for (const mat of f.poolMats.current) {
    if (!mat) continue;
    mat.color.copy(work);
    mat.opacity = l * POOL_OPACITY * k;
    mat.visible = mat.opacity > MIN_VISIBLE_OPACITY; // an unlit lamp's pool is invisible: skip its draw call instead of blending nothing
  }
  return twinkling;
}

/** One spinning part (fan, drum, louvre); true while it turns. */
function spinPart(f: ItemFrame, fx: { axis: "x" | "y" | "z"; rad: number; swing?: number }, g: Group, i: number, dt: number, windDriven: boolean, windMul: number): boolean {
  if (fx.swing !== undefined) {
    // an oscillating louvre: the phase runs only while the appliance does, the amplitude fades in and out
    const sway = windDriven ? MathUtils.clamp(0.6 + live.wind / 10, 0.6, 1.6) : 1; // a hanging piece swings harder and faster in a gale
    f.angles[i] = ((f.angles[i] ?? 0) + f.spinK * sway * fx.rad * dt) % (Math.PI * 2);
    g.rotation[fx.axis] = fx.swing * f.spinK * Math.min(1, sway) * Math.sin(f.angles[i]);
    return f.spinK > 0;
  }
  if (f.spinK === 0) return false;
  f.angles[i] = ((f.angles[i] ?? 0) + f.spinK * windMul * fx.rad * dt) % (Math.PI * 2);
  g.rotation[fx.axis] = f.angles[i];
  return true;
}

/** Spinning parts (fans, drums) wind up and down with the appliance; curtains stir while a window beside them is open and draw open and closed. True while anything moves. */
function moveParts(a: FrameArgs, f: ItemFrame, t: number, dt: number): boolean {
  const { reduced, motion, lv } = a;
  // a wind turbine spins with the real wind (faster in a gale, still in calm air) whatever its entity says
  const windDriven = a.item.kind === "energy_wind_turbine" || !!a.def.wind; // garden pieces (windmills, swings, chimes) set `wind` on the def
  const windMul = windDriven ? MathUtils.clamp(live.wind / 5, 0.1, 2.5) : 1;
  f.spinK = MathUtils.damp(f.spinK, !reduced && (windDriven ? live.wind > 0.8 : lv.wash ? lv.wash.view.running : f.target > 0.01) ? 1 : 0, SPIN_RATE, dt); // a WashData drum turns only while the cycle works: still when paused, finished or idle
  f.swayK = MathUtils.damp(f.swayK, !reduced && motion.nearOpen ? 1 : 0, 1.4, dt);
  if (f.spinK < 0.002) f.spinK = 0;
  if (f.swayK < 0.002) f.swayK = 0;
  const amp = f.swayK * Math.min(0.28, 0.05 + 0.025 * live.wind);
  let moving = false; // a part of this device is turning or swaying
  for (let i = 0; i < motion.fx.length; i++) {
    const fx = motion.fx[i];
    const g = f.partRefs.current[i];
    if (!fx || !g) continue;
    if (fx.kind === "spin") {
      if (spinPart(f, fx, g, i, dt, windDriven, windMul)) moving = true;
      continue;
    }
    if (!fx.still) g.rotation.x = amp * Math.sin(t * 1.3 + fx.phase) + amp * 0.4 * Math.sin(t * 2.9 + fx.phase * 2);
    if (!fx.still && f.swayK > 0) moving = true;
    if (fx.drape && fx.layer) {
      const goal = motion.goals[fx.layer] ?? fx.drape.m;
      const o = reduced ? goal : MathUtils.damp(motion.drapeO.current[i] ?? fx.drape.m, goal, DRAPE_RATE, dt);
      motion.drapeO.current[i] = Math.abs(o - goal) < 0.002 ? goal : o;
      if (motion.drapeO.current[i] !== goal) keepAlive();
      const m = drapeAt(fx.drape, motion.drapeO.current[i]); // gathered at the sides when open, drawn across when closed
      g.position.x = m.x;
      g.scale.x = m.s;
    }
  }
  return moving;
}

/** Eases the item's glow, light, floor pool, heat halo and moving parts every frame. Returns the refs the render attaches to the scene graph. */
export function useItemFrame(a: FrameArgs): ItemFrame {
  const f = useMemo(makeFrame, []);
  f.target = a.targetLevel;
  f.color.setRGB(a.rgb[0] / 255, a.rgb[1] / 255, a.rgb[2] / 255, "srgb");

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = clock.elapsedTime;
    f.level.current += (f.target - f.level.current) * (1 - Math.exp(-FADE_RATE * dt));
    if (Math.abs(f.target - f.level.current) < 0.002) f.level.current = f.target;
    driveGlow(a, f, t);
    const l = glow.l;
    const twinkling = paintGlow(a, f, l, t);
    const anim = glow.anim || twinkling;
    f.heat.current = MathUtils.damp(f.heat.current, a.heating ? 1 : 0, HEAT_RATE, dt);
    if (Math.abs(f.heat.current - (a.heating ? 1 : 0)) > 0.002) keepAlive(false);
    const shake = !a.reduced && a.lv.sensor?.anim === "shake";
    if (f.body.current) f.body.current.position.x = shake ? Math.sin(t * 60) * 0.004 : 0;
    const moving = moveParts(a, f, t, dt);
    // still changing on its own: an easing not yet arrived, a pulse, flicker or twinkle on a lit device, a part that spins or sways
    if (moving || shake) keepAlive();
    else if (f.level.current !== f.target || (anim && l > 0.003)) keepAlive(false); // glow only: nothing that casts a shadow moves
  });
  return f;
}
