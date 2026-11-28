// Browser-safe transport only: no server imports, React, storage or ambient I/O at import time.
import { isRecord } from "./guards.ts";
import { cleanMdiIcon, isMdiName, namesOf, searchTerm, type MdiIcon } from "./mdi.ts";

export type MdiBatch = { icons: Record<string, MdiIcon>; off: boolean };

/** Guests never contact even our proxy. All returned SVG is checked again before entering browser memory. */
export async function fetchMdiBatch(names: readonly string[], guest: boolean, fetchFn: typeof fetch = fetch): Promise<MdiBatch> {
  const valid = [...new Set(names.filter(isMdiName))].slice(0, 40);
  if (guest || !valid.length) return { icons: {}, off: false };
  const res = await fetchFn(`/api/icons/mdi?names=${valid.join(",")}`);
  if (res.status === 403) return { icons: {}, off: true };
  if (!res.ok) throw new Error("Icons could not be downloaded right now.");
  const raw: unknown = await res.json();
  const icons = isRecord(raw) && isRecord(raw.icons) ? raw.icons : {};
  return { icons: Object.fromEntries(valid.flatMap((name) => {
    const icon = Object.hasOwn(icons, name) ? cleanMdiIcon(icons[name]) : null;
    return icon ? [[name, icon]] : [];
  })), off: false };
}

export async function fetchMdiSearch(term: string, guest: boolean, signal?: AbortSignal, fetchFn: typeof fetch = fetch): Promise<string[]> {
  const word = searchTerm(term);
  if (guest || !word) return [];
  const res = await fetchFn(`/api/icons/search?q=${encodeURIComponent(word)}&limit=48`, { signal });
  if (!res.ok) throw new Error(res.status === 403 ? "Icon downloads are switched off on this server." : "Icons could not be searched right now.");
  const raw: unknown = await res.json();
  const names = isRecord(raw) && Array.isArray(raw.names) ? raw.names : [];
  return namesOf(names.filter((n): n is string => typeof n === "string").join(","), 96) ?? [];
}
