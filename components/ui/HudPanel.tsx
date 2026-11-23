"use client";
import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import MonoLabel from "./MonoLabel";
import { SheetGrab, useSheet } from "./Sheet";

/** Primary panel: dark glass, hairline border, corner brackets, optional mono header with close. On compact screens the editing panels become sheets (Sheet.tsx, sheet.css). */
export default function HudPanel({ title, meta, onClose, className = "", children }: { title: string; meta?: ReactNode; onClose?: () => void; className?: string; children: ReactNode }) {
  const { ref, state, grab } = useSheet(onClose);
  return (
    <aside ref={ref} className={`hud brackets ${className}`} aria-label={title} data-sheet={state}>
      <SheetGrab state={state} grab={grab} />
      <header className="hud-head">
        <MonoLabel>{title}</MonoLabel>
        {meta && <span className="hud-meta">{meta}</span>}
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
            <XIcon size={14} />
          </button>
        )}
      </header>
      {children}
    </aside>
  );
}
