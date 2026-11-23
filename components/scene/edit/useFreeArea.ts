"use client";
import { useEffect, useMemo, useState } from "react";
import { useVp } from "@/lib/useVp";
import { freeArea, mergeInsets, NO_INSETS, type Box, type Insets } from "@/lib/viewInset";
import { panelInsets, useInsets } from "./insetStore";

/** The height (px) a CSS length resolves to inside `.app` (var(), calc() and env() included). */
function px(length: string): number {
  const host = document.querySelector(".app");
  if (!host) return 0;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:0;height:${length}`;
  host.appendChild(probe);
  const h = probe.offsetHeight;
  probe.remove();
  return h;
}

/** The strip and the bottom bars the chrome keeps over the canvas on compact screens. */
const barInsets = (): Insets => ({ ...NO_INSETS, top: px("var(--strip-h, 44px)"), bottom: px("calc(var(--dock-h, 56px) + var(--tools-h, 0px))") });

/** What the top strip and the bottom bars cover; nothing on bigger screens. Follows rotation and the edit strip appearing (it sets --tools-h on <html>). */
export function useBarInsets(): Insets {
  const { vp } = useVp();
  const [bars, setBars] = useState<Insets>(NO_INSETS);
  useEffect(() => {
    if (vp === "regular") return void setBars(NO_INSETS);
    const measure = () => setBars(barInsets());
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-orient"] });
    addEventListener("resize", measure);
    return () => {
      mo.disconnect();
      removeEventListener("resize", measure);
    };
  }, [vp]);
  return bars;
}

/** What the bars and the open panels cover together on a `w` x `h` canvas, and the part that stays visible. Compact screens only. */
export function useFreeArea(w: number, h: number): { insets: Insets; panel: Insets; free: Box } {
  const { vp } = useVp();
  const bars = useBarInsets();
  const reports = useInsets((s) => s.reports);
  const panel = useMemo(() => panelInsets(reports), [reports]);
  const insets = useMemo(() => (vp !== "regular" ? mergeInsets([bars, panel]) : NO_INSETS), [vp, bars, panel]);
  const free = useMemo(() => freeArea(w, h, insets), [w, h, insets]);
  return { insets, panel, free };
}
