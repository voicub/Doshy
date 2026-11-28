"use client";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { WAKE_EVENT, createPacer, frameFlags, takeKept, type FramePolicy } from "@/lib/framePacer";
import { isOrtho } from "./camera";
import { probe } from "./devProbe";

/** Pointer, touch, wheel and key activity: the owner is looking, so the scene draws at the tier's rate for a while (hover, drag, camera easing). */
const INPUT = ["pointerdown", "pointermove", "pointerup", "wheel", "keydown", "touchstart", "touchmove"] as const;
const VSYNC_SLACK_MS = 8;
/** The HUD: panels, sheets, dialogs. A finger on them scrolls or taps the panel, it does not move the 3D view, so it must not wake the scene (a change it makes reaches the scene through React). */
const HUD = ".chrome, .scrim, [role='dialog']";

/**
 * Paces a Canvas running `frameloop="demand"` (lib/framePacer.ts): after every frame it asks the pacer when the next one is due and requests it with a timer,
 * so the scene draws at `capMs` while the owner touches it or anything moves (`keepAlive()`), once per idle heartbeat when still, and never while paused (the Canvas
 * switches to frameloop "never"). Frames somebody else asked for (a React change, the camera controls, a resize) start a short settle burst so easings finish.
 * Renders nothing; mounted only for tiers that pace (not in the plain always-drawing loop).
 */
export default function FrameDriver({ capMs, ambientMs, shadowMs }: Pick<FramePolicy, "capMs" | "ambientMs" | "shadowMs">) {
  const getState = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const frameloop = useThree((s) => s.frameloop);
  const begin = useRef<(() => void) | null>(null);

  useEffect(() => {
    // the frame itself starts at the next screen refresh after the timer fires (up to 16 ms later on 60 Hz): aim that much early so a 30 fps cap really gives 30, not 20
    const slack = (ms: number) => (ms > 0 ? Math.max(1, ms - VSYNC_SLACK_MS) : 0);
    const pacer = createPacer(slack(capMs), { ambientMs: slack(ambientMs), shadowMs });
    let timer: number | undefined;
    let due = Infinity; // when the pending timer fires (performance.now() ms)
    let planned = false; // the next frame is one this driver asked for
    let drew = false; // a frame ran since the last after-effect
    let lastStart = 0;
    let frames = 0;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      due = performance.now() + ms;
      timer = window.setTimeout(() => {
        due = Infinity;
        planned = true;
        invalidate();
      }, ms);
    };
    /** The owner did something, or the view came back: a frame is due within one cap interval, and the scene stays busy for a while. */
    const wake = () => {
      const now = performance.now();
      pacer.poke(now);
      const soon = Math.max(0, lastStart + capMs - now);
      if (due - now > soon) schedule(soon);
    };

    const cam = new Float32Array(8); // the camera last frame: position, zoom, orientation
    const sig = new Float32Array(8);
    begin.current = () => {
      const { camera } = getState();
      sig.set([camera.position.x, camera.position.y, camera.position.z, isOrtho(camera) ? camera.zoom : 0, camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]);
      const moved = sig.some((v, i) => v !== cam[i]);
      cam.set(sig);
      // frames === 0 here: the loop ran on because something asked for a frame from inside the previous one (the camera controls do); that is the scene's own doing, not a new change
      const wasPlanned = planned || getState().internal.frames === 0;
      planned = false;
      lastStart = performance.now();
      frameFlags.shadowsDirty = pacer.begin(lastStart, wasPlanned, moved);
      takeKept(); // a flag raised outside a frame is stale
      drew = true;
    };
    const offAfter = addAfterEffect(() => {
      if (!drew) return;
      drew = false;
      getState().internal.frames = 0; // a frame asked for from inside a frame callback (the camera controls do) would chain at the screen's rate: this driver sets the pace
      const kept = takeKept();
      schedule(pacer.end(performance.now(), kept.alive, kept.shadows));
      probe({ frames: ++frames });
    });
    const onVisible = () => !document.hidden && wake();
    const onInput = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(HUD)) pacer.hold(performance.now());
      else wake();
    };
    for (const t of INPUT) window.addEventListener(t, onInput, { capture: true, passive: true });
    window.addEventListener(WAKE_EVENT, wake);
    document.addEventListener("visibilitychange", onVisible);
    wake();
    return () => {
      offAfter();
      clearTimeout(timer);
      begin.current = null;
      for (const t of INPUT) window.removeEventListener(t, onInput, { capture: true });
      window.removeEventListener(WAKE_EVENT, wake);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [capMs, ambientMs, shadowMs, getState, invalidate]);

  // back from a pause (screensaver, hidden tab): draw at once
  useEffect(() => {
    if (frameloop === "demand") invalidate();
  }, [frameloop, invalidate]);

  useFrame(() => begin.current?.(), -1000);
  return null;
}
