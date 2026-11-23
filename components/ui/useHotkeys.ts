"use client";
import { useEffect, useRef } from "react";
import { useStore, VIEWS } from "@/lib/store";
import { findLevel, sortedLevels } from "@/lib/levels";
import { TOOLS } from "./Dock";
import { isTypingTarget } from "./isTypingTarget";
import { cycleTime, cycleWeather, setTimeChoice } from "./skyControls";

type Handlers = { palette: () => void; help: () => void; catalog: () => void; modalOpen: boolean };

/** Window-level shortcuts. Cinema mode and open dialogs own the keyboard themselves; Editor2D keeps R / Delete / Escape. */
export default function useHotkeys(h: Handlers) {
  const ref = useRef(h);
  useEffect(() => { ref.current = h; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { palette, help, catalog, modalOpen } = ref.current;
      const s = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!s.cinema) palette();
        return;
      }
      // Alt+1..4 jump to LIVE / PLAN / FURNITURE / HA (e.code: Alt changes the typed character on macOS)
      if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[1-4]$/.test(e.code) && !modalOpen && !s.cinema && !isTypingTarget(e.target)) {
        e.preventDefault();
        s.setView(VIEWS[Number(e.code.slice(5)) - 1]);
        return;
      }
      if (modalOpen || s.cinema || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "PageUp" || e.key === "PageDown") {
        // furniture mode owns PageUp/PageDown for the selected item's height
        if (s.view === "furniture" && s.sel) return;
        const ids = sortedLevels(s.plan).map((l) => l.id);
        const i = ids.indexOf(findLevel(s.plan, s.activeLevel).id);
        const next = ids[Math.min(ids.length - 1, Math.max(0, i + (e.key === "PageUp" ? 1 : -1)))];
        if (ids.length > 1 && next !== undefined) { e.preventDefault(); s.setActiveLevel(next); }
        return;
      }
      const k = e.key.toLowerCase();
      if (e.key === "/") { e.preventDefault(); palette(); }
      else if (e.key === "?") help();
      else if (e.key === "Escape") { if (s.view === "live" && s.focusRoom) s.setFocusRoom(null); }
      else if (k === "c") { s.setView("live"); s.setCinema(true); }
      else if (k === "v") s.setView(VIEWS[(VIEWS.indexOf(s.view) + 1) % VIEWS.length]);
      else if (k === "t") cycleTime();
      else if (k === "a") setTimeChoice("auto");
      else if (k === "w") cycleWeather();
      else if (k === "g") s.setEnvironment(s.environment === "studio" ? "garden" : "studio");
      else if (k === "x" && s.view === "live") s.setCutaway(!s.cutaway);
      else if (k === "f" && s.view === "furniture") { e.preventDefault(); catalog(); }
      else if (k === "b" && (s.view === "plan" || s.view === "furniture")) s.setTool(s.tool === "paint" ? "select" : "paint");
      else if (s.view === "plan" && /^[1-9]$/.test(e.key)) s.setTool(TOOLS[Number(e.key) - 1].tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
