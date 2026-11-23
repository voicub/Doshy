"use client";
import { useEffect } from "react";
import { XIcon } from "@phosphor-icons/react";
import { useStore } from "@/lib/store";
import "./Letterbox.css";
import "./compactChrome.css";

const IDLE_MS = 3000;
// Keys that move the camera or are modifiers: they must not end cinema mode.
const KEEP: Record<string, true> = Object.fromEntries(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D", "+", "-", "=", "Shift", "Control", "Alt", "Meta"].map((k) => [k, true]));

/** 2.39:1 letterbox bars, title card, ESC hint, idle cursor hiding and key-to-exit while cinema mode is on. On touch screens (no Esc) an Exit button shows after any touch and fades with the idle timer. */
export default function Letterbox() {
  const cinema = useStore((s) => s.cinema);
  const setCinema = useStore((s) => s.setCinema);

  useEffect(() => {
    if (!cinema) return;
    const armedAt = performance.now(); // ignore the very keystroke that started cinema mode
    const root = document.documentElement;
    let timer = 0;
    const wake = () => {
      root.classList.remove("idle");
      clearTimeout(timer);
      timer = window.setTimeout(() => root.classList.add("idle"), IDLE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.timeStamp < armedAt || e.repeat || KEEP[e.key]) return;
      e.preventDefault();
      setCinema(false);
    };
    wake();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      clearTimeout(timer);
      root.classList.remove("idle");
    };
  }, [cinema, setCinema]);

  return (
    <>
      <div className={`bar top ${cinema ? "on" : ""}`} aria-hidden />
      <div className={`bar bottom ${cinema ? "on" : ""}`} aria-hidden />
      {cinema && (
        <div className="title-card" aria-hidden>
          <span>DOSHY</span>
        </div>
      )}
      <div className={`esc-hint ${cinema ? "on" : ""}`} aria-hidden>ESC</div>
      {cinema && (
        <button type="button" className="cinema-exit" onClick={() => setCinema(false)} aria-label="Leave cinema mode">
          <XIcon size={18} aria-hidden /> Exit
        </button>
      )}
    </>
  );
}
