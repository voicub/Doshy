"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAlerts } from "@/lib/alertsStore";
import { createIdle, type Idle } from "@/lib/idle";
import { dueAt, showsScene, slideKey, start, step, tourRooms, type Cursor, type RotationInput, type Slide } from "@/lib/rotation";
import { useStore } from "@/lib/store";
import { nightDim, pixelShift, startMs, WALL_EVENT, WALL_TRY_EVENT } from "@/lib/wall";
import { cornerAzimuth, orbitRate, wallCam } from "@/lib/wallCamera";
import { useWall } from "@/lib/wallStore";
import { useSky } from "@/lib/useSky";
import { useReducedMotion } from "./scene/motion";
import { AlertSlide, ClockSlide, HouseSlide, SceneCaption } from "./wall/WallSlides";
import { SkyTonight } from "./ui/SkyChart";
import { AdvisorToday } from "./ui/AdvisorToday";
import "./wall/wallDisplay.css";

const CARD_DIM_SHARE = 0.5;
/** Any of these means somebody is there: the idle time starts again (a mouse that only moves counts too, for a desktop test). */
const ACTIVITY = ["pointerdown", "pointermove", "wheel", "touchstart", "keydown"] as const;
const EMBED = /[?&]embed=1\b/;
const FADE_MS = 700; // matches the CSS transition on .wall-cover
const SETTLE_MS = 1100; // the camera swing into a room (0.65 s) plus a breath, hidden behind the cover
const CARD_SETTLE_MS = 150;
const SWIPE_SLOP_PX = 10; // a finger that moved this far is a swipe, which the browser does not follow with a click
const SHIFT_MS = 60_000;

/** The idle timer behind the wall display. Returns whether the screen is idle now. "Always on" starts at once and comes back a minute after each touch. */
function useWallIdle(on: boolean, ms: number, always: boolean): { idle: boolean; wake: () => void } {
  const [idle, setIdle] = useState(false);
  const timer = useRef<Idle | null>(null);
  useEffect(() => {
    if (!on) return undefined;
    const t = createIdle({ now: Date.now, setTimer: (fn, delay) => window.setTimeout(fn, delay), clearTimer: (h) => window.clearTimeout(h as number) }, setIdle);
    timer.current = t;
    const poke = () => t.poke();
    const sleep = () => t.sleep();
    for (const e of ACTIVITY) window.addEventListener(e, poke, { capture: true, passive: true });
    window.addEventListener(WALL_TRY_EVENT, sleep);
    return () => {
      for (const e of ACTIVITY) window.removeEventListener(e, poke, true);
      window.removeEventListener(WALL_TRY_EVENT, sleep);
      t.stop();
      timer.current = null;
      setIdle(false);
    };
  }, [on]);
  useEffect(() => {
    timer.current?.setTimeout(ms);
    if (always) timer.current?.sleep();
  }, [on, ms, always]);
  return { idle, wake: useCallback(() => timer.current?.wake(), []) };
}

/** The slide that is on screen. A change goes through black: the cover fades in, the scene is set up behind it, the cover fades out. Reduced motion and alerts switch at once. */
function useShown(target: Slide, reduced: boolean): { shown: Slide | null; covered: boolean } {
  const [shown, setShown] = useState<Slide | null>(null);
  const [covered, setCovered] = useState(false);
  const key = slideKey(target);
  useEffect(() => {
    if (shown && slideKey(shown) === key) return undefined;
    if (reduced || target.kind === "alert") {
      setShown(target);
      setCovered(false);
      return undefined;
    }
    setCovered(true);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => {
      setShown(target);
      timers.push(window.setTimeout(() => setCovered(false), showsScene(target) ? SETTLE_MS : CARD_SETTLE_MS));
    }, FADE_MS));
    return () => timers.forEach(window.clearTimeout);
    // `shown` is deliberately not a dependency: this runs when the wanted slide changes, not when the one on screen does
  }, [key, reduced]);
  return { shown, covered };
}

/** Puts the 3D view where a slide wants it, and remembers where the owner had left it to put it back. Returns whether the slide is a full-screen card. */
function useScene(shown: Slide | null, secs: number, reduced: boolean): boolean {
  const alertRoom = useAlerts((s) => (shown?.kind === "alert" ? s.queue.find((a) => a.id === shown.alertId)?.roomId : undefined));
  const card = !!shown && !showsScene(shown) && !(shown.kind === "alert" && alertRoom);
  const before = useRef<{ isolated: string | null; focus: string | null } | null>(null);

  useEffect(() => {
    if (!shown) return;
    const s = useStore.getState();
    before.current ??= { isolated: s.isolatedRoom, focus: s.focusRoom };
    const root = document.documentElement;
    if (card) root.setAttribute("data-wall-still", "1");
    else root.removeAttribute("data-wall-still");
    window.dispatchEvent(new Event(WALL_EVENT));
    wallCam.rate = 0;
    if (shown.kind === "overview") {
      s.setIsolatedRoom(null);
      s.setFocusRoom(null);
      wallCam.snap = cornerAzimuth(shown.corner);
      wallCam.rate = reduced ? 0 : orbitRate(secs);
    } else if (shown.kind === "room") s.setIsolatedRoom(shown.roomId);
    else if (shown.kind === "alert" && alertRoom) s.setIsolatedRoom(alertRoom);
  }, [shown, card, alertRoom, secs, reduced]);

  // leaving the wall display: the view goes back to what it was
  useEffect(
    () => () => {
      const root = document.documentElement;
      root.removeAttribute("data-wall-still");
      wallCam.rate = 0;
      wallCam.snap = null;
      const b = before.current;
      if (b) {
        const s = useStore.getState();
        s.setIsolatedRoom(null);
        s.setFocusRoom(b.focus);
        if (b.isolated) s.setIsolatedRoom(b.isolated);
      }
      window.dispatchEvent(new Event(WALL_EVENT));
    },
    [],
  );
  return card;
}

