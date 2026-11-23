import type { Item } from "@/lib/types";

type ParamValue = NonNullable<Item["params"]>[string];

/** `params` with `changes` applied: a key set to `undefined` is removed, and when nothing is left the result is `undefined`. */
export function withParams(params: Item["params"], changes: Record<string, ParamValue | undefined>): Item["params"] {
  const next: NonNullable<Item["params"]> = {};
  for (const [k, v] of Object.entries({ ...params, ...changes })) if (v !== undefined) next[k] = v;
  return Object.keys(next).length ? next : undefined;
}
