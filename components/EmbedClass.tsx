"use client";
import { useEffect } from "react";
import { parseEmbed } from "@/lib/embed";

/** Writes `data-embed` (and `data-embed-interactive`) on <html> when the address says `?embed=1` (lib/embed), so app/embed.css can hide everything but the 3D scene. Renders nothing. */
export default function EmbedClass() {
  useEffect(() => {
    const { embed, interactive } = parseEmbed(location.search);
    if (!embed) return;
    const root = document.documentElement;
    root.setAttribute("data-embed", "1");
    if (interactive) root.setAttribute("data-embed-interactive", "1");
  }, []);
  return null;
}
