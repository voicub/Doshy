// Coming back by itself. A wall display has nobody to press "Try again", so a screen that crashed, or a 3D view that stopped drawing, starts again on its own,
// quickly the first time and ever more slowly while the same problem keeps coming back (a reading that makes it crash every time must not make it crash in a loop).

/** How often something went wrong in a row: `n` counts from 0, `at` is when it last did. */
export type Streak = { n: number; at: number };

/** The streak after something went wrong at `now`: one more in a row, or a fresh one when the previous problem was more than `quietMs` ago (that is a new problem). */
export const nextStreak = (prev: Streak | null, now: number, quietMs: number): Streak => ({ n: prev && now - prev.at < quietMs ? prev.n + 1 : 0, at: now });

/** Pause before starting again after a crash, by how many came in a row; a problem that stays is retried once a minute. */
const CRASH_RETRY_MS = [3_000, 10_000, 30_000, 60_000] as const;
export const crashRetryMs = (n: number): number => CRASH_RETRY_MS[Math.min(n, CRASH_RETRY_MS.length - 1)];
/** Longer than the longest retry pause: crashes this far apart are different problems. */
export const CRASH_QUIET_MS = 120_000;
