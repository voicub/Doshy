import { isRecord } from "./guards.ts";

/**
 * The pure decisions behind lib/dbClient: how a persisted store value is split between the server's tables, and what to do when the
 * server's copy and this device's copy meet. No I/O here, so every branch is testable.
 */

/** What zustand's persist writes for a store: `{ state, version }`. */
export type Persisted = { state: Record<string, unknown>; version: number };

/** Parse a stored persist value; null when it is missing or not the `{ state, version }` shape. */
export function parsePersisted(text: string | null | undefined): Persisted | null {
  if (!text) return null;
  try {
    return asPersisted(JSON.parse(text));
  } catch {
    return null;
  }
}

/** A persisted value split in two: what stays in settings, and the one big field that has its own table. */
export type Taken = { rest: Persisted; value: unknown };

/** The persisted value without one of its (big) fields, plus that field: `field` goes to its own table, the rest to settings. */
export function takeField(text: string, field: string): Taken | null {
  const p = parsePersisted(text);
  if (!p) return null;
  const { [field]: value, ...state } = p.state;
  return { rest: { state, version: p.version }, value };
}

/**
 * Put a field back into the rest. Without a rest (settings never reached the server) the field alone is used. `version` wins over the rest's when given.
 * The field goes first, as the stores' `partialize` writes it, so a value rebuilt here is the very text persist writes for the same state.
 */
export function putField(rest: Persisted | null, field: string, value: unknown, version = rest?.version ?? 0): string {
  const state = { [field]: value, ...(rest?.state ?? {}) };
  return JSON.stringify({ state, version } satisfies Persisted);
}

/** The server holds settings as parsed JSON: accept it back only when it still has the persist shape. */
export const asPersisted = (v: unknown): Persisted | null => (isRecord(v) && isRecord(v.state) && typeof v.version === "number" ? { state: v.state, version: v.version } : null);

type PlanDecision =
  /** nothing on either side */
  | "none"
  /** the server has no plan and this device does: upload it (the one-time move into the database) */
  | "upload"
  /** already the same revision */
  | "same"
  /** this device has the same plan as the server but never recorded its revision */
  | "adopt"
  /** take the server's plan */
  | "apply"
  /** this device has unsaved edits on top of the latest revision: send them */
  | "push"
  /** both sides changed (or the device has its own never-synced plan): the user decides */
  | "conflict"
  /** this device never synced and has its own plan; the server only has the untouched starter plan: send this device's plan, keeping the server's as a version */
  | "keep-local";

/**
 * What to do with the plan when this device meets the server's copy (at start, and on every poll).
 * `localRev` is the revision this device last synced (null = never). The three `() => boolean` are only asked when they matter:
 * `sameContent` (both plans are the same), `serverPristine` (the server's plan is the untouched starter plan) and `localPristine` (so is this device's).
 *
 * A device that never synced has a plan that may be the only copy of the user's work. It is never silently replaced: it is kept when the server's
 * plan is the untouched starter (the old server plan stays as a version), taken from the server only when it is itself the untouched starter,
 * and otherwise the user decides.
 */
export function decidePlan(i: { serverRev: number; localRev: number | null; hasLocal: boolean; dirty: boolean; sameContent: () => boolean; serverPristine?: () => boolean; localPristine?: () => boolean }): PlanDecision {
  if (i.serverRev === 0) return i.hasLocal ? "upload" : "none";
  if (!i.hasLocal) return "apply";
  if (i.localRev === i.serverRev) return i.dirty ? "push" : "same";
  if (i.localRev === null) {
    if (i.sameContent()) return "adopt"; // a re-saved but unchanged plan is not an edit
    if (i.serverPristine?.()) return "keep-local";
    return i.localPristine?.() ? "apply" : "conflict";
  }
  return i.dirty ? "conflict" : "apply"; // in sync before and the server has moved on: nothing to lose unless there are unsent edits
}

