// Type guards for values that arrive untyped (JSON from Home Assistant, storage, the network, request bodies). Narrow with these instead of casting.

/** A plain JSON object: not null, not an array. */
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The text of a caught value (a `catch` binding is `unknown`: anything can be thrown). */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
