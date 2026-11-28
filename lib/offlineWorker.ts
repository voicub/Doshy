import { create } from "zustand";
import { CACHE_PREFIX, workerUrl } from "./swRules";

/**
 * Registers the offline service worker (public/sw.js) in production builds only, and drives its update and clear-cache controls.
 * The worker cannot run in `next dev` (a stale worker would serve old files while editing), and does not run on plain http except on localhost. See docs/offline.md.
 */

const VERSION = process.env.NEXT_PUBLIC_DOSHY_VERSION ?? "dev";
const UPDATE_CHECK_MS = 60 * 60 * 1000; // a kiosk may never navigate: ask for a new worker once an hour

/** `waiting`: a newer worker has installed and is waiting for "Reload". */
export const useWorkerUi = create<{ waiting: ServiceWorker | null }>(() => ({ waiting: null }));

/** False on plain http (outside localhost), in old browsers and on the server: the Display row and the worker are then absent. */
export const workerSupported = (): boolean => typeof navigator !== "undefined" && "serviceWorker" in navigator;

const isDoshyWorker = (r: ServiceWorkerRegistration): boolean => [r.active, r.waiting, r.installing].some((w) => w !== null && new URL(w.scriptURL).pathname === "/sw.js");

/** Unregister Doshy's worker and delete every Doshy cache. Other sites' workers and caches are not touched (ours are named `doshy-*`). */
async function removeWorker(): Promise<void> {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.filter(isDoshyWorker).map((r) => r.unregister()));
  for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
}

/** Display > "Clear offline cache": the way out if a cached copy ever misbehaves. The page reloads without a worker; a production build registers a fresh one. */
export async function clearOfflineCache(): Promise<void> {
  if (!workerSupported()) return;
  await removeWorker();
  location.reload();
}

/** The user tapped "Reload": the waiting worker takes over, and the page reloads once when it has. */
export function applyUpdate(): void {
  const waiting = useWorkerUi.getState().waiting;
  if (!waiting) return;
  let reloaded = false;
  // Added only now: the first install also fires `controllerchange` (the new worker claims the page), which must not reload anything.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  waiting.postMessage({ type: "SKIP_WAITING" });
}

function watch(reg: ServiceWorkerRegistration): void {
  // Offer an update only when a worker already controls this page: on the very first install there is nothing to replace.
  const offer = () => {
    if (reg.waiting && navigator.serviceWorker.controller) useWorkerUi.setState({ waiting: reg.waiting });
  };
  offer();
  reg.addEventListener("updatefound", () => {
    const next = reg.installing;
    next?.addEventListener("statechange", () => {
      if (next.state === "installed") offer();
    });
  });
  setInterval(() => void reg.update().catch(() => undefined), UPDATE_CHECK_MS);
}

let started = false;

/** Called once from the dashboard. Production: register. Development: remove a worker an earlier production run left on this address, so hot reload is never served from a cache. */
export async function startOfflineWorker(): Promise<void> {
  if (started || !workerSupported()) return;
  started = true;
  try {
    if (process.env.NODE_ENV !== "production") return await removeWorker();
    watch(await navigator.serviceWorker.register(workerUrl(VERSION), { scope: "/" }));
  } catch {
    /* no worker (private window, blocked storage): the app works as it always did */
  }
}
