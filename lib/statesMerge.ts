// Pure: no React, no store (the node test runner loads this file directly).
import type { HAState } from "./ha.ts";
import { isRecord } from "./guards.ts";

/** Equality of two JSON values (what Home Assistant attributes are made of). */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (!isRecord(a) || !isRecord(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => k in b && sameJson(a[k], b[k]));
}

/**
 * The entity map for a fresh list from the server. An entity that did not change keeps its previous object, and when nothing changed at all
 * the previous map itself comes back: subscribers that read one entity (or the whole map) only re-render for a real change.
 */
export function mergeStates(prev: Record<string, HAState>, list: readonly HAState[]): Record<string, HAState> {
  const next: Record<string, HAState> = {};
  let changed = false;
  for (const e of list) {
    const old = prev[e.entity_id];
    if (old && old.state === e.state && old.last_changed === e.last_changed && sameJson(old.attributes, e.attributes)) next[e.entity_id] = old;
    else {
      next[e.entity_id] = e;
      changed = true;
    }
  }
  return changed || Object.keys(prev).length !== Object.keys(next).length ? next : prev;
}

/**
 * A store selector over `states` that recomputes only when the map is a new object. A store runs every subscriber's selector after every `set`
 * (a drag sets dozens of times a second), so a scan of ~1200 entities must not run each time.
 */
export function selectStates<T>(derive: (states: Record<string, HAState>) => T): (s: { states: Record<string, HAState> }) => T {
  let last: Record<string, HAState> | undefined;
  let out: T;
  return (s) => {
    if (s.states !== last) {
      last = s.states;
      out = derive(last);
    }
    return out;
  };
}
