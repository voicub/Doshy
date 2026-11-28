import { parseEmbed } from "./embed.ts";

/** `?embed=1` (lib/embed): a read-only view inside another page. It keeps its copy of the plan in sessionStorage, so it never touches the copy the owner's own Doshy tab keeps in localStorage. */
export const embedded = typeof location !== "undefined" && parseEmbed(location.search).embed;

/** The browser's localStorage, guarded: private mode, a full quota and server-side rendering read as "nothing there" and write as "dropped". */
export const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : embedded ? window.sessionStorage : window.localStorage;
  } catch {
    return null; // storage blocked (private mode)
  }
};

export const read = (key: string): string | null => {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const write = (key: string, value: string) => {
  try {
    store()?.setItem(key, value);
  } catch {
    /* full or blocked: the server still gets it */
  }
};

export const forget = (key: string) => {
  try {
    store()?.removeItem(key);
  } catch {
    /* ignore */
  }
};
