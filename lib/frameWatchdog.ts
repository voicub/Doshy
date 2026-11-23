// Has the 3D view stopped drawing? A throw inside a frame callback makes the render loop skip its draw on every screen refresh: the picture freezes for good while the rest of
// the page keeps working (measured: 2 frames in 8 s, 480 uncaught errors). Pure decisions; components/scene/useFrameWatchdog.ts owns the timer.

/** The timer that looks fires this often. */
export const CHECK_MS = 1_000;
/** No frame for this long while the scene should be drawing: it stopped. Far past the idle heartbeat (2 s) and the slowest healthy frame. */
const STALL_MS = 10_000;
/** A look this long after the previous one means the page itself was blocked (a rebuild on a slow machine), not the scene. */
const BLOCKED_MS = 3 * CHECK_MS;
const MAX_WAIT_MS = 5 * 60_000;
/** A stall this long after the previous one is a new problem. */
export const STALL_QUIET_MS = 10 * 60_000;

export type Verdict = "ok" | "blocked" | "stalled";

/** One look at `now`: `lastLook` is the previous look, `lastFrame` the last drawn frame, `waitMs` how long without one counts as stopped. A blocked page gets a fresh start ("blocked"). */
export const verdict = (now: number, lastLook: number, lastFrame: number, waitMs: number): Verdict => (now - lastLook > BLOCKED_MS ? "blocked" : now - lastFrame > waitMs ? "stalled" : "ok");

/** How long to wait for a frame after `n` stalls in a row: 10 s, 20 s, 40 s ... up to 5 minutes, so a stall that is not cured by building the view again does not rebuild it in a loop. */
export const stallWaitMs = (n: number): number => Math.min(STALL_MS * 2 ** n, MAX_WAIT_MS);
