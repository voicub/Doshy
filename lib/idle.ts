// Idle timer for the screensaver: "no touch for N minutes" as a small state machine with an injected clock, so it can be tested without waiting.
// One timer, never reset per touch: a touch only records the time, and when the timer fires it re-arms for the time that is left.

export type IdleClock = {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export type Idle = {
  /** Idle time in ms; 0 (or less) turns the timer off and wakes. */
  setTimeout: (ms: number) => void;
  /** Any touch, key or scroll: counts as activity. Ignored while idle (the screensaver itself calls `wake`). */
  poke: () => void;
  /** Leave idle and start counting again. */
  wake: () => void;
  /** Go idle now (the "try it" button). */
  sleep: () => void;
  isIdle: () => boolean;
  stop: () => void;
};

export function createIdle(clock: IdleClock, onChange: (idle: boolean) => void): Idle {
  let ms = 0;
  let last = clock.now();
  let idle = false;
  let handle: unknown = null;

  const set = (v: boolean) => {
    if (idle === v) return;
    idle = v;
    onChange(v);
  };
  const clear = () => {
    if (handle !== null) clock.clearTimer(handle);
    handle = null;
  };
  const fire = () => {
    handle = null;
    if (clock.now() - last >= ms) set(true);
    else arm();
  };
  const arm = () => {
    clear();
    if (ms > 0 && !idle) handle = clock.setTimer(fire, Math.max(0, last + ms - clock.now()));
  };

  return {
    setTimeout(next) {
      ms = next > 0 ? next : 0;
      last = clock.now();
      if (ms === 0) set(false);
      arm();
    },
    poke() {
      if (idle) return;
      last = clock.now();
      if (handle === null) arm();
    },
    wake() {
      last = clock.now();
      set(false);
      arm();
    },
    sleep() {
      clear();
      set(true);
    },
    isIdle: () => idle,
    stop: clear,
  };
}
