"use client";
import { useEffect, useRef } from "react";
import { IDLE_EVENT, saverMs, SLEEP_EVENT, WAKE_EVENT, wakeWanted } from "@/lib/display";
import { useDisplay } from "@/lib/displayStore";
import { createIdle, type Idle } from "@/lib/idle";
import { fieldHints, keyboardOpen, nextBaseline, wantsKeyboard } from "@/lib/keyboard";
import { useVp } from "@/lib/useVp";
import { createWakeLock, type WakeLock } from "@/lib/wakeLock";

const KEYBOARD_SETTLE_MS = 350; // the on-screen keyboard slides up; scroll the field into view once it has

/** Activity that keeps the screen awake: a touch, a stylus, a key or a scroll. A mouse move counts too (desktop). */
const ACTIVITY = ["pointerdown", "pointermove", "wheel", "touchstart"] as const;

/** Keep the screen on while `wanted` (Screen Wake Lock; the browser drops it when the tab is hidden, so it is taken again when the tab is shown). */
function useWakeLock(wanted: boolean) {
  const wake = useRef<WakeLock | null>(null);
  useEffect(() => {
    const lock = createWakeLock(navigator.wakeLock, () => document.visibilityState === "visible", (wakeStatus) => useDisplay.setState({ wakeStatus }));
    wake.current = lock;
    const onVisible = () => void lock.resume();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock.set(false);
      wake.current = null;
    };
  }, []);
  useEffect(() => void wake.current?.set(wanted), [wanted]);
}

/** The idle timer behind the screensaver: `data-saver` on <html>, the `housey:idle` event, and any input wakes it. */
function useIdleTimer(idleMs: number) {
  const idle = useRef<Idle | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const timer = createIdle({ now: Date.now, setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (h) => window.clearTimeout(h as number) }, (isIdle) => {
      useDisplay.setState({ idle: isIdle });
      if (isIdle) root.setAttribute("data-saver", "1");
      else root.removeAttribute("data-saver");
      window.dispatchEvent(new CustomEvent(IDLE_EVENT, { detail: { idle: isIdle } }));
    });
    idle.current = timer;
    const poke = () => timer.poke();
    const key = (e: KeyboardEvent) => {
      if (!timer.isIdle()) return timer.poke();
      e.stopPropagation(); // the key that wakes the screen does nothing else
      e.preventDefault();
      timer.wake();
    };
    const sleep = () => timer.sleep();
    const wakeNow = () => timer.wake();
    for (const t of ACTIVITY) window.addEventListener(t, poke, { capture: true, passive: true });
    window.addEventListener("keydown", key, true);
    window.addEventListener(SLEEP_EVENT, sleep);
    window.addEventListener(WAKE_EVENT, wakeNow);
    return () => {
      for (const t of ACTIVITY) window.removeEventListener(t, poke, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener(SLEEP_EVENT, sleep);
      window.removeEventListener(WAKE_EVENT, wakeNow);
      timer.stop();
      idle.current = null;
      root.removeAttribute("data-saver");
    };
  }, []);
  useEffect(() => idle.current?.setTimeout(idleMs), [idleMs]);
}

/** On-screen keyboard help (`data-kbd-open` on <html>, the focused field scrolls into view, keyboard hints on fields) and no long-press menu on the HUD. */
function useKeyboardAssist() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const size = () => ({ width: Math.round(innerWidth), height: Math.round(vv ? vv.height * vv.scale : innerHeight) });
    let base = nextBaseline(null, size());
    const update = () => {
      const cur = size();
      base = nextBaseline(base, cur);
      const open = root.getAttribute("data-coarse") === "1" && keyboardOpen(base.height, cur.height, wantsKeyboard(document.activeElement));
      if (open) root.setAttribute("data-kbd-open", "1");
      else root.removeAttribute("data-kbd-open");
    };
    let scroll = 0;
    // keyboard hints (no suggestions, no capital letter on a search box, a "Search" or "Go" Enter key) are set on the field itself before the keyboard opens: on press, and on focus for fields focused by code
    const tune = (el: EventTarget | null) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return; // the only fields that bring up a keyboard
      const hints = fieldHints({ tagName: el.tagName, type: el.type, role: el.getAttribute("role"), inForm: !!el.form }, (a) => el.hasAttribute(a));
      for (const [k, v] of Object.entries(hints)) el.setAttribute(k, v);
    };
    const onPress = (e: PointerEvent) => tune(e.target);
    const onFocusIn = (e: FocusEvent) => {
      tune(e.target);
      update();
      const el = e.target;
      if (!(el instanceof HTMLElement) || root.getAttribute("data-coarse") !== "1" || !wantsKeyboard(el)) return;
      window.clearTimeout(scroll);
      scroll = window.setTimeout(() => el.scrollIntoView({ block: "center", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), KEYBOARD_SETTLE_MS);
    };
    const onFocusOut = () => requestAnimationFrame(update);
    // a long press on the HUD or the 3D view opens the browser's context menu on a touch screen: not wanted, except in text fields (copy and paste)
    const onContext = (e: MouseEvent) => {
      if (root.getAttribute("data-coarse") !== "1" && root.getAttribute("data-kiosk") !== "1") return;
      if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable='true'], .selectable")) return;
      e.preventDefault();
    };
    vv?.addEventListener("resize", update);
    addEventListener("resize", update);
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("contextmenu", onContext);
    return () => {
      vv?.removeEventListener("resize", update);
      removeEventListener("resize", update);
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("contextmenu", onContext);
      window.clearTimeout(scroll);
      root.removeAttribute("data-kbd-open");
    };
  }, []);

}

/**
 * Plumbing for wall displays and touch screens, no markup: keep-screen-on, the idle timer behind the screensaver, the on-screen keyboard and no long-press menu on the HUD.
 */
export default function KioskTouch() {
  const { kiosk } = useVp();
  useWakeLock(useDisplay((s) => wakeWanted(s, kiosk)));
  useIdleTimer(useDisplay((s) => saverMs(s, kiosk)));
  useKeyboardAssist();
  return null;
}