/** A black cover over the whole screen while the sun is down (opacity only: no filters, nothing to repaint per frame). A text card is dimmed less: its text must stay readable (WCAG AA). */
function Dim({ card }: { card: boolean }) {
  const level = nightDim(useSky().daylight) * (card ? CARD_DIM_SHARE : 1);
  return level > 0 ? <div className="wall-dim" style={{ opacity: level }} aria-hidden /> : null;
}

/** The rotation itself: the scheduler, the fades, the scene and the touch that ends it. */
function WallStage({ onLeave }: { onLeave: () => void }) {
  const { kinds, secs, dim } = useWall(useShallow((s) => ({ kinds: s.kinds, secs: s.secs, dim: s.dim })));
  const plan = useStore((s) => s.plan);
  const isolateOpen = useStore((s) => s.isolateOpen);
  const alertIds = useAlerts(useShallow((s) => s.queue.map((a) => a.id)));
  const reduced = useReducedMotion();
  const roomIds = useMemo(() => tourRooms(plan, isolateOpen), [plan, isolateOpen]);
  const input = useMemo<RotationInput>(() => ({ kinds, secs, roomIds, alertIds }), [kinds, secs, roomIds, alertIds]);
  const latest = useRef(input);
  const [cursor, setCursor] = useState<Cursor>(() => start(input, Date.now()));

  useEffect(() => {
    latest.current = input;
    setCursor((c) => step(c, input, Date.now())); // the choices changed (an alert came or went, a room was deleted): react now
  }, [input]);

  useEffect(() => {
    let timer: number | undefined;
    const arm = () => {
      const at = dueAt(cursor, latest.current);
      if (!Number.isFinite(at)) return;
      timer = window.setTimeout(() => {
        const next = step(cursor, latest.current, Date.now());
        if (next === cursor) arm(); // woke a hair early
        else setCursor(next);
      }, Math.max(50, at - Date.now()));
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [cursor]);

  const { shown, covered } = useShown(cursor.slide, reduced);
  const card = useScene(shown, secs, reduced);
  const alert = useAlerts((s) => (shown?.kind === "alert" ? s.queue.find((a) => a.id === shown.alertId) : undefined));

  // Leaving: a tap (the click ends it, so nothing underneath is hit), a swipe, a key or the wheel. Keys are swallowed: the one that wakes the screen does nothing else.
  const down = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onLeave();
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("wheel", onLeave, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("wheel", onLeave, true);
    };
  }, [onLeave]);

  const room = shown?.kind === "room" ? shown.roomId : null;
  const scene = !!shown && !card;
  return (
    <div
      className="wall"
      data-card={card ? "1" : undefined}
      role="button"
      tabIndex={-1}
      aria-label="Wall display. Touch the screen to go back."
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > SWIPE_SLOP_PX && onLeave()}
      onClick={onLeave}
    >
      <div className="wall-shift">
        {shown?.kind === "clock" && <ClockSlide />}
        {shown?.kind === "house" && <HouseSlide />}
        {shown?.kind === "sky" && <div className="wall-card"><h2 className="wall-title">Tonight’s sky</h2><SkyTonight compact /></div>}
        {shown?.kind === "advisor" && <div className="wall-card"><AdvisorToday wall /></div>}
        {scene && shown?.kind !== "alert" && <SceneCaption roomId={room} />}
        {shown?.kind === "alert" && <AlertSlide alert={alert} scene={scene} />}
      </div>
      {dim && shown?.kind !== "alert" && <Dim card={card} />}
      <div className="wall-cover" data-on={covered ? "1" : undefined} />
    </div>
  );
}

/**
 * The wall display: after the idle time (or always, when asked) the screen rotates through the chosen slides, and a touch gives the normal interface back at once.
 * It replaces the dark screensaver while it is on (components/KioskTouch.tsx). Starts only in the Live view, never over the editors. No markup while off.
 */
export default function WallDisplay() {
  const stored = useWall((s) => s.on);
  const on = stored && !(typeof location !== "undefined" && EMBED.test(location.search)); // a card embedded in another page never takes the screen over
  const shift = useWall((s) => s.shift);
  const ms = useWall((s) => startMs(s));
  const always = useWall((s) => s.startMin === 0);
  const live = useStore((s) => s.view === "live");
  const { idle, wake } = useWallIdle(on, ms, always);
  const running = on && idle && live;

  useEffect(() => {
    if (!running) return undefined;
    const root = document.documentElement;
    root.setAttribute("data-wall", "1");
    return () => root.removeAttribute("data-wall");
  }, [running]);

  // burn-in protection: the picture, and the interface when it is back, move a few pixels every minute while a wall display is set up
  useEffect(() => {
    if (!on || !shift) return undefined;
    const root = document.documentElement;
    const move = () => {
      const p = pixelShift(Date.now() / SHIFT_MS);
      root.style.setProperty("--wall-sx", `${p.x}px`);
      root.style.setProperty("--wall-sy", `${p.y}px`);
    };
    root.setAttribute("data-wall-shift", "1");
    move();
    const t = window.setInterval(move, SHIFT_MS);
    return () => {
      window.clearInterval(t);
      root.removeAttribute("data-wall-shift");
      root.style.removeProperty("--wall-sx");
      root.style.removeProperty("--wall-sy");
    };
  }, [on, shift]);

  return running ? <WallStage onLeave={wake} /> : null;
}