/** A poll answer that is not newer than what this device already knows is ignored; so is one that may predate this device's own save. */
export function decidePoll(i: { serverRev: number; localRev: number | null; dirty: boolean; busy: boolean; staleAnswer: boolean }): "ignore" | "apply" | "conflict" {
  if (i.busy || i.staleAnswer || i.serverRev === i.localRev) return "ignore";
  return i.dirty ? "conflict" : "apply";
}

/** `?plan=<id>` from a URL's query string (a kiosk pinned to one plan): a positive whole number, else null. */
export function parsePlanParam(search: string): number | null {
  const v = new URLSearchParams(search).get("plan");
  return v !== null && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : null;
}

/** The query string with `plan=<id>` set, when the URL already pins a plan (a kiosk); null when it does not, so switching never adds a parameter the owner did not choose. */
export function withPlanParam(search: string, id: number): string | null {
  const q = new URLSearchParams(search);
  if (!q.has("plan")) return null;
  q.set("plan", String(id));
  return `?${q.toString()}`;
}

/**
 * Which plan this device opens at start: the URL's `?plan=`, else the one it chose last (`saved`), else the server's home plan. A choice that no longer
 * exists (deleted elsewhere, a restored backup), or that has no drawing yet and is not the plan whose copy this device holds (`localId`), is skipped;
 * `fellBack` says a plan that was asked for was not used (the screen says so). `plans` are the plans that exist, with their working revision (0 = none yet).
 */
export function pickPlan(i: { param: number | null; saved: number | null; defaultId: number; plans: readonly { id: number; rev: number }[]; localId: number | null }): { id: number; fellBack: boolean } {
  const usable = (id: number) => i.plans.some((p) => p.id === id && (p.rev > 0 || id === i.localId));
  const asked = i.param ?? i.saved;
  const id = [i.param, i.saved, i.defaultId].find((c): c is number => c !== null && usable(c)) ?? i.plans[0]?.id ?? i.defaultId;
  return { id, fellBack: asked !== null && id !== asked };
}

type HasKind = { kind: string };

/**
 * Merge this device's custom pieces with the server's, keeping this device's order. `base` is the kinds that were on the server at the last sync.
 * Not edited here since: the server's copy wins, pieces only this device has (never synced) are kept to be uploaded, pieces gone from the server go.
 * Edited here: this device's copy wins, and a piece in `base` that this device no longer has was deleted here (so it is not brought back).
 * Pieces new on the server come in either way.
 */
export function mergePieces<T extends HasKind>(local: T[], server: T[], base: ReadonlySet<string>, dirty: boolean): T[] {
  const onServer = new Map(server.map((p) => [p.kind, p]));
  const here = new Set(local.map((p) => p.kind));
  const kept = local.flatMap((p) => {
    const theirs = onServer.get(p.kind);
    if (theirs) return [dirty ? p : theirs];
    return base.has(p.kind) ? [] : [p]; // known on the server before and gone now: deleted elsewhere
  });
  return [...kept, ...server.filter((p) => !here.has(p.kind) && !(dirty && base.has(p.kind)))];
}

/** Which pieces to send and which to delete so the server matches `now`. `onServer` maps kind to the JSON text last known there. */
export function diffPieces<T extends HasKind>(now: T[], onServer: ReadonlyMap<string, string>): { put: T[]; remove: string[] } {
  const kinds = new Set(now.map((p) => p.kind));
  return { put: now.filter((p) => onServer.get(p.kind) !== JSON.stringify(p)), remove: [...onServer.keys()].filter((k) => !kinds.has(k)) };
}

/** Wait before retry number `attempt` (0 first): 1 s, 2 s, 4 s ... capped at 30 s. */
export const retryDelay = (attempt: number): number => Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));

/** A browser refuses a keepalive request whose body is over 64 KB; bigger saves wait in the local copy and go out at the next start. */
export const KEEPALIVE_MAX_BYTES = 60_000;

/** The imported 3D model files the given custom pieces use (so they can be checked against the server). */
export const modelIds = (pieces: unknown[]): string[] => [...new Set(pieces.flatMap((p) => (isRecord(p) && isRecord(p.model) && typeof p.model.id === "string" ? [p.model.id] : [])))];
