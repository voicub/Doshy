"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSync } from "@/lib/syncStatus";
import MonoLabel from "./MonoLabel";

export function size(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

/** A moment as "5 min ago", with the exact date and time on hover. */
export const When = ({ ms }: { ms: number | null }) => (ms == null ? <>none yet</> : <time dateTime={new Date(ms).toISOString()} title={new Date(ms).toLocaleString()}>{ago(ms)}</time>);

/** Inline question. Cancel has focus and Escape cancels; focus goes back to where it was when it closes. */
export function Confirm({ label, text, yes, onYes, onNo }: { label: string; text: string; yes: string; onYes: () => void; onNo: () => void }) {
  const [from] = useState(() => (typeof document === "undefined" ? null : document.activeElement));
  const cancel = useRef<HTMLButtonElement>(null);
  // preventScroll: the app shell is overflow:hidden and would otherwise slide up to show the button
  useEffect(() => cancel.current?.focus({ preventScroll: true }), []);
  useEffect(() => () => { if (from instanceof HTMLElement && from.isConnected) from.focus({ preventScroll: true }); }, [from]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onNo();
  };
  return (
    <div className="dp-confirm" role="alertdialog" aria-label={label} onKeyDown={onKey}>
      <p className="hint">{text}</p>
      <div className="dp-actions">
        <button type="button" className="btn danger" onClick={onYes}>{yes}</button>
        <button type="button" className="btn" ref={cancel} onClick={onNo}>Cancel</button>
      </div>
    </div>
  );
}

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="dp-sec" aria-label={title}>
    <h2 className="dp-h"><MonoLabel>{title}</MonoLabel></h2>
    {children}
  </section>
);

export function SyncLine() {
  const phase = useSync((s) => s.phase);
  const message = useSync((s) => s.message);
  const text = phase === "saving" ? "Saving..." : phase === "offline" ? "Offline, will sync when the server is back" : phase === "error" ? message || "Could not save" : "Saved";
  return <span className={phase === "offline" || phase === "error" ? "dp-bad" : undefined}>{text}</span>;
}
