import { create } from "zustand";
import type { StashEntry } from "./planStash.ts";

/** What the Saved / Offline glyph, the "two versions" choice and the "we kept your previous plan" banner show. Written by lib/dbClient (and the model uploads); read by components/ui/SyncStatus. */
type SyncPhase = "idle" | "saving" | "saved" | "offline" | "error";

/** One side of a conflict, in words a person can compare: how much is in it and when it last changed (null = unknown). */
export type PlanPreview = { items: number; walls: number; rooms: number; at: number | null };

/** The server holds a different plan than this device (or this device has edits the server has not seen): the user picks. */
type PlanConflict = { server: PlanPreview; local: PlanPreview };

type SyncState = {
  phase: SyncPhase;
  /** plain-language reason when phase is "error" */
  message: string;
  conflict: PlanConflict | null;
  /** a plan this device kept when it was about to be replaced and the user has not dealt with yet (null = none) */
  stash: StashEntry | null;
  /** when the last save reached the server (ms) */
  savedAt: number | null;
};

export const useSync = create<SyncState>()(() => ({ phase: "idle", message: "", conflict: null, stash: null, savedAt: null }));

export const setPhase = (phase: SyncPhase, message = "") => useSync.setState(phase === "saved" ? { phase, message, savedAt: Date.now() } : { phase, message });
