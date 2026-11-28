"use client";
import { XIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { TIER_LABEL } from "@/lib/quality";
import { useGraphicsNotice } from "./graphicsUi";
import "./graphics.css";

const NOTICE_MS = 14000;

/** Shown after the automatic governor lowered the graphics: says what happened and where to change it. */
export default function GraphicsNotice({ onOpen }: { onOpen: () => void }) {
  const lowered = useGraphicsNotice((s) => s.lowered);
  useEffect(() => {
    if (!lowered) return;
    const t = setTimeout(() => useGraphicsNotice.getState().clear(), NOTICE_MS);
    return () => clearTimeout(t);
  }, [lowered]);
  if (!lowered) return null;
  return (
    <div className="hud brackets gp-notice" role="status">
      <p>{lowered === "godrays" ? "God rays turned off" : `Graphics set to ${TIER_LABEL[lowered]}`} to keep things smooth. Change it in <button type="button" className="gp-link" onClick={() => { useGraphicsNotice.getState().clear(); onOpen(); }}>Graphics</button>.</p>
      <button className="icon-btn" aria-label="Hide this message" onClick={() => useGraphicsNotice.getState().clear()}><XIcon size={14} /></button>
    </div>
  );
}
