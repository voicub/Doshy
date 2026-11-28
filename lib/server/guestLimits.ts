// In-memory limits for the guest routes: a request counter and a wrong-PIN lockout. Every Map is bounded (a client inventing keys cannot grow it) and the clock is
// passed in, so the logic is tested without waiting. They live in this process only: a restart clears them (a lockout is 15 minutes, a restart is rarer than that).

type Window = { start: number; n: number };
type Fails = { first: number; n: number; until: number };

/** Keeps `map` below `max`: expired entries go first, then the oldest (a Map remembers insertion order). */
function trim<V>(map: Map<string, V>, max: number, expired: (v: V) => boolean): void {
  if (map.size < max) return;
  for (const [k, v] of map) if (expired(v)) map.delete(k);
  while (map.size >= max) {
    const oldest = map.keys().next();
    if (oldest.done) return;
    map.delete(oldest.value);
  }
}

export type RateLimit = { /** false when `key` has used up its requests in this window */ allow: (key: string, now: number) => boolean };

/** At most `max` requests per `windowMs` for each key (a fixed window). */
export function createRateLimit({ max, windowMs, maxKeys }: { max: number; windowMs: number; maxKeys: number }): RateLimit {
  const windows = new Map<string, Window>();
  return {
    allow(key, now) {
      let w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        if (!w) trim(windows, maxKeys, (v) => now - v.start >= windowMs);
        w = { start: now, n: 0 };
        windows.set(key, w);
      }
      return ++w.n <= max;
    },
  };
}

export type Lockout = {
  /** Milliseconds this key is still locked out for, 0 when it may try. */
  locked: (key: string, now: number) => number;
  /** Count a wrong try. Returns how many tries are left before the lockout starts (0 = it has just started). */
  fail: (key: string, now: number) => number;
  /** A correct try: forget the wrong ones. */
  clear: (key: string) => void;
};

/** `maxFails` wrong tries within `windowMs` lock the key out for `lockMs`. */
export function createLockout({ maxFails, windowMs, lockMs, maxKeys }: { maxFails: number; windowMs: number; lockMs: number; maxKeys: number }): Lockout {
  const fails = new Map<string, Fails>();
  const over = (f: Fails, now: number) => f.until <= now && now - f.first >= windowMs;
  return {
    locked(key, now) {
      const f = fails.get(key);
      return f && f.until > now ? f.until - now : 0;
    },
    fail(key, now) {
      let f = fails.get(key);
      if (!f || over(f, now)) {
        if (!f) trim(fails, maxKeys, (v) => over(v, now));
        f = { first: now, n: 0, until: 0 };
        fails.set(key, f);
      }
      if (f.until > now) return 0; // already locked: a try during a lockout does not extend it
      if (++f.n >= maxFails) f.until = now + lockMs;
      return Math.max(0, maxFails - f.n);
    },
    clear: (key) => void fails.delete(key),
  };
}

const MINUTE = 60_000;
/** Wrong PINs: 5 from one address for one link, then 15 minutes. And 25 for one link from anywhere (addresses can be forged or rotated), then 15 minutes. */
export const PIN_TRIES_PER_ADDRESS = 5;
export const PIN_TRIES_PER_LINK = 25;
export const PIN_LOCK_MS = 15 * MINUTE;

export type GuestLimits = {
  /** every guest request, per address */
  requests: RateLimit;
  /** requests with a token that matches no link, per address (scanning) */
  unknown: RateLimit;
  /** 3D model downloads, per address */
  files: RateLimit;
  pinByAddress: Lockout;
  pinByLink: Lockout;
};

export function createGuestLimits(): GuestLimits {
  return {
    requests: createRateLimit({ max: 240, windowMs: MINUTE, maxKeys: 2000 }),
    unknown: createRateLimit({ max: 20, windowMs: MINUTE, maxKeys: 2000 }),
    files: createRateLimit({ max: 60, windowMs: MINUTE, maxKeys: 2000 }),
    pinByAddress: createLockout({ maxFails: PIN_TRIES_PER_ADDRESS, windowMs: PIN_LOCK_MS, lockMs: PIN_LOCK_MS, maxKeys: 2000 }),
    pinByLink: createLockout({ maxFails: PIN_TRIES_PER_LINK, windowMs: PIN_LOCK_MS, lockMs: PIN_LOCK_MS, maxKeys: 500 }),
  };
}

// On globalThis so Next's dev hot reload (which re-evaluates modules) does not hand an attacker a fresh set of tries.
const g = globalThis as typeof globalThis & { __doshyGuestLimits?: GuestLimits };
export const guestLimits = (): GuestLimits => (g.__doshyGuestLimits ??= createGuestLimits());

/**
 * Who is asking. Next hands a route no socket address, so this is what the reverse proxy says: the LAST `X-Forwarded-For` entry (the one the nearest proxy added; the
 * first can be written by the client), else `X-Real-IP`, else one shared "unknown" bucket (then the per-link limit is what protects the PIN).
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(forwarded) ? forwarded.toLowerCase() : "unknown";
}
