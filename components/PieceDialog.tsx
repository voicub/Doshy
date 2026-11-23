"use client";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./pieceBuilder.css";

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select, [href], [tabindex="0"]';

/**
 * Modal shell for the "add your own piece" flows. Rendered in document.body (the drawer's blur would otherwise trap a fixed box),
 * keeps Tab inside, closes on Escape, hands focus back to what opened it, and swallows keys so the editor's own shortcuts
 * (Delete, Ctrl+Z) never act on the plan behind it.
 */
export default function PieceDialog({ title, onClose, onKey, children }: { title: string; onClose: () => void; onKey?: (e: KeyboardEvent<HTMLDivElement>) => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement.dataset;
    // a finger: focus the dialog itself, a focused text field would pop the on-screen keyboard over the form before it was read
    if (root.coarse === "1" || root.vp !== "regular") box.current?.focus();
    else box.current?.querySelector<HTMLElement>("input:not([type=file]):not([type=color])")?.focus();
    return () => opener?.focus?.();
  }, []);

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Tab" && box.current) {
      const list = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
      return;
    }
    onKey?.(e);
  };

  return createPortal(
    <div className="pd-scrim" onKeyDown={keys} onKeyUp={(e) => e.stopPropagation()}>
      <div ref={box} className="hud brackets pd-box" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="hud-head">
          <span className="label pd-title">{title}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
