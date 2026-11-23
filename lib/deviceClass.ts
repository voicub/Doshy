// What kind of device is this, and so which graphics tier should it start on? Pure: the browser signals are passed in (`readSignals` collects them), so the node
// test runner can feed any device. The owner's own choice in the Graphics panel always wins over this; it only decides where "Automatic" starts.
import type { Tier } from "./quality.ts";

export type DeviceSignals = {
  /** The physical screen (screen.width/height), not the window: a small browser window on a big desktop is not a small device. */
  screenWidth: number;
  screenHeight: number;
  /** navigator.hardwareConcurrency / navigator.deviceMemory (GB, Chromium only, capped at 8); undefined when the browser hides them. */
  cores?: number;
  memory?: number;
  ua?: string;
  /** The WEBGL_debug_renderer_info string once a GL context exists; undefined before that. */
  renderer?: string;
  /** Installed app window / kiosk mode / ?kiosk=1 (lib/viewport attrs: data-kiosk). */
  kiosk?: boolean;
};

export type DeviceClass = { tier: Tier; /** Plain-words reasons, shown under "Chosen for this device" in the Graphics panel. */ reasons: string[] };

const SMALL_SCREEN_SIDE = 700; // css px: the shorter side of a 7 inch panel (800x480, 1024x600)
const PHONE_UA = /Android|iPhone|iPad|iPod|Mobile/i;
const ARM_UA = /armv7l|armv8l|aarch64|Raspberry|CrOS/i;
const WEAK_GPU = /V3D|VideoCore|Mali|Adreno|llvmpipe|SwiftShader|PowerVR|Software/i;

/** The graphics chip's name without the ANGLE/Direct3D wrapping, for the explanation text. */
export const gpuName = (renderer: string): string => renderer.replace(/^ANGLE \((.*)\)$/, "$1").split(",").slice(0, 2).join(",").trim();

export function classifyDevice(s: DeviceSignals): DeviceClass {
  const ua = s.ua ?? "";
  const side = Math.min(s.screenWidth, s.screenHeight);
  const phone = PHONE_UA.test(ua);
  const renderer = s.renderer;
  const weakGpu = !!renderer && WEAK_GPU.test(renderer);
  const reasons: string[] = [];

  // a phone: its chip is fine for the Light look, its battery and heat are not for anything heavier. A software renderer on a phone is still too slow for Light.
  if (phone) {
    if (weakGpu && /llvmpipe|SwiftShader|Software/i.test(renderer)) return { tier: "eco", reasons: ["This phone draws the 3D view in software, which is slow."] };
    return { tier: "low", reasons: ["This is a phone: Light keeps it cool and the battery going."] };
  }

  if (side <= SMALL_SCREEN_SIDE) reasons.push(`This is a small screen (${s.screenWidth} x ${s.screenHeight}).`);
  if (ARM_UA.test(ua)) reasons.push("This looks like a Raspberry Pi or another small ARM computer.");
  if (weakGpu) reasons.push(`Its graphics chip (${gpuName(renderer)}) is a small one.`);
  const lowCores = s.cores !== undefined && s.cores <= 4;
  const lowMemory = s.memory !== undefined && s.memory <= 4;
  if ((s.cores !== undefined && s.cores <= 2) || (s.memory !== undefined && s.memory <= 2) || (lowCores && lowMemory)) {
    reasons.push(`It has little power to spare (${s.cores ?? "?"} processor cores, ${s.memory ?? "?"} GB of memory).`);
  }
  if (reasons.length) return { tier: "eco", reasons };

  // a wall display on a Linux mini PC or similar: always on, usually modest graphics
  if (s.kiosk && /Linux/i.test(ua)) return { tier: "low", reasons: ["This is an always-on display on a Linux computer: Light keeps it cool."] };
  return { tier: "high", reasons: ["This looks like a computer with room to spare."] };
}

/** The signals of the running browser. Only called in the browser (never at import time). */
export function readSignals(renderer?: string): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    screenWidth: screen.width,
    screenHeight: screen.height,
    cores: nav.hardwareConcurrency || undefined,
    memory: nav.deviceMemory,
    ua: nav.userAgent,
    renderer,
    kiosk: document.documentElement.dataset.kiosk === "1",
  };
}

/** The graphics chip's name, from a throwaway context that is released at once; undefined when the browser hides it. */
export function readRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): string | undefined {
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : undefined;
  return typeof name === "string" ? name : undefined;
}
