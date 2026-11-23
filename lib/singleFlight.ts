/** `task` as a function whose overlapping calls share the one run in progress (they all get its result); a call after it settles, failed or not, starts a new run. */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () =>
    (running ??= task().finally(() => {
      running = null;
    }));
}
