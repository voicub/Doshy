// The one switch that makes the app read-only while the history is replayed. Pure and dependency-free (lib/ha.ts imports it, so it must never import the store).
import type { HAState } from "./ha.ts";
import { onGuestPage } from "./guestMode.ts";

export const REPLAY_OFF = "Replay mode: controls are off";
export const GUEST_OFF = "This is a read-only view: controls are off";

let replaying = false;
let freshest: readonly HAState[] | null = null;

export const isReplaying = (): boolean => replaying;

/** Called by lib/replay.ts only. Leaving replay also forgets nothing: `takeLatestPoll` still holds what polls brought meanwhile. */
export function setReplaying(on: boolean): void {
  replaying = on;
}

/** Every call that would write to Home Assistant starts with this: it throws while a replay is showing, and always on the guest page. */
export function assertLive(): void {
  if (onGuestPage()) throw new Error(GUEST_OFF);
  if (replaying) throw new Error(REPLAY_OFF);
}

/** The states poll keeps running during a replay but must not touch the screen: it parks its newest list here for the moment the replay ends. */
export function rememberPoll(list: readonly HAState[]): void {
  freshest = list;
}

/** The newest list a poll brought while replaying (once), or null. */
export function takeLatestPoll(): readonly HAState[] | null {
  const list = freshest;
  freshest = null;
  return list;
}
