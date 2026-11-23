// Every request this page makes to its own server has a deadline. Without one, a request nobody answers (a wedged server, a half-open Wi-Fi socket, a proxy that
// swallowed it) holds one of the browser's six connections to this host (HTTP/1.1) for as long as the network stack waits, which is minutes. A few of those and every
// later call queues behind them: the readings stop, taps do nothing, the plan stops saving, while the 3D view keeps turning. A request that times out fails like any
// other network error, so the banners and retries that exist already deal with it.

/** A small JSON call (readings, settings, a plan). The server's own limit on Home Assistant is 10 s, so its explanation arrives before this gives up. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** A file going up or down (a car model, a backup) over a slow link. */
export const TRANSFER_TIMEOUT_MS = 120_000;

/** `signal` (when there is one) and the deadline together: whichever comes first aborts the request. */
export const within = (ms: number, signal?: AbortSignal | null): AbortSignal => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

/** Did the deadline of `within` end this request (and not the caller's own abort)? */
export const timedOut = (e: unknown): boolean => e instanceof Error && e.name === "TimeoutError";
