// A tier change throws away the geometries, materials and textures made for the old look. Freeing them at once leaks them: the old meshes are still mounted until React
// has re-rendered with the new look, a frame drawn in between uploads the freed buffer again, and nobody frees it a second time. Freeing a little later, when the old
// meshes are gone, does.

/** How long the old look may still be drawn: the re-render after a tier change finishes well within it, even on a machine that is struggling (that is why the tier changed). */
export const RETIRE_MS = 3000;

type Disposable = { dispose: () => void };

/** Dispose everything in `things` after `ms`. Takes a copy of the list now, so the caller can clear its cache right away. */
export function disposeLater(things: Iterable<Disposable | null | undefined>, ms = RETIRE_MS, schedule: (fn: () => void, ms: number) => unknown = setTimeout): void {
  const list = [...things].flatMap((t) => (t ? [t] : []));
  if (list.length === 0) return;
  schedule(() => {
    for (const t of list) t.dispose();
  }, ms);
}
