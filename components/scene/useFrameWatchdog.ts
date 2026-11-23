"use client";
import { addAfterEffect } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { CHECK_MS, STALL_QUIET_MS, stallWaitMs, verdict } from "@/lib/frameWatchdog";
import { nextStreak, type Streak } from "@/lib/recover";

/**
 * Calls `onStall` when no frame has been drawn for a long while although the scene should be drawing (`watching`: the tab is visible and the view is not paused).
 * A frame counts when the render loop finished its pass. Two things stop that for good: a throw inside a frame callback (the loop skips its draw on every refresh), and
 * graphics that were lost and never came back. The caller builds the view again; while that does not help, the next call comes later each time (lib/frameWatchdog.ts).
 */
export function useFrameWatchdog(watching: boolean, onStall: () => void) {
  const stall = useRef(onStall);
  stall.current = onStall;
  const streak = useRef<Streak | null>(null);
  useEffect(() => {
    if (!watching) return;
    let lastFrame = performance.now();
    let lastLook = lastFrame;
    const off = addAfterEffect(() => void (lastFrame = performance.now()));
    const timer = setInterval(() => {
      const now = performance.now();
      const next = nextStreak(streak.current, now, STALL_QUIET_MS); // the streak if this look finds a stall
      const v = verdict(now, lastLook, lastFrame, stallWaitMs(next.n));
      lastLook = now;
      if (v === "ok") return;
      lastFrame = now; // a blocked page, or the view about to be built again: a fresh wait
      if (v === "blocked") return;
      streak.current = next;
      console.warn(`housey: the 3D view stopped drawing, building it again (stall ${next.n + 1} in a row)`);
      stall.current();
    }, CHECK_MS);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [watching]);
}
