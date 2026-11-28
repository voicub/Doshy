import type { StateStorage } from "zustand/middleware";

// The guest page (/view/<token>) is a viewer on somebody else's device. It must never read or write the owner's saved plan in that browser (the same browser may be the owner's
// own, opening the link to try it), never sync with the server's database, and never talk to Home Assistant. These helpers tell the rest of the app which page it is on.

/** A guest link's token: 128 bits as base64url (see lib/server/guestSecrets.ts). */
export const GUEST_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** The token in a `/view/<token>` path, or null (also for `/view/` followed by something that is not a token). */
export function guestTokenOf(pathname: string): string | null {
  const m = /^\/view\/([^/]+)\/?$/.exec(pathname);
  return m && GUEST_TOKEN.test(m[1]) ? m[1] : null;
}

/** Is this browser tab on the guest page? Any `/view/...` counts, so even a mistyped address keeps the owner's data out of reach. */
export const onGuestPage = (): boolean => typeof location !== "undefined" && /^\/view(\/|$)/.test(location.pathname);

// One memory for the whole tab, so the guest page can hand a store its data under the store's own key and tell it to read it.
const memory = new Map<string, string>();
const listeners = new Map<string, () => void>();

/** Storage for the persisted store called `name` on the guest page: lives in this tab's memory only, so nothing is read from or written to the browser's saved Doshy data. */
export function guestStorage(name: string): StateStorage & { bind: (onData: () => void) => void } {
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
    bind: (onData) => void listeners.set(name, onData),
  };
}

/** Give the persisted store `name` its data (in zustand's saved shape `{ state, version }`) and tell it to read it. Does nothing for a store that is not on this page. */
export function putGuestDoc(name: string, state: object, version: number): void {
  memory.set(name, JSON.stringify({ state, version }));
  listeners.get(name)?.();
}
