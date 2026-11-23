// The pure part of `lib/useVp.ts`: reading the attributes ViewportClass writes on <html> back into a value. Kept apart so the node test runner can load it.
import type { Orientation, Vp } from "./viewport.ts";

export type VpInfo = { vp: Vp; orient: Orientation; coarse: boolean; kiosk: boolean };

/** What the server (and the first client render) assumes: the regular desktop layout. */
export const SERVER_VP: VpInfo = { vp: "regular", orient: "landscape", coarse: false, kiosk: false };

/** Reads the `data-*` attributes through `get` (anything unknown falls back to the desktop value). */
export function parseVpAttrs(get: (name: string) => string | null): VpInfo {
  const vp = get("data-vp");
  const orient = get("data-orient");
  return {
    vp: vp === "tiny" || vp === "small" || vp === "regular" ? vp : SERVER_VP.vp,
    orient: orient === "portrait" || orient === "landscape" ? orient : SERVER_VP.orient,
    coarse: get("data-coarse") === "1",
    kiosk: get("data-kiosk") === "1",
  };
}

export const vpKey = (v: VpInfo): string => `${v.vp}|${v.orient}|${v.coarse ? 1 : 0}|${v.kiosk ? 1 : 0}`;
