// Screen Wake Lock: keeps a wall display from blanking. The browser drops the lock whenever the tab is hidden, so it is asked for again when the tab is shown.
// The browser API is injected (`navigator.wakeLock`, or undefined on plain http and older browsers) so the logic can be tested.

export type WakeSentinel = { release: () => Promise<void>; addEventListener: (type: "release", fn: () => void) => void };
export type WakeApi = { request: (type: "screen") => Promise<WakeSentinel> };
/** unsupported: no API here (needs https or localhost). off: not held. on: held. blocked: the browser refused (battery saver, permission). */
export type WakeStatus = "unsupported" | "off" | "on" | "blocked";

export type WakeLock = {
  /** Start or stop wanting the lock. */
  set: (on: boolean) => Promise<void>;
  /** The tab became visible again: take the lock back if it is wanted and was lost. */
  resume: () => Promise<void>;
};

export function createWakeLock(api: WakeApi | undefined, visible: () => boolean, onStatus: (s: WakeStatus) => void): WakeLock {
  let wanted = false;
  let held: WakeSentinel | null = null;
  let queue: Promise<void> = Promise.resolve();

  const run = async () => {
    if (!api) return onStatus("unsupported");
    if (!wanted) {
      const h = held;
      held = null;
      if (h) await h.release().catch(() => {});
      return onStatus("off");
    }
    if (held) return onStatus("on");
    if (!visible()) return onStatus("off");
    try {
      const s = await api.request("screen");
      if (!wanted) {
        await s.release().catch(() => {});
        return onStatus("off");
      }
      held = s;
      s.addEventListener("release", () => {
        if (held !== s) return;
        held = null;
        onStatus("off");
      });
      onStatus("on");
    } catch {
      onStatus("blocked");
    }
  };
  const sync = () => (queue = queue.then(run));

  return {
    set(on) {
      wanted = on;
      return sync();
    },
    resume: () => (wanted && !held ? sync() : Promise.resolve()),
  };
}
