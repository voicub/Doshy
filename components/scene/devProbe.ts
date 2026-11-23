// Dev-only window.__scene: the renderer and post stack, for measuring a frame in the browser console (per-pass cost, frames per second). Nothing in production.
type Probe = Record<string, unknown>;
declare global {
  interface Window {
    __scene?: Probe;
  }
}

export function probe(patch: Probe): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  window.__scene = { ...window.__scene, ...patch };
}
