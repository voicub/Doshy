"use client";
import { useEffect } from "react";

/** Gives focus back to whatever had it before this dialog mounted. Declare it before any effect that moves focus inside. */
export default function useRestoreFocus() {
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => prev?.focus();
  }, []);
}
