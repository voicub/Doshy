"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useClickAway } from "./useDismiss";

/**
 * A popup menu of radio items opened from a button: closes on a click outside, focuses the checked item when it opens,
 * and handles Up / Down / Home / End (wrapping), Escape (closes and refocuses the button) and Tab (closes).
 * Attach `root` to the wrapper that holds the button and the menu, `btn` to the button, `onMenuKey` to the menu.
 */
export default function usePopupMenu(checkedSelector: string) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useClickAway(root, () => setOpen(false), open);
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>(checkedSelector)?.focus();
  }, [open, checkedSelector]);

  const close = () => { setOpen(false); btn.current?.focus(); };
  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.findIndex((el) => el === document.activeElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };
  return { open, setOpen, root, btn, close, onMenuKey };
}
