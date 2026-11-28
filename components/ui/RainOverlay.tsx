"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { clamp } from "@/lib/mathUtil";
import { useSky } from "@/lib/useSky";
import { isLite, useQuality } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { useReducedMotion } from "../scene/motion";
import { drawScene, type RainSprites } from "./rainDraw";
import { createSim, isBusy, stepSim, type RainInput } from "./rainSim";
import { dropSprite, softSprite } from "./rainSprites";
import "./RainOverlay.css";

type Engine = { wake: () => void; dispose: () => void };

/** One rAF loop for rain streaks, glass drops with trails, snow, fog and lightning flashes. Runs only while something is visible. */
function createEngine(canvas: HTMLCanvasElement, input: MutableRefObject<RainInput>): Engine | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const sprites: RainSprites = { drop: dropSprite(), flake: softSprite(32, "240,246,255", 0.9), fog: softSprite(256, "214,224,232", 0.55) };
  const sim = createSim();
  const timers: number[] = [];

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    sim.W = window.innerWidth;
    sim.H = window.innerHeight;
    canvas.width = Math.round(sim.W * dpr);
    canvas.height = Math.round(sim.H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const bolt = (external: boolean) => {
    if (input.current.show < 0.5) return;
    if (external) sim.lastBolt = sim.clock;
    sim.flash = 1;
    timers.push(window.setTimeout(() => (sim.flash = 0.65), 130), window.setTimeout(() => (sim.flash = 0.9), 210));
  };
  const onBolt = () => bolt(true);
  window.addEventListener("housey:lightning", onBolt);

  let raf = 0;
  let last = 0;
  let disposed = false;

  const frame = (t: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    stepSim(sim, input.current, dt, () => bolt(false));
    drawScene(ctx, sim, input.current, sprites);
    if (isBusy(sim, input.current) && !document.hidden) raf = requestAnimationFrame(frame);
    else {
      last = 0;
      if (!isBusy(sim, input.current)) ctx.clearRect(0, 0, sim.W, sim.H);
    }
  };
  const wake = () => {
    if (!raf && !disposed && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };
  const onResize = () => {
    resize();
    sim.streaks = [];
    sim.flakes = [];
    wake();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("resize", onResize);

  return {
    wake,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener("housey:lightning", onBolt);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", wake);
    },
  };
}

/**
 * The dashboard seen through wet glass: rain streaks, gathering drops that run down, snow, fog haze, storm flashes.
 * Driven by the sky's weather; kept in cinema mode, hidden in the Plan editor. Never intercepts input.
 */
export default function RainOverlay() {
  const w = useSky().weather;
  const live = useStore((s) => s.view === "live");
  const lite = useQuality((s) => isLite(s.tier));
  const still = useReducedMotion() || lite; // a full-window 2D canvas redrawn 60 times a second (streaks, drops with trails, fog sprites) is not something Eco can afford: the flat tint stands in for it
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<RainInput>({ kind: "clear", rain: 0, snow: 0, fog: 0, tilt: 0.06, show: 0 });
  const engine = useRef<Engine | null>(null);

  const rain = w.kind === "rain" || w.kind === "storm" ? w.intensity : 0;
  const snow = w.kind === "snow" ? w.intensity : 0;
  const fog = w.kind === "fog" ? w.intensity : 0;
  const side = w.windFrom != null ? -Math.sin((w.windFrom * Math.PI) / 180) : 1; // wind from the west pushes right
  const tilt = (side < 0 ? -0.06 : 0.06) + 0.55 * clamp(w.wind / 12, 0, 1) * side;

  useEffect(() => {
    input.current = { kind: w.kind, rain: live ? rain : 0, snow: live ? snow : 0, fog: live ? fog : 0, tilt, show: live ? 1 : 0 };
    engine.current?.wake();
  }, [w.kind, rain, snow, fog, tilt, live]);

  useEffect(() => {
    if (still || !canvas.current) return;
    const e = createEngine(canvas.current, input);
    if (!e) return;
    engine.current = e;
    e.wake();
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [still]);

  if (still) return <div className="rain-tint" aria-hidden style={{ opacity: live && rain > 0 ? 1 : 0 }} />;
  return <canvas ref={canvas} className="rain-canvas" aria-hidden />;
}
