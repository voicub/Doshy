// One switch for every third-party fetch Doshy's SERVER makes for optional features (Poly Haven assets, terrain and building data...): set
// DOSHY_EXTERNAL_DATA=0 and none of them leaves the machine. Also the one place that says where such downloads are cached on disk.
// Node's type stripping loads this file in tests: .ts import extensions.
import { join, resolve } from "node:path";

/** What the routes say when the switch is off (a 403, with this plain sentence). */
export const EXTERNAL_OFF_MESSAGE = "Downloads from the internet are switched off on this server (DOSHY_EXTERNAL_DATA=0).";

/** On unless the owner set DOSHY_EXTERNAL_DATA to 0, off, false or no. */
export function externalDataEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return !/^(0|off|false|no)$/i.test((env.DOSHY_EXTERNAL_DATA ?? "").trim());
}

/** `<HOUSEY_SITE_CACHE or data/site-cache>/<sub>`: the folder a feature keeps its downloads in (disposable: everything in it can be fetched again). */
export const externalCacheDir = (sub: string, env: Readonly<Record<string, string | undefined>> = process.env): string => resolve(env.HOUSEY_SITE_CACHE || join("data", "site-cache"), sub);
