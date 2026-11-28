"use client";
import { useEffect } from "react";
import { isLite, useQuality } from "@/lib/quality";
import "./ui/lite.css";

/** Writes `data-lite="1"` on <html> while the graphics tier is Eco, so components/ui/lite.css can drop the HUD's blur, glows and endless pulses. Renders nothing. */
export default function LiteClass() {
  const lite = useQuality((s) => isLite(s.tier));
  useEffect(() => {
    const root = document.documentElement;
    if (lite) root.setAttribute("data-lite", "1");
    else root.removeAttribute("data-lite");
  }, [lite]);
  return null;
}
