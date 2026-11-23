"use client";
import { useSyncExternalStore } from "react";
import { parseVpAttrs, SERVER_VP, vpKey, type VpInfo } from "./vpAttrs.ts";

// The compact-layout attributes ViewportClass writes on <html> (see lib/viewport.ts), as React state. Prefer CSS (`html[data-vp="tiny"] .x`); use this only when markup has to differ.
let cache: { key: string; value: VpInfo } = { key: vpKey(SERVER_VP), value: SERVER_VP };

function snapshot(): VpInfo {
  const root = document.documentElement;
  const next = parseVpAttrs((n) => root.getAttribute(n));
  const key = vpKey(next);
  if (key !== cache.key) cache = { key, value: next };
  return cache.value; // same object while nothing changed: useSyncExternalStore needs a stable snapshot
}

function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-vp", "data-orient", "data-coarse", "data-kiosk"] });
  return () => mo.disconnect();
}

/** `{ vp, orient, coarse, kiosk }` from <html>; the regular desktop values on the server and before ViewportClass has run. */
export function useVp(): VpInfo {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_VP);
}

export type { VpInfo };
